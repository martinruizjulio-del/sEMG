from __future__ import annotations

import re
import unicodedata


def slugify_variable_name(*parts: str) -> str:
    """Genera un nombre de variable lógico a partir de varias partes,
    p.ej. slugify_variable_name('Biceps brachii', 'R', 'RMS media')
    -> 'Biceps_brachii_R_RMS_media'
    """
    joined = "_".join(p.strip() for p in parts if p)
    # quitar acentos
    normalized = unicodedata.normalize("NFKD", joined)
    no_accents = "".join(c for c in normalized if not unicodedata.combining(c))
    # sustituir cualquier cosa que no sea alfanumérico por "_"
    cleaned = re.sub(r"[^0-9a-zA-Z]+", "_", no_accents)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned
