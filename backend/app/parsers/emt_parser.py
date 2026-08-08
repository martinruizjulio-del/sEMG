"""
Parser de archivos .emt tipo BTS (ver S11_1.emt / S17_1.emt / S20_1.emt).

Cabecera:
  Type:         Emg tracks
  Measure unit: mV
  Tracks:       8
  Frequency:    1000 [Hz]
  Frames:       204912
  Start time:   0.000

  Frame  Time  <nombre canal 1>  <nombre canal 2> ...

Detecta automáticamente la unidad ("Measure unit") y, si es mV,
convierte a µV multiplicando por 1000 (igual que hacía Julio a mano).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

import numpy as np


@dataclass
class EmtFile:
    fs: float
    channel_names: List[str]
    data_uv: np.ndarray  # [muestras x canales], siempre normalizado a µV
    converted_from_mv: List[str] = field(default_factory=list)  # canales que se pasaron de mV a µV


def parse_emt(raw_text: str) -> EmtFile:
    lines = raw_text.splitlines()

    fs = 1000.0
    unit = "mV"
    header_end_idx = 0

    for i, line in enumerate(lines):
        if line.strip().startswith("Measure unit"):
            unit = line.split(":", 1)[1].strip()
        elif line.strip().startswith("Frequency"):
            # "Frequency:    1000 [Hz]"
            part = line.split(":", 1)[1].strip()
            fs = float(part.split()[0])
        elif line.strip().startswith("Frame") and "Time" in line:
            header_end_idx = i
            break

    header_cols = [c.strip() for c in lines[header_end_idx].split("\t") if c.strip() != ""]
    channel_names = header_cols[2:]  # descarta "Frame" y "Time"

    rows = []
    for line in lines[header_end_idx + 1:]:
        if line.strip() == "":
            continue
        parts = [p for p in line.split("\t") if p.strip() != ""]
        if len(parts) < 3:
            continue
        # parts[0]=Frame, parts[1]=Time, resto=canales
        try:
            values = [float(p) for p in parts[2:]]
        except ValueError:
            continue
        rows.append(values)

    data = np.array(rows)

    # Conversión automática a microvoltios si la cabecera indica mV
    converted_from_mv = []
    if unit.lower() == "mv":
        data = data * 1000.0
        converted_from_mv = list(channel_names)

    return EmtFile(fs=fs, channel_names=channel_names, data_uv=data, converted_from_mv=converted_from_mv)
