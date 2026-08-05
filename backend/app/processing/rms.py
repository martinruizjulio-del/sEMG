"""
Replica exacta de Rms_emg.m:
  1) Rectifica: data ** 2
  2) Convoluciona con kernel de media móvil de numPoints (forzado impar)
  3) Recorta el padding añadido en los extremos por la convolución
  4) Raíz cuadrada

Soporta vector (1D) o matriz [muestras x canales].
"""
from __future__ import annotations

import numpy as np


def rms_emg(data: np.ndarray, num_points: int = 51) -> np.ndarray:
    if num_points % 2 == 0:
        num_points += 1  # igual que Rms_emg.m: numPoints+1 si es par

    kernel = np.ones(num_points) / num_points
    padding = (num_points - 1) // 2

    squared = np.asarray(data, dtype=float) ** 2

    if squared.ndim == 1:
        conv = np.convolve(squared, kernel, mode="full")
        conv = conv[padding: conv.size - padding]
        return np.sqrt(conv)

    # Matriz: convolucionar cada columna (canal)
    n_rows, n_cols = squared.shape
    out = np.zeros((n_rows, n_cols))
    for c in range(n_cols):
        conv = np.convolve(squared[:, c], kernel, mode="full")
        conv = conv[padding: conv.size - padding]
        out[:, c] = conv
    return np.sqrt(out)
