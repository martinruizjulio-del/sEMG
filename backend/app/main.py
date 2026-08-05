"""
API de Matlab_app + frontend servido desde el mismo proceso.

Para desplegar en un ÚNICO subdominio (Plesk/Passenger no permite
fácilmente proxys internos entre un sitio estático y una app Python),
el propio backend sirve también el frontend ya compilado:
copia el contenido de `frontend/dist/` a `backend/static/` antes de
desplegar, y este archivo lo servirá automáticamente en "/".

Rutas de la API (todas bajo estos prefijos, el resto de rutas
devuelve el frontend):
  POST /auth/request-code, /auth/verify-code
  GET/POST /desktops, /desktops/{id}, /desktops/{id}/subjects, ...
  POST /parse-preview, /channel-preview
  GET  /health
"""
import os

from fastapi import FastAPI, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import numpy as np

from app.parsers.asc_parser import parse_asc
from app.parsers.emt_parser import parse_emt
from app.parsers.csv_txt_parser import parse_tabular
from app.db.session import Base, engine
from app.db import models  # noqa: F401 (registra los modelos en Base)
from app.routers import auth, desktops, analyze
from app.routers.auth import get_current_user

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Matlab_app API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # mismo origen en producción; permisivo para desarrollo local
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(desktops.router)
app.include_router(analyze.router)
app.include_router(analyze.preview_router)


@app.get("/health")
def health():
    return {"status": "ok"}


def _decimate(values: np.ndarray, max_points: int = 1500) -> list:
    n = len(values)
    if n <= max_points:
        return [float(v) for v in values]
    step = n / max_points
    idx = (np.arange(max_points) * step).astype(int)
    return [float(v) for v in values[idx]]


@app.post("/parse-preview", dependencies=[Depends(get_current_user)])
async def parse_preview(file: UploadFile = File(...)):
    """Sube un archivo y devuelve metadatos (canales, fs, nº de muestras)
    más una vista previa decimada por canal, lista para graficar en el
    frontend sin tener que mandar todas las muestras."""
    raw_bytes = await file.read()
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw_bytes.decode("latin-1", errors="ignore")
    name = file.filename.lower()

    if name.endswith(".asc"):
        parsed = parse_asc(text)
        fs, channels, data = parsed.fs, parsed.channel_names, parsed.data
        fmt = "asc"
    elif name.endswith(".emt"):
        parsed = parse_emt(text)
        fs, channels, data = parsed.fs, parsed.channel_names, parsed.data_uv
        fmt = "emt"
    else:
        parsed = parse_tabular(text)
        fs, channels, data = 1000.0, parsed.column_names, parsed.data
        fmt = "tabular"

    if data.ndim == 1:
        data = data.reshape(-1, 1)

    max_channels_preview = 8
    preview = [_decimate(data[:, c]) for c in range(min(data.shape[1], max_channels_preview))]

    return {
        "format": fmt,
        "fs": fs,
        "channels": channels,
        "n_samples": data.shape[0],
        "n_channels": data.shape[1],
        "preview": preview,
    }


# --- Servir el frontend compilado (debe ir al final: las rutas de la
# API de arriba se comprueban primero; esto solo captura lo que no
# haya coincidido con ninguna ruta de la API) ---
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
