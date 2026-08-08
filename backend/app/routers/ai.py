from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.routers.auth import get_current_user
from app.services.ai import configure_analysis, interpret_results, AIConfigError

router = APIRouter(prefix="/ai", tags=["ai"])


class AIConfigureRequest(BaseModel):
    prompt: str
    available_channels: list[str]


class ChannelResultIn(BaseModel):
    channel_label: str
    side: str | None = None
    metrics: dict


class AIInterpretRequest(BaseModel):
    channels: list[ChannelResultIn]


@router.post("/configure", dependencies=[Depends(get_current_user)])
async def ai_configure(payload: AIConfigureRequest):
    """Traduce una petición en lenguaje natural a la configuración del
    análisis (canales, cálculos, picos, suavizado, recorte)."""
    try:
        return await configure_analysis(payload.prompt, payload.available_channels)
    except AIConfigError as exc:
        raise HTTPException(400, str(exc))


@router.post("/interpret", dependencies=[Depends(get_current_user)])
async def ai_interpret(payload: AIInterpretRequest):
    """Genera un resumen en texto llano de los resultados ya calculados."""
    try:
        summary = await interpret_results([c.model_dump() for c in payload.channels])
    except AIConfigError as exc:
        raise HTTPException(400, str(exc))
    return {"summary": summary}
