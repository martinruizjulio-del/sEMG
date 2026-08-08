"""
Detección de picos, equivalente a findpeaks(...,'NPeaks',n,'MinPeakHeight',h,'MinPeakDistance',d).

Soporta:
  - Detección automática con parámetros configurables.
  - Recálculo posterior con nuevos parámetros.
  - Posicionamiento manual directo (el usuario fija los índices de pico).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from scipy.signal import find_peaks


@dataclass
class PeakParams:
    n_peaks: Optional[int] = None
    min_peak_height: Optional[float] = None
    min_peak_distance_samples: Optional[int] = None


@dataclass
class PeakResult:
    indices: np.ndarray
    values: np.ndarray
    times_ms: np.ndarray


def detect_peaks(signal_1d: np.ndarray, fs: float, params: PeakParams) -> PeakResult:
    kwargs = {}
    if params.min_peak_height is not None:
        kwargs["height"] = params.min_peak_height
    if params.min_peak_distance_samples is not None:
        kwargs["distance"] = params.min_peak_distance_samples

    idx, props = find_peaks(signal_1d, **kwargs)
    vals = signal_1d[idx]

    if params.n_peaks is not None and len(idx) > params.n_peaks:
        # A diferencia del 'NPeaks' por defecto de MATLAB (que se queda
        # con los N primeros en el tiempo, de izquierda a derecha -y
        # puede coger picos pequeños del principio en vez de los
        # relevantes-), aquí se seleccionan los N de MAYOR amplitud, y
        # luego se reordenan por tiempo para mantener la cronología.
        top = np.argsort(vals)[::-1][: params.n_peaks]  # de mayor a menor valor
        top = np.sort(top)  # de vuelta al orden temporal
        idx = idx[top]
        vals = vals[top]

    times_ms = (idx / fs) * 1000.0
    return PeakResult(indices=idx, values=vals, times_ms=times_ms)


def manual_peaks(signal_1d: np.ndarray, fs: float, indices: list[int]) -> PeakResult:
    """Posicionamiento manual directo de picos (el usuario da los índices)."""
    idx = np.array(sorted(indices), dtype=int)
    vals = signal_1d[idx]
    times_ms = (idx / fs) * 1000.0
    return PeakResult(indices=idx, values=vals, times_ms=times_ms)
