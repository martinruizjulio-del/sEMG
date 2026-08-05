"""
Parser de archivos .ASC tipo MegaWin (ver S1_1.ASC de referencia).

Estructura:
  [DEFINITIONS] ChannelCount, SamplingFreq, ...
  [SOURCE NAMES] nombres de canal (uno por línea)
  [SIDE INFO] lado (R/L) por canal
  [UNITS] unidad por canal (p.ej. uV)
  [DATA] valores, una o varias columnas separadas por tab
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

import numpy as np


@dataclass
class AscFile:
    fs: float
    channel_names: List[str]
    sides: List[str]
    units: List[str]
    data: np.ndarray  # [muestras x canales]


def _read_section(lines: List[str], section: str) -> List[str]:
    """Devuelve las líneas no vacías entre [section] y la siguiente sección."""
    try:
        start = next(i for i, l in enumerate(lines) if l.strip() == f"[{section}]")
    except StopIteration:
        return []
    out = []
    for line in lines[start + 1:]:
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            break
        if stripped != "":
            out.append(stripped)
    return out


def parse_asc(raw_text: str) -> AscFile:
    lines = raw_text.splitlines()

    definitions = _read_section(lines, "DEFINITIONS")
    fs = 1000.0
    for line in definitions:
        if line.startswith("SamplingFreq"):
            fs = float(line.split("=")[1])

    channel_names = _read_section(lines, "SOURCE NAMES")
    sides = _read_section(lines, "SIDE INFO")
    units = _read_section(lines, "UNITS")

    # Bloque [DATA]: cada línea es una fila, valores separados por tab
    try:
        data_start = next(i for i, l in enumerate(lines) if l.strip() == "[DATA]")
    except StopIteration:
        raise ValueError("No se encontró la sección [DATA] en el archivo ASC")

    rows = []
    for line in lines[data_start + 1:]:
        if line.strip() == "":
            continue
        values = [v for v in line.split("\t") if v.strip() != ""]
        if values:
            rows.append([float(v) for v in values])

    data = np.array(rows)
    return AscFile(fs=fs, channel_names=channel_names, sides=sides, units=units, data=data)
