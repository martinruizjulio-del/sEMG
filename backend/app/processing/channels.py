"""
Utilidades sobre múltiples canales:
  - Ratio bilateral (derecho/izquierdo) para pares de canales homólogos.
  - Normalización: % de activación de cada canal sobre el total sumado.
"""
from __future__ import annotations

from typing import Dict, Tuple


def bilateral_ratio(value_right: float, value_left: float) -> float:
    if value_left == 0:
        return float("inf") if value_right != 0 else 0.0
    return value_right / value_left


def normalize_activation(channel_values: Dict[str, float]) -> Dict[str, float]:
    """Dado {nombre_canal: valor}, devuelve {nombre_canal: % sobre el total}."""
    total = sum(channel_values.values())
    if total == 0:
        return {k: 0.0 for k in channel_values}
    return {k: (v / total) * 100.0 for k, v in channel_values.items()}
