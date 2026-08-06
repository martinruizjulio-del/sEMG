"""
Parser robusto para archivos .csv / .txt con estructuras heterogéneas
(ver A_Convertir_archivos.m, Elemplo.csv, datos_1.csv/.txt).

Resuelve automáticamente, sin índices fijos:
  - Delimitador (';', '\t', ',')
  - Separador decimal (coma o punto)
  - Columnas vacías o no numéricas -> se descartan
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

import numpy as np
import pandas as pd


@dataclass
class TabularFile:
    column_names: List[str]
    data: np.ndarray  # [muestras x canales], solo columnas numéricas válidas


def _detect_delimiter(sample_line: str) -> str:
    counts = {
        ";": sample_line.count(";"),
        "\t": sample_line.count("\t"),
        ",": sample_line.count(","),
    }
    return max(counts, key=counts.get)


def _to_float_series(series: pd.Series) -> pd.Series:
    """Convierte una columna a float, probando coma decimal si falla con punto."""
    as_point = pd.to_numeric(series, errors="coerce")
    if as_point.notna().sum() >= series.notna().sum() * 0.5:
        return as_point
    # probar con coma decimal -> punto
    swapped = series.astype(str).str.replace(",", ".", regex=False)
    return pd.to_numeric(swapped, errors="coerce")


def parse_tabular(raw_text: str, has_header: bool = True) -> TabularFile:
    first_line = raw_text.splitlines()[0]
    delimiter = _detect_delimiter(first_line)

    df = pd.read_csv(
        pd.io.common.StringIO(raw_text),
        delimiter=delimiter,
        header=0 if has_header else None,
        engine="python",
    )

    # Normalizar cada columna a numérico (maneja coma o punto decimal)
    numeric_cols = {}
    for col in df.columns:
        col_name = str(col).strip()
        # Algunos equipos EMG (p.ej. exportaciones tipo "Biceps femoris
        # Right RMS") ya incluyen su propio RMS precalculado, con muestras
        # sueltas cada cierto intervalo. La app calcula su propio RMS a
        # partir de la señal en bruto (ver modo "RMS" en el visor), así
        # que esa columna sobra como canal independiente -se descarta-,
        # igual que la columna de "timestamp" (no es una señal).
        if has_header and (col_name.lower().endswith("rms") or col_name.lower() == "timestamp"):
            continue
        converted = _to_float_series(df[col])
        # Descartar columnas totalmente vacías / no numéricas / de un solo valor constante NaN
        if converted.notna().sum() > 0:
            numeric_cols[col_name] = converted

    clean_df = pd.DataFrame(numeric_cols)
    return TabularFile(column_names=list(clean_df.columns), data=clean_df.to_numpy())
