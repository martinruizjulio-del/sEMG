"""
Índice de fatiga muscular EMG: se calcula la frecuencia mediana del
espectro en ventanas sucesivas a lo largo de la señal y se ajusta una
recta a esa serie temporal. Una pendiente negativa indica fatiga
(desplazamiento del espectro hacia frecuencias bajas), como es habitual
en la literatura de fatiga EMG (median frequency slope).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class FatigueResult:
    window_median_freqs: np.ndarray
    window_times_s: np.ndarray
    slope_hz_per_s: float
    fatigue_index_pct: float  # variación relativa entre inicio y fin


def _median_frequency(segment: np.ndarray, fs: float) -> float:
    n = len(segment)
    fft_vals = np.fft.rfft(segment)
    power = np.abs(fft_vals) ** 2
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    cumulative = np.cumsum(power)
    half_total = cumulative[-1] / 2.0
    idx = int(np.searchsorted(cumulative, half_total))
    idx = min(idx, len(freqs) - 1)
    return float(freqs[idx])


def calculate_fatigue(
    signal_1d: np.ndarray, fs: float, window_seconds: float = 1.0, overlap: float = 0.5
) -> FatigueResult:
    window_samples = int(window_seconds * fs)
    step = max(1, int(window_samples * (1 - overlap)))

    freqs, times = [], []
    for start in range(0, len(signal_1d) - window_samples + 1, step):
        segment = signal_1d[start:start + window_samples]
        freqs.append(_median_frequency(segment, fs))
        times.append((start + window_samples / 2) / fs)

    freqs_arr = np.array(freqs)
    times_arr = np.array(times)

    if len(freqs_arr) >= 2:
        slope, _intercept = np.polyfit(times_arr, freqs_arr, 1)
        fatigue_pct = ((freqs_arr[0] - freqs_arr[-1]) / freqs_arr[0]) * 100 if freqs_arr[0] != 0 else 0.0
    else:
        slope, fatigue_pct = 0.0, 0.0

    return FatigueResult(
        window_median_freqs=freqs_arr,
        window_times_s=times_arr,
        slope_hz_per_s=float(slope),
        fatigue_index_pct=float(fatigue_pct),
    )
