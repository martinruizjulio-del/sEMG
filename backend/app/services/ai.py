"""
Servicio de IA: usa la API de Claude (Anthropic) para dos cosas:

1. Configurar un análisis a partir de una petición en lenguaje natural
   ("analiza el bíceps derecho con media, máximo y picos cada 100ms").
2. Interpretar en texto llano los resultados numéricos ya calculados.

Requiere la variable de entorno ANTHROPIC_API_KEY configurada en el
servidor (panel de Render -> Environment). Sin ella, ambas funciones
lanzan AIConfigError con un mensaje explicativo, que el endpoint
convierte en un error 400 legible para el usuario.
"""
from __future__ import annotations

import json
import os

import httpx

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_MODEL = "claude-sonnet-4-6"

VALID_CALCULATIONS = [
    "media", "maximo", "mediana", "area", "integral", "picos", "lapso", "picos_ventana",
    "tramos", "frecuencia", "fatiga", "ratio_bilateral", "normalizacion", "orden_activacion", "coactivacion",
]


class AIConfigError(Exception):
    """Fallo al llamar a la IA o al interpretar su respuesta -se
    convierte en un error 400 con un mensaje que el usuario puede
    entender, no una traza técnica-."""


async def _call_claude(system: str, user_message: str, max_tokens: int) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise AIConfigError(
            "No hay ninguna clave de API de Anthropic configurada en el servidor. "
            "Añade la variable de entorno ANTHROPIC_API_KEY en el panel de Render para poder usar la IA."
        )
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user_message}],
    }
    try:
        async with httpx.AsyncClient(timeout=40.0) as client:
            resp = await client.post(ANTHROPIC_API_URL, headers=headers, json=payload)
    except httpx.RequestError as exc:
        raise AIConfigError(f"No se pudo conectar con la IA: {exc}")

    if resp.status_code != 200:
        raise AIConfigError(f"La IA respondió con un error ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()
    text_blocks = [b["text"] for b in data.get("content", []) if b.get("type") == "text"]
    return "\n".join(text_blocks).strip()


_CONFIGURE_SYSTEM_PROMPT = f"""Eres un asistente que traduce una petición en español, en lenguaje
natural, a la configuración de un análisis de señales EMG (electromiografía de superficie).

Se te da una lista de los nombres de canal EXACTOS disponibles en el archivo, y la petición del
usuario. Debes responder ÚNICAMENTE con un JSON válido (sin texto antes ni después, sin bloques de
código markdown, sin explicaciones fuera del JSON), con esta forma exacta:

{{
  "channel_labels": ["<nombre EXACTO de un canal de la lista dada>", ...],
  "calculations": [<subconjunto de {VALID_CALCULATIONS}>],
  "peak_config": {{"n_peaks": null o número entero, "min_peak_distance_ms": null o número}},
  "smooth": true o false,
  "segment_center_ms": null o número (solo si el usuario pide centrar/recortar un tramo concreto en ms),
  "notes": "una frase breve en español explicando qué se ha configurado, o avisando si algo pedido no se pudo aplicar"
}}

Reglas estrictas:
- "channel_labels" solo puede contener nombres que aparezcan LITERALMENTE en la lista de canales dada.
  Nunca inventes ni adivines nombres de canal. Si el usuario no menciona canales concretos, deja la
  lista vacía.
- Solo incluye en "calculations" lo que el usuario pida explícita o implícitamente -no actives cálculos
  de más "por si acaso".
- "peak_config" solo tiene sentido si "picos" está en calculations; si no se pide nada concreto de
  picos dentro de "picos", usa null en sus campos.
- Responde solo el JSON, nada más, sin comillas triples ni etiquetas de código.
"""

_INTERPRET_SYSTEM_PROMPT = """Eres un asistente que ayuda a interpretar en lenguaje llano los
resultados de un análisis de electromiografía de superficie (EMG), para un investigador o
fisioterapeuta que ya conoce la materia -no hace falta explicar conceptos básicos-.

Se te da, en JSON, una lista de canales (músculos) con las métricas ya calculadas para cada uno.
Escribe un resumen breve (entre 4 y 8 frases), en español, destacando: qué músculo tuvo más actividad,
asimetrías entre lados si hay datos de ambos, y cualquier patrón que merezca la pena señalar.

Reglas estrictas:
- No inventes ningún dato que no esté en el JSON proporcionado.
- No des recomendaciones médicas, diagnósticos ni juicios clínicos -solo describe lo que muestran los
  números, de forma objetiva.
- Responde solo con el resumen en texto corrido, sin encabezados ni listas con viñetas.
"""


def _strip_code_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:]
    return raw.strip()


async def configure_analysis(prompt: str, available_channels: list[str]) -> dict:
    user_message = json.dumps(
        {"peticion_del_usuario": prompt, "canales_disponibles_en_el_archivo": available_channels},
        ensure_ascii=False,
    )
    raw = await _call_claude(_CONFIGURE_SYSTEM_PROMPT, user_message, max_tokens=1024)
    raw = _strip_code_fences(raw)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AIConfigError(f"La IA no devolvió una configuración válida ({exc}). Prueba a reformular la petición.")

    # Validación defensiva: nunca confiar ciegamente en lo que devuelve la IA.
    parsed.setdefault("channel_labels", [])
    parsed["channel_labels"] = [c for c in parsed["channel_labels"] if c in available_channels]
    parsed.setdefault("calculations", [])
    parsed["calculations"] = [c for c in parsed["calculations"] if c in VALID_CALCULATIONS]
    parsed.setdefault("peak_config", {"n_peaks": None, "min_peak_distance_ms": None})
    parsed.setdefault("smooth", False)
    parsed.setdefault("segment_center_ms", None)
    parsed.setdefault("notes", "")
    return parsed


async def interpret_results(channels_results: list[dict]) -> str:
    user_message = json.dumps(channels_results, ensure_ascii=False)
    return await _call_claude(_INTERPRET_SYSTEM_PROMPT, user_message, max_tokens=700)
