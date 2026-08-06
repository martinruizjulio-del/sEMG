from __future__ import annotations

import json

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Subject, AnalysisSession, AnalysisResult
from app.routers.auth import get_current_user
from app.schemas.analyze import AnalyzeRequest, AnalyzeResponse, ChannelAnalysisOut
from app.parsers.asc_parser import parse_asc
from app.parsers.emt_parser import parse_emt
from app.parsers.csv_txt_parser import parse_tabular
from app.processing.filters import FilterSpec, apply_filter
from app.processing.rms import rms_emg
from app.processing.peaks import detect_peaks, PeakParams
from app.processing.frequency import dominant_frequency
from app.processing.fatigue import calculate_fatigue
from app.core.naming import slugify_variable_name, base_muscle_name

# Métricas de amplitud sobre las que tiene sentido calcular ratio
# bilateral y normalización de activación (no aplica a frecuencia,
# fatiga, nº de picos o lapso).
_AMPLITUDE_METRICS = {"media", "maximo", "mediana"}

router = APIRouter(prefix="/desktops", tags=["analyze"], dependencies=[Depends(get_current_user)])
preview_router = APIRouter(tags=["analyze"], dependencies=[Depends(get_current_user)])


def _decimate(values: np.ndarray, max_points: int = 1500) -> list:
    n = len(values)
    if n == 0:
        return []
    if n <= max_points:
        return [float(v) for v in values]
    step = n / max_points
    idx = (np.arange(max_points) * step).astype(int)
    return [float(v) for v in values[idx]]


def _parse_file(filename: str, raw_bytes: bytes):
    """Devuelve (fs, channel_names, data[muestras x canales]) según el formato."""
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw_bytes.decode("latin-1", errors="ignore")

    name = filename.lower()
    if name.endswith(".asc"):
        parsed = parse_asc(text)
        return parsed.fs, parsed.channel_names, parsed.data
    if name.endswith(".emt"):
        parsed = parse_emt(text)
        return parsed.fs, parsed.channel_names, parsed.data_uv
    parsed = parse_tabular(text)
    # Sin frecuencia de muestreo conocida en CSV/TXT genérico: 1000Hz por defecto,
    # ajustable más adelante si el usuario la indica en el formulario.
    return 1000.0, parsed.column_names, parsed.data


def _processed_signal(channel_data: np.ndarray, sensor_type: str, fs: float, rms_num_points: int):
    """Pipeline de procesado según el tipo de sensor.

    Devuelve (filtered, processed):
      - filtered: señal tras el filtro correspondiente, SIN rectificar (se
        usa para frecuencia dominante y fatiga, que necesitan el contenido
        espectral real de la señal, no una envolvente siempre positiva).
      - processed: señal usada para media/máximo/mediana/picos (para EMG
        es la envolvente RMS, igual que en Slider.m / analizar_picos_EMG.m).
    """
    spec = FilterSpec(channel_type=sensor_type, fs=fs)
    filtered = apply_filter(channel_data, spec)
    filtered = filtered.ravel() if filtered.ndim > 1 else filtered

    if sensor_type == "emg":
        processed = rms_emg(filtered, num_points=rms_num_points).ravel()
    else:
        processed = filtered

    return filtered, processed


@router.post("/{desktop_id}/subjects/{subject_id}/analyze", response_model=AnalyzeResponse)
async def analyze_file(
    desktop_id: int,
    subject_id: int,
    config: str = Form(...),  # JSON string de AnalyzeRequest
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    subject = db.get(Subject, subject_id)
    if not subject or subject.desktop_id != desktop_id:
        raise HTTPException(404, "Sujeto no encontrado en este escritorio")

    try:
        request = AnalyzeRequest(**json.loads(config))
    except Exception as exc:
        raise HTTPException(400, f"Configuración de análisis inválida: {exc}")

    raw_bytes = await file.read()
    fs, detected_names, data = _parse_file(file.filename, raw_bytes)
    # El archivo original NUNCA se guarda en disco: solo vive en memoria
    # durante esta petición y se descarta al terminar (según lo pedido).

    session = None
    if request.save_results:
        default_label = file.filename.rsplit(".", 1)[0] if file.filename else "Análisis"
        session = AnalysisSession(subject_id=subject_id, label=request.session_label or default_label)
        db.add(session)
        db.flush()  # asigna session.id sin cerrar la transacción

    if data.ndim == 1:
        data = data.reshape(-1, 1)

    channels_out: list[ChannelAnalysisOut] = []
    # Guardamos aparte los datos crudos necesarios para los cálculos
    # ENTRE canales (ratio bilateral, normalización), que solo se
    # pueden hacer una vez conocidos los valores de TODOS los canales.
    channel_records: list[dict] = []

    peak_cfg = request.peak_config
    min_dist_samples = None
    if peak_cfg and peak_cfg.min_peak_distance_ms is not None:
        min_dist_samples = int((peak_cfg.min_peak_distance_ms / 1000.0) * fs)

    for ch in request.channels:
        if ch.index >= data.shape[1]:
            raise HTTPException(400, f"Canal índice {ch.index} fuera de rango (el archivo tiene {data.shape[1]} canales)")

        label = ch.label or (detected_names[ch.index] if ch.index < len(detected_names) else f"canal_{ch.index}")
        raw_channel = data[:, ch.index]

        processed_filtered, processed = _processed_signal(raw_channel, ch.sensor_type, fs, request.rms_num_points)

        metrics: dict = {}
        variable_names: dict = {}
        peak_indices, peak_times = None, None

        for calc in request.calculations:
            if calc == "media":
                metrics["media"] = float(np.mean(processed))
            elif calc == "maximo":
                metrics["maximo"] = float(np.max(np.abs(processed)))
            elif calc == "mediana":
                metrics["mediana"] = float(np.median(processed))
            elif calc == "picos":
                params = PeakParams(
                    n_peaks=peak_cfg.n_peaks if peak_cfg else None,
                    min_peak_height=peak_cfg.min_peak_height if peak_cfg else None,
                    min_peak_distance_samples=min_dist_samples,
                )
                result = detect_peaks(processed, fs=fs, params=params)
                peak_indices = result.indices.tolist()
                peak_times = result.times_ms.tolist()
                metrics["num_picos"] = len(peak_indices)
                # Lapso: diferencia entre el pico más tardío y el más
                # temprano DENTRO de este archivo (no compara con otros
                # archivos -eso se decide luego, al elegir qué sesión
                # incluir en la matriz de datos final-).
                if peak_times:
                    metrics["lapso_ms"] = max(peak_times) - min(peak_times)
            elif calc == "frecuencia":
                metrics["frecuencia_dominante_hz"] = dominant_frequency(processed_filtered, fs=fs)
            elif calc == "fatiga":
                fat = calculate_fatigue(processed_filtered, fs=fs)
                metrics["fatiga_pendiente_hz_s"] = fat.slope_hz_per_s
                metrics["fatiga_indice_pct"] = fat.fatigue_index_pct
            # "ratio_bilateral" y "normalizacion" se calculan aparte, más
            # abajo, una vez conocidos los valores de todos los canales.

        channel_records.append({
            "index": ch.index, "label": label, "side": ch.side, "metrics": metrics,
        })
        channels_out.append(ChannelAnalysisOut(
            channel_label=label,
            side=ch.side,
            sensor_type=ch.sensor_type,
            metrics=metrics,
            peak_indices=peak_indices,
            peak_times_ms=peak_times,
            variable_names=variable_names,  # se rellena más abajo, tras añadir los derivados
        ))

    # --- Cálculos ENTRE canales (necesitan los valores de todos) ---

    if "ratio_bilateral" in request.calculations:
        _add_bilateral_ratios(channel_records)

    if "normalizacion" in request.calculations:
        _add_activation_normalization(channel_records)

    # --- Generar nombres de variable definitivos y guardar en BD ---

    saved_variable_names: set[str] = set()
    for rec, ch_out in zip(channel_records, channels_out):
        for metric_name, value in rec["metrics"].items():
            if metric_name.startswith("ratio_bilateral_"):
                # Valor compartido por el par R/L: un nombre de variable
                # único (sin lado) y se guarda una sola vez, no por cada
                # canal del par.
                var_name = slugify_variable_name(base_muscle_name(rec["label"]), metric_name)
                dedupe_key = var_name
            else:
                var_name = slugify_variable_name(rec["label"], rec["side"] or "", metric_name)
                dedupe_key = f"{rec['index']}:{var_name}"

            ch_out.variable_names[metric_name] = var_name
            if request.save_results and dedupe_key not in saved_variable_names:
                saved_variable_names.add(dedupe_key)
                db.add(AnalysisResult(
                    subject_id=subject_id,
                    session_id=session.id,
                    variable_name=var_name,
                    channel_label=base_muscle_name(rec["label"]) if metric_name.startswith("ratio_bilateral_") else rec["label"],
                    metric=metric_name,
                    value=float(value),
                    unit=None,
                ))
        ch_out.metrics = rec["metrics"]  # incluye ya los derivados (ratio_bilateral_*, pct_activacion_*)

    if request.save_results:
        db.commit()

    return AnalyzeResponse(
        fs=fs,
        n_samples=data.shape[0],
        channels=channels_out,
        session_id=session.id if session else None,
        session_label=session.label if session else None,
    )


def _add_bilateral_ratios(channel_records: list[dict]) -> None:
    """Para cada par de canales del mismo grupo muscular (mismo nombre
    base, uno R y otro L), añade 'ratio_bilateral_<metrica>' = R / L a
    AMBOS canales del par, para cada métrica de amplitud presente en
    los dos (media/máximo/mediana)."""
    by_base: dict[str, dict[str, dict]] = {}
    for rec in channel_records:
        if rec["side"] not in ("R", "L"):
            continue
        base = base_muscle_name(rec["label"])
        by_base.setdefault(base, {})[rec["side"]] = rec

    for base, sides in by_base.items():
        if "R" not in sides or "L" not in sides:
            continue  # solo se puede calcular si están los dos lados
        rec_r, rec_l = sides["R"], sides["L"]
        shared_metrics = _AMPLITUDE_METRICS & set(rec_r["metrics"]) & set(rec_l["metrics"])
        for metric_name in shared_metrics:
            val_r, val_l = rec_r["metrics"][metric_name], rec_l["metrics"][metric_name]
            if val_l == 0:
                continue  # evitar división por cero
            ratio = val_r / val_l
            rec_r["metrics"][f"ratio_bilateral_{metric_name}"] = ratio
            rec_l["metrics"][f"ratio_bilateral_{metric_name}"] = ratio


def _add_activation_normalization(channel_records: list[dict]) -> None:
    """Para cada métrica de amplitud, calcula qué % representa cada
    canal sobre el total sumado entre TODOS los canales analizados en
    este archivo -normalización de activación-."""
    for metric_name in _AMPLITUDE_METRICS:
        values = [
            (rec, rec["metrics"][metric_name])
            for rec in channel_records
            if metric_name in rec["metrics"]
        ]
        if len(values) < 2:
            continue  # no tiene sentido normalizar un único canal
        total = sum(abs(v) for _, v in values)
        if total == 0:
            continue
        for rec, v in values:
            rec["metrics"][f"pct_activacion_{metric_name}"] = (abs(v) / total) * 100.0


@preview_router.post("/channel-preview")
async def channel_preview(
    channels: str = Form(...),  # JSON: [{"index":0,"sensor_type":"emg"}, ...]
    rms_num_points: int = Form(51),
    file: UploadFile = File(...),
):
    """Devuelve, para los canales indicados, las tres versiones
    decimadas (raw / filtrado / RMS) listas para graficar, calculadas
    UNA sola vez por selección de canal — así el frontend puede
    cambiar de modo (Raw/Filtrado/RMS) sin volver a subir el archivo."""
    try:
        channel_specs = json.loads(channels)
    except Exception as exc:
        raise HTTPException(400, f"Parámetro 'channels' inválido: {exc}")

    raw_bytes = await file.read()
    fs, detected_names, data = _parse_file(file.filename, raw_bytes)
    if data.ndim == 1:
        data = data.reshape(-1, 1)

    out = []
    for spec in channel_specs:
        index = spec["index"]
        sensor_type = spec.get("sensor_type", "emg")
        if index >= data.shape[1]:
            raise HTTPException(400, f"Canal índice {index} fuera de rango")

        raw_channel = data[:, index]
        filtered, processed = _processed_signal(raw_channel, sensor_type, fs, rms_num_points)

        out.append({
            "index": index,
            "raw": _decimate(raw_channel),
            "filtered": _decimate(filtered),
            "rms": _decimate(processed) if sensor_type == "emg" else _decimate(filtered),
        })

    return {"fs": fs, "channels": out}
