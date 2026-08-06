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


class AnalyzeRequest(BaseModel):
    channels: list[ChannelSelection]  # qué canales analizar y cómo tratarlos
    calculations: list[Literal[
        "media", "maximo", "mediana", "picos", "frecuencia", "fatiga",
        "ratio_bilateral", "normalizacion",
    ]]
    peak_config: Optional[PeakConfig] = None
    rms_num_points: int = 51
    save_results: bool = True
    session_label: Optional[str] = None  # si no se da, se usa el nombre del archivo subido


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
