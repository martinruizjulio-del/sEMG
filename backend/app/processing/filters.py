"""
Diseño de filtros por tipo de sensor.

EMG: replica exactamente Filtro_emg.m (Butterworth bandpass diseñado con
fdesign.bandpass + design(...,'butter','MatchExactly','stopband')).

Acelerómetro / plataforma de fuerzas: filtro paso-bajo Butterworth de
4º orden, de fase cero (zero-lag, vía filtfilt), según la práctica
habitual en biomecánica para señales de plataforma de fuerzas y GRF
(Ground Reaction Force):
  - Yu, Gabriel, Noble & An (1999), "Estimate of the optimal cutoff
    frequency for the Butterworth low-pass digital filter", J Appl
    Biomech 15:318-325 — filtro de 4º orden, zero-lag, como estándar.
  - Winter, "Biomechanics and Motor Control of Human Movement" — mismo
    criterio (4º orden zero-lag, análisis de residuos para el corte).
  - Consenso de la comunidad Biomch-L: filtro Butterworth de 4º orden
    zero-lag para datos de GRF; el corte se ajusta según si hay
    impactos (saltos con caída, sprints) -corte más alto, >100 Hz- o
    pruebas cuasiestáticas/isométricas -corte más bajo, 10-50 Hz-.
Se usa 50 Hz por defecto (ajustable por estudio si el análisis lo
requiere, p.ej. saltos con impacto).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

import numpy as np
from scipy import signal

ChannelType = Literal["emg", "accelerometer", "force_platform", "raw"]


@dataclass
class FilterSpec:
    channel_type: ChannelType
    fs: float = 1000.0
    # EMG (valores exactos de Filtro_emg.m)
    fstop1: float = 20.0
    fpass1: float = 40.0
    fpass2: float = 380.0
    fstop2: float = 450.0
    astop1: float = 10.0
    apass: float = 1.0
    astop2: float = 10.0
    # Acelerómetro (paso-bajo, zero-lag)
    lowpass_cutoff: float = 20.0   # Hz, típico para acelerometría (5-20 Hz según literatura)
    lowpass_order: int = 4
    # Plataforma de fuerzas (paso-bajo, zero-lag) — ver referencias arriba
    force_cutoff: float = 50.0     # Hz, 10-50 Hz cuasiestático; usar más si hay impactos
    force_order: int = 4


def _clean_nan(data: np.ndarray) -> np.ndarray:
    """Limpieza de NaN por interpolación lineal (huecos internos) y
    relleno hacia delante/atrás en los extremos -requerido para
    plataformas de fuerza, que a menudo registran huecos-."""
    arr = np.asarray(data, dtype=float)
    if not np.isnan(arr).any():
        return arr
    n = len(arr)
    idx = np.arange(n)
    valid = ~np.isnan(arr)
    if valid.sum() == 0:
        return np.zeros_like(arr)  # canal totalmente vacío: no hay nada que interpolar
    arr = arr.copy()
    arr[~valid] = np.interp(idx[~valid], idx[valid], arr[valid])
    return arr


def design_filter(spec: FilterSpec):
    """Devuelve los coeficientes SOS del filtro según el tipo de canal."""
    nyq = spec.fs / 2.0

    if spec.channel_type == "emg":
        # Equivalente a fdesign.bandpass(...) + design(...,'butter','MatchExactly','stopband')
        wp = [spec.fpass1 / nyq, spec.fpass2 / nyq]
        ws = [spec.fstop1 / nyq, spec.fstop2 / nyq]
        sos = signal.iirdesign(
            wp, ws, gpass=spec.apass, gstop=spec.astop1,
            ftype="butter", output="sos",
        )
        return sos

    if spec.channel_type == "accelerometer":
        wn = spec.lowpass_cutoff / nyq
        sos = signal.butter(spec.lowpass_order, wn, btype="low", output="sos")
        return sos

    if spec.channel_type == "force_platform":
        wn = min(spec.force_cutoff, nyq * 0.9) / nyq
        sos = signal.butter(spec.force_order, wn, btype="low", output="sos")
        return sos

    # "raw": sin filtrar
    return None


def apply_filter(data: np.ndarray, spec: FilterSpec) -> np.ndarray:
    """Aplica el filtro a lo largo del eje 0 (muestras), soporta matriz [muestras x canales].

    Para acelerómetro y plataforma de fuerzas se aplica en fase cero
    (filtfilt/sosfiltfilt), como exige la bibliografía citada arriba
    -evita el desfase temporal que introduce un filtrado de una sola
    pasada, importante para no desplazar los picos de fuerza en el
    tiempo-. El filtro EMG se mantiene de una sola pasada (sosfilt),
    igual que Filtro_emg.m.
    """
    data = _clean_nan(data) if spec.channel_type == "force_platform" else data
    sos = design_filter(spec)
    if sos is None:
        return data
    if spec.channel_type in ("accelerometer", "force_platform"):
        return signal.sosfiltfilt(sos, data, axis=0)
    return signal.sosfilt(sos, data, axis=0)
