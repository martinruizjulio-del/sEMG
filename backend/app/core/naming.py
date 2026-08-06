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


_SIDE_WORDS = re.compile(
    r"\s*[\(\[]?\b(right|left|derecho|derecha|izquierdo|izquierda|[rl])\b[\)\]]?\s*",
    re.IGNORECASE,
)


def base_muscle_name(label: str) -> str:
    """Quita cualquier mención al lado (Right/Left/Derecho/Izquierdo/R/L)
    del nombre de un canal, para poder emparejar 'Biceps femoris Right'
    con 'Biceps femoris Left' como el mismo grupo muscular. Usado para
    ratio bilateral."""
    cleaned = _SIDE_WORDS.sub(" ", label)
    return re.sub(r"\s+", " ", cleaned).strip()
