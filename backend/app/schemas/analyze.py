from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class ChannelSelection(BaseModel):
    index: int
    label: Optional[str] = None  # si no se da, se usa el nombre detectado en el archivo
    side: Optional[Literal["R", "L"]] = None
    sensor_type: Literal["emg", "accelerometer", "force_platform", "raw"] = "emg"
    manual_peaks_ms: Optional[list[float]] = None  # posicionamiento manual directo (estilo Slider.m)


class PeakConfig(BaseModel):
    n_peaks: Optional[int] = None
    min_peak_height: Optional[float] = None
    min_peak_distance_ms: Optional[float] = None


class PeakWindowConfig(BaseModel):
    """Ventanas de activación relativas a cada pico -p.ej. media y
    máximo en los 25ms anteriores y/o posteriores a cada pico-."""
    margins_ms: list[float] = []
    before: bool = True
    after: bool = True


class TimeBinsConfig(BaseModel):
    """División del tramo analizado en partes iguales, para ver la
    evolución de la activación (media y máximo) tramo a tramo -p.ej.
    los primeros 5' frente a los segundos 5' de una grabación-."""
    mode: Literal["count", "duration"] = "count"
    count: Optional[int] = None          # nº de tramos (modo "count")
    duration_ms: Optional[float] = None  # duración de cada tramo (modo "duration")


class AnalyzeRequest(BaseModel):
    channels: list[ChannelSelection]  # qué canales analizar y cómo tratarlos
    calculations: list[Literal[
        "media", "maximo", "mediana", "picos", "lapso", "picos_ventana", "tramos", "frecuencia", "fatiga",
        "ratio_bilateral", "normalizacion", "orden_activacion",
    ]]
    peak_config: Optional[PeakConfig] = None
    peak_window_config: Optional[PeakWindowConfig] = None
    time_bins_config: Optional[TimeBinsConfig] = None
    rms_num_points: int = 51
    # Suavizado tipo smoothdata() de MATLAB (ventana automática),
    # aplicado tras el RMS y antes de calcular media/máximo/picos/etc.
    smooth: bool = False
    save_results: bool = True
    session_label: Optional[str] = None  # si no se da, se usa el nombre del archivo subido
    # Segmentación visual: analizar solo este tramo de la señal (ms,
    # relativo al inicio del archivo completo). Si no se da, se usa
    # todo el archivo.
    segment_start_ms: Optional[float] = None
    segment_end_ms: Optional[float] = None


class ChannelAnalysisOut(BaseModel):
    channel_label: str
    side: Optional[str]
    sensor_type: str
    metrics: dict  # {"media": valor, "maximo": valor, ...}
    peak_indices: Optional[list[int]] = None
    peak_times_ms: Optional[list[float]] = None
    variable_names: dict  # {"media": "Biceps_R_media", ...}


class AnalyzeResponse(BaseModel):
    fs: float
    n_samples: int
    channels: list[ChannelAnalysisOut]
    session_id: Optional[int] = None
    session_label: Optional[str] = None
