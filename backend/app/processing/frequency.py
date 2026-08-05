"""
Frecuencia dominante de activación vía FFT, equivalente a Frequency.m.
"""
from __future__ import annotations

import numpy as np


def dominant_frequency(signal_1d: np.ndarray, fs: float) -> float:
    n = len(signal_1d)
    fft_vals = np.fft.fft(signal_1d)
    half = n // 2 + 1
    p1 = np.abs(fft_vals[:half]) / n
    p1[1:-1] = 2 * p1[1:-1]
    freqs = fs * np.arange(half) / n
    idx = int(np.argmax(p1))
    return float(freqs[idx])
