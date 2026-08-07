"""
Suavizado equivalente a smoothdata(x) de MATLAB (método por defecto
'movmean', con tamaño de ventana automático).

Aviso de fidelidad: MATLAB NO publica la fórmula exacta de su
heurística de ventana automática -es un algoritmo interno-. Su propia
documentación solo dice: "para un factor de suavizado τ (por defecto
0.25), la heurística estima un tamaño de ventana de media móvil que
atenúa aproximadamente el 100·τ % de la energía de la señal de
entrada". Aquí se reproduce exactamente ese criterio documentado
-buscando la ventana que atenúa ese % de energía-, pero no puede
garantizarse que coincida cifra a cifra con el algoritmo interno de
MATLAB, ya que ese no es público.
"""
from __future__ import annotations

import numpy as np


def _moving_average(signal: np.ndarray, window: int) -> np.ndarray:
    """Media móvil centrada de tamaño `window` (recortada en los bordes)."""
    n = len(signal)
    if window <= 1:
        return signal.astype(float, copy=True)
    half = window // 2
    csum = np.cumsum(np.insert(signal.astype(float), 0, 0.0))
    idx = np.arange(n)
    start = np.clip(idx - half, 0, n)
    end = np.clip(idx + half + 1, 0, n)
    counts = end - start
    return (csum[end] - csum[start]) / counts


def smoothdata_auto(signal: np.ndarray, smoothing_factor: float = 0.25) -> np.ndarray:
    """Suaviza `signal` con una media móvil de ventana automática,
    reproduciendo el criterio documentado de smoothdata(x) de MATLAB:
    la ventana más pequeña que atenúa ~100*smoothing_factor % de la
    energía de la señal (por defecto 25%, el valor por defecto de
    MATLAB).

    La atenuación se mide sobre la VARIANZA (la parte que realmente
    fluctúa), no sobre la energía total en bruto -para una señal
    siempre positiva como una envolvente RMS, el nivel medio domina la
    energía total y un suavizado nunca lo cambia, así que medir sobre
    la energía total haría el objetivo inalcanzable en la práctica-.
    """
    signal = np.asarray(signal, dtype=float)
    n = len(signal)
    if n < 5:
        return signal.copy()

    original_var = float(np.var(signal))
    if original_var == 0:
        return signal.copy()
    target_var = (1 - smoothing_factor) * original_var

    max_window = n if n % 2 == 1 else n - 1
    num_candidates = (max_window - 1) // 2 + 1  # ventanas impares: 1,3,5,...,max_window

    def variance_at(k: int) -> float:
        window = 2 * k + 1
        return float(np.var(_moving_average(signal, window)))

    # Más ventana = más suavizado = menos varianza retenida: es una
    # relación monótona, así que se busca por bisección -la ventana
    # impar más pequeña que ya deja la varianza por debajo del
    # objetivo- en vez de probar ventana a ventana.
    lo, hi = 0, num_candidates - 1
    best_k = None
    while lo <= hi:
        mid = (lo + hi) // 2
        if variance_at(mid) <= target_var:
            best_k = mid
            hi = mid - 1
        else:
            lo = mid + 1

    if best_k is None:
        # Ni la ventana máxima llega a atenuar lo suficiente (señal ya
        # casi constante): usar la ventana máxima disponible.
        best_k = num_candidates - 1

    return _moving_average(signal, 2 * best_k + 1)
