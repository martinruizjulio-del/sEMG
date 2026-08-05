"""
Diseño de filtros por tipo de sensor.

EMG: replica exactamente Filtro_emg.m (Butterworth bandpass diseñado con
fdesign.bandpass + design(...,'butter','MatchExactly','stopband')).

Acelerómetro / plataforma de fuerzas: filtro paso-bajo Butterworth, con
frecuencias de corte típicas de literatura biomecánica (ajustables).
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
    # Acelerómetro / plataforma de fuerzas (paso-bajo)
    lowpass_cutoff: float = 20.0   # Hz, típico para acelerometría
    lowpass_order: int = 4


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
        # Paso-bajo: la señal de interés está muy por debajo de las
        # frecuencias EMG. Ajustable por estudio.
        wn = spec.lowpass_cutoff / nyq
        sos = signal.butter(spec.lowpass_order, wn, btype="low", output="sos")
        return sos

    if spec.channel_type == "force_platform":
        # Habitualmente se usa la señal cruda o un paso-bajo suave para
        # quitar ruido de alta frecuencia, sin filtrado agresivo.
        wn = min(spec.lowpass_cutoff, nyq * 0.9) / nyq
        sos = signal.butter(2, wn, btype="low", output="sos")
        return sos

    # "raw": sin filtrar
    return None


def apply_filter(data: np.ndarray, spec: FilterSpec) -> np.ndarray:
    """Aplica el filtro a lo largo del eje 0 (muestras), soporta matriz [muestras x canales]."""
    sos = design_filter(spec)
    if sos is None:
        return data
    return signal.sosfilt(sos, data, axis=0)
