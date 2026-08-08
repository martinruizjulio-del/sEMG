from __future__ import annotations

import json
import datetime as dt

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
from app.processing.filters import FilterSpec, apply_filter, clean_nan, apply_notch
from app.processing.rms import rms_emg
from app.processing.peaks import detect_peaks, manual_peaks, PeakParams
from app.processing.frequency import dominant_frequency
from app.processing.fatigue import calculate_fatigue
from app.processing.smoothing import smoothdata_auto
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
    """Devuelve (fs, channel_names, data[muestras x canales], converted_from_mv)."""
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw_bytes.decode("latin-1", errors="ignore")

    name = filename.lower()
    if name.endswith(".asc"):
        parsed = parse_asc(text)
        return parsed.fs, parsed.channel_names, parsed.data, parsed.converted_from_mv
    if name.endswith(".emt"):
        parsed = parse_emt(text)
        return parsed.fs, parsed.channel_names, parsed.data_uv, parsed.converted_from_mv
    parsed = parse_tabular(text)
    # Sin frecuencia de muestreo conocida en CSV/TXT genérico: 1000Hz por defecto,
    # ajustable más adelante si el usuario la indica en el formulario.
    return 1000.0, parsed.column_names, parsed.data, parsed.converted_from_mv


def _processed_signal(channel_data: np.ndarray, sensor_type: str, fs: float, rms_num_points: int, smooth: bool = False):
    """Pipeline de procesado según el tipo de sensor.

    Devuelve (filtered, processed):
      - filtered: señal tras el filtro correspondiente, SIN rectificar (se
        usa para frecuencia dominante y fatiga, que necesitan el contenido
        espectral real de la señal, no una envolvente siempre positiva).
      - processed: señal usada para media/máximo/mediana/picos (para EMG
        es la envolvente RMS, igual que en Slider.m / analizar_picos_EMG.m).
        Si `smooth` está activado, aquí se aplica smoothdata() -igual que
        en el script de referencia: filtrar -> recortar -> RMS ->
        smoothdata -> media/máximo sobre la señal ya suavizada-.
    """
    spec = FilterSpec(channel_type=sensor_type, fs=fs)
    filtered = apply_filter(channel_data, spec)
    filtered = filtered.ravel() if filtered.ndim > 1 else filtered

    if sensor_type == "emg":
        processed = rms_emg(filtered, num_points=rms_num_points).ravel()
    else:
        processed = filtered

    if smooth:
        processed = smoothdata_auto(processed)

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
    fs, detected_names, data, _converted_from_mv = _parse_file(file.filename, raw_bytes)
    # El archivo original NUNCA se guarda en disco: solo vive en memoria
    # durante esta petición y se descarta al terminar (según lo pedido).

    session = None
    if request.save_results:
        default_label = file.filename.rsplit(".", 1)[0] if file.filename else "Análisis"
        session = AnalysisSession(subject_id=subject_id, label=request.session_label or default_label)
        # Marcamos el escritorio como "recién usado" -si no, al entrar
        # en la app siempre aparecería el último CREADO, no el último
        # en el que se ha trabajado de verdad-.
        subject.desktop.updated_at = dt.datetime.utcnow()
        db.add(session)
        db.flush()  # asigna session.id sin cerrar la transacción

    if data.ndim == 1:
        data = data.reshape(-1, 1)

    # Segmentación visual: recortar al tramo elegido ANTES de procesar
    # cualquier canal (todos los cálculos -media, picos, fatiga...- se
    # hacen ya solo sobre ese tramo).
    segment_offset_ms = 0.0
    if request.segment_start_ms is not None or request.segment_end_ms is not None:
        total_ms = (data.shape[0] / fs) * 1000.0
        start_ms = max(0.0, request.segment_start_ms or 0.0)
        end_ms = min(total_ms, request.segment_end_ms if request.segment_end_ms is not None else total_ms)
        start_idx = int((start_ms / 1000.0) * fs)
        end_idx = int((end_ms / 1000.0) * fs)
        if end_idx > start_idx:
            data = data[start_idx:end_idx, :]
            segment_offset_ms = start_ms

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

        processed_filtered, processed = _processed_signal(
            raw_channel, ch.sensor_type, fs, request.rms_num_points, smooth=request.smooth
        )

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
            elif calc == "area":
                # Suma rectangular (Riemann) de la señal rectificada,
                # escalada por el intervalo de muestreo -método simple,
                # cada muestra "pesa" 1/fs segundos-.
                metrics["area"] = float(np.sum(np.abs(processed)) / fs)
            elif calc == "integral":
                # Integral trapezoidal (más precisa que la suma
                # rectangular) de la misma señal rectificada.
                # np.trapz se renombró a np.trapezoid en numpy 2.0;
                # se soportan ambas versiones.
                trapz_fn = getattr(np, "trapezoid", None) or np.trapz
                sample_interval_s = 1.0 / fs
                metrics["integral"] = float(trapz_fn(np.abs(processed), dx=sample_interval_s))
            elif calc == "picos":
                if ch.manual_peaks_ms:
                    # Posicionamiento manual directo (estilo Slider.m):
                    # el usuario ya marcó los picos en el gráfico
                    # -sobre la señal completa-, así que se ajustan al
                    # desplazamiento si se ha recortado un segmento.
                    manual_indices = [
                        int(round(((t_ms - segment_offset_ms) / 1000.0) * fs)) for t_ms in ch.manual_peaks_ms
                    ]
                    manual_indices = [i for i in manual_indices if 0 <= i < len(processed)]
                    result = manual_peaks(processed, fs=fs, indices=manual_indices)
                else:
                    params = PeakParams(
                        n_peaks=peak_cfg.n_peaks if peak_cfg else None,
                        min_peak_height=peak_cfg.min_peak_height if peak_cfg else None,
                        min_peak_distance_samples=min_dist_samples,
                    )
                    result = detect_peaks(processed, fs=fs, params=params)
                peak_indices = result.indices.tolist()
                peak_times = result.times_ms.tolist()
                peak_values = result.values.tolist()
                metrics["num_picos"] = len(peak_indices)
                # Valor de cada pico individual, en el orden en que
                # aparecen en el tiempo -así en la tabla de resultados
                # se ve "pico 1", "pico 2"... con su valor real, no
                # solo el recuento-.
                for i, v in enumerate(peak_values, start=1):
                    metrics[f"pico_{i}"] = float(v)
                # Lapso: diferencia entre el pico más tardío y el más
                # temprano DENTRO de este archivo (no compara con otros
                # archivos -eso se decide luego, al elegir qué sesión
                # incluir en la matriz de datos final-). Es una opción
                # aparte de "Picos": solo se guarda si se pide.
                if "lapso" in request.calculations and peak_times:
                    metrics["lapso_ms"] = max(peak_times) - min(peak_times)
                # Ventanas de activación relativas a cada pico -media y
                # máximo en los N ms anteriores y/o posteriores a cada
                # pico, para tantos márgenes como se hayan pedido-.
                pwc = request.peak_window_config
                if "picos_ventana" in request.calculations and pwc and pwc.margins_ms and peak_indices:
                    for peak_num, idx in enumerate(peak_indices, start=1):
                        for margin_ms in pwc.margins_ms:
                            margin_samples = int(round((margin_ms / 1000.0) * fs))
                            margin_label = f"{margin_ms:g}ms"
                            if pwc.before:
                                start = max(0, idx - margin_samples)
                                window = processed[start:idx + 1]
                                if len(window) > 0:
                                    metrics[f"pico_{peak_num}_pre_{margin_label}_media"] = float(np.mean(window))
                                    metrics[f"pico_{peak_num}_pre_{margin_label}_maximo"] = float(np.max(window))
                            if pwc.after:
                                end = min(len(processed), idx + margin_samples + 1)
                                window = processed[idx:end]
                                if len(window) > 0:
                                    metrics[f"pico_{peak_num}_post_{margin_label}_media"] = float(np.mean(window))
                                    metrics[f"pico_{peak_num}_post_{margin_label}_maximo"] = float(np.max(window))
            elif calc == "tramos":
                tbc = request.time_bins_config
                if tbc:
                    n_samples_ch = len(processed)
                    total_ms_ch = (n_samples_ch / fs) * 1000.0
                    if tbc.mode == "count" and tbc.count and tbc.count > 0:
                        n_bins = tbc.count
                        bin_samples = max(1, n_samples_ch // n_bins)
                    elif tbc.mode == "duration" and tbc.duration_ms and tbc.duration_ms > 0:
                        bin_samples = max(1, int(round((tbc.duration_ms / 1000.0) * fs)))
                        n_bins = max(1, -(-n_samples_ch // bin_samples))  # ceil
                    else:
                        n_bins = 0
                        bin_samples = 0
                    for b in range(n_bins):
                        start = b * bin_samples
                        end = n_samples_ch if b == n_bins - 1 else min(n_samples_ch, start + bin_samples)
                        window = processed[start:end]
                        if len(window) > 0:
                            metrics[f"tramo_{b + 1}_media"] = float(np.mean(window))
                            metrics[f"tramo_{b + 1}_maximo"] = float(np.max(window))
            elif calc == "frecuencia":
                notched = apply_notch(processed_filtered, fs=fs)
                metrics["frecuencia_dominante_hz"] = dominant_frequency(notched, fs=fs)
            elif calc == "fatiga":
                notched = apply_notch(processed_filtered, fs=fs)
                fat = calculate_fatigue(notched, fs=fs)
                metrics["fatiga_pendiente_hz_s"] = fat.slope_hz_per_s
                metrics["fatiga_indice_pct"] = fat.fatigue_index_pct
            # "ratio_bilateral" y "normalizacion" se calculan aparte, más
            # abajo, una vez conocidos los valores de todos los canales.

        channel_records.append({
            "index": ch.index, "label": label, "side": ch.side, "metrics": metrics,
            "peak_times_ms": peak_times,
            "n_samples": len(processed),
            # Solo se guarda si hace falta para coactivación -evita usar
            # memoria de más en análisis grandes que no la necesiten-.
            "processed": processed if "coactivacion" in request.calculations else None,
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

    if "orden_activacion" in request.calculations:
        _add_activation_order(channel_records)

    if "coactivacion" in request.calculations and request.coactivation_config:
        _add_coactivation_index(channel_records, request.coactivation_config)

    if "frecuencia_paso" in request.calculations and request.step_frequency_config:
        _add_step_frequency(channel_records, request.step_frequency_config, fs)

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
    base, uno R y otro L), añade 'ratio_bilateral_<metrica>' a AMBOS
    canales del par, para cada métrica de amplitud presente en los dos
    (media/máximo/mediana). Se calcula como índice de simetría -el
    valor más pequeño de los dos entre el más grande-, así que siempre
    va de 0 a 1 (1 = simetría perfecta), sin importar qué lado sea
    mayor."""
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
            val_r, val_l = abs(rec_r["metrics"][metric_name]), abs(rec_l["metrics"][metric_name])
            mayor = max(val_r, val_l)
            if mayor == 0:
                continue  # evitar división por cero
            ratio = min(val_r, val_l) / mayor
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


def _add_activation_order(channel_records: list[dict]) -> None:
    """Orden de activación: 1 para el canal que activa primero (pico
    más temprano), 2 para el siguiente, etc. -como una jerarquía en
    Excel-. Necesita que 'Picos' también esté seleccionado; los
    canales sin ningún pico detectado no reciben orden."""
    candidates = [
        (rec, min(rec["peak_times_ms"]))
        for rec in channel_records
        if rec.get("peak_times_ms")
    ]
    candidates.sort(key=lambda item: item[1])
    for rank, (rec, _first_peak_ms) in enumerate(candidates, start=1):
        rec["metrics"]["orden_activacion"] = float(rank)


def _add_coactivation_index(channel_records: list[dict], cfg) -> None:
    """Índice de coactivación de Falconer & Winter (1985) entre dos
    canales elegidos -típicamente agonista/antagonista-:

        CI = 2 * (área común) / (área total) * 100

    El "área común" es, en cada instante, el menor de los dos valores
    de activación (la parte que ambos músculos comparten); el "área
    total" es la suma de la actividad de ambos canales por separado.
    Se guarda una sola vez, en el canal A, con un nombre que deja
    claro contra qué canal se comparó.
    """
    rec_a = next((r for r in channel_records if r["index"] == cfg.channel_a_index), None)
    rec_b = next((r for r in channel_records if r["index"] == cfg.channel_b_index), None)
    if not rec_a or not rec_b or rec_a["processed"] is None or rec_b["processed"] is None:
        return

    a = np.abs(rec_a["processed"])
    b = np.abs(rec_b["processed"])
    n = min(len(a), len(b))
    if n == 0:
        return
    a, b = a[:n], b[:n]

    common_area = float(np.sum(np.minimum(a, b)))
    total_area = float(np.sum(a) + np.sum(b))
    if total_area == 0:
        return
    ci = (2 * common_area / total_area) * 100.0

    partner_label = base_muscle_name(rec_b["label"])
    rec_a["metrics"][f"coactivacion_vs_{partner_label}_pct"] = ci


def _add_step_frequency(channel_records: list[dict], cfg, fs: float) -> None:
    """Frecuencia de paso: cuenta los picos (pasos/zancadas) detectados
    en uno o dos canales -p.ej. gemelo derecho y/o izquierdo- y los
    divide entre la duración analizada en segundos. NO es una
    frecuencia espectral en Hz, es un recuento de eventos por segundo
    (pasos/s), típico en análisis de carrera/marcha."""
    rec_a = next((r for r in channel_records if r["index"] == cfg.channel_a_index), None)
    if not rec_a:
        return

    total_peaks = rec_a["metrics"].get("num_picos")
    if total_peaks is None:
        return  # el canal A no tiene "Picos" calculado
    duration_s = rec_a["n_samples"] / fs

    label_parts = [rec_a["label"]]
    if cfg.channel_b_index is not None:
        rec_b = next((r for r in channel_records if r["index"] == cfg.channel_b_index), None)
        if rec_b and rec_b["metrics"].get("num_picos") is not None:
            total_peaks += rec_b["metrics"]["num_picos"]
            label_parts.append(rec_b["label"])

    if duration_s <= 0:
        return

    if len(label_parts) > 1:
        partner_label = base_muscle_name(label_parts[1])
        metric_name = f"frecuencia_paso_con_{partner_label}_pasos_s"
    else:
        metric_name = "frecuencia_paso_pasos_s"

    rec_a["metrics"][metric_name] = total_peaks / duration_s


@preview_router.post("/channel-preview")
async def channel_preview(
    channels: str = Form(...),  # JSON: [{"index":0,"sensor_type":"emg"}, ...]
    rms_num_points: int = Form(51),
    smooth: bool = Form(False),
    file: UploadFile = File(...),
):
    """Devuelve, para los canales indicados, las versiones decimadas
    (raw / filtrado / RMS) listas para graficar, calculadas UNA sola
    vez por selección de canal — así el frontend puede cambiar de modo
    (Raw/Filtrado/RMS) sin volver a subir el archivo.

    `rms` refleja el estado actual de `smooth` (para que el modo RMS
    coincida con lo que se está calculando de verdad). Además, se
    devuelven SIEMPRE `rms_normal` y `rms_smoothed` por separado -sin
    y con smoothdata()-, para poder dibujar ambas curvas superpuestas
    y comparar el contraste, independientemente de si el interruptor
    de suavizado está activado o no.
    """
    try:
        channel_specs = json.loads(channels)
    except Exception as exc:
        raise HTTPException(400, f"Parámetro 'channels' inválido: {exc}")

    raw_bytes = await file.read()
    fs, detected_names, data, _converted_from_mv = _parse_file(file.filename, raw_bytes)
    if data.ndim == 1:
        data = data.reshape(-1, 1)

    out = []
    for spec in channel_specs:
        index = spec["index"]
        sensor_type = spec.get("sensor_type", "emg")
        if index >= data.shape[1]:
            raise HTTPException(400, f"Canal índice {index} fuera de rango")

        raw_channel = data[:, index]
        # Se calcula una sola vez sin suavizar (evita filtrar dos veces)
        # y, a partir de ahí, la versión suavizada como post-proceso.
        filtered, processed_normal = _processed_signal(raw_channel, sensor_type, fs, rms_num_points, smooth=False)
        processed_smoothed = smoothdata_auto(processed_normal) if len(processed_normal) >= 5 else processed_normal
        processed = processed_smoothed if smooth else processed_normal

        out.append({
            "index": index,
            "raw": _decimate(clean_nan(raw_channel)),
            "filtered": _decimate(filtered),
            "rms": _decimate(processed) if sensor_type == "emg" else _decimate(filtered),
            "rms_normal": _decimate(processed_normal) if sensor_type == "emg" else _decimate(filtered),
            "rms_smoothed": _decimate(processed_smoothed) if sensor_type == "emg" else _decimate(filtered),
        })

    return {"fs": fs, "channels": out}
