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
import datetime as dt

from fastapi import FastAPI, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text as sql_text

import numpy as np

from app.parsers.asc_parser import parse_asc
from app.parsers.emt_parser import parse_emt
from app.parsers.csv_txt_parser import parse_tabular
from app.processing.filters import clean_nan
from app.db.session import Base, engine
from app.db import models  # noqa: F401 (registra los modelos en Base)
from app.routers import auth, desktops, analyze
from app.routers.auth import get_current_user

Base.metadata.create_all(bind=engine)


def _migrate_add_sessions() -> None:
    """Migración idempotente para bases de datos que ya existían antes
    de introducir el concepto de 'sesión de análisis' (varios archivos
    por sujeto). Se ejecuta en cada arranque; no hace nada si ya está
    aplicada. Compatible con SQLite (dev) y PostgreSQL (producción)."""
    inspector = inspect(engine)
    if "analysis_results" not in inspector.get_table_names():
        return  # tabla recién creada por create_all, ya incluye session_id
    existing_cols = {c["name"] for c in inspector.get_columns("analysis_results")}
    if "session_id" in existing_cols:
        return  # ya migrado

    with engine.begin() as conn:
        conn.execute(sql_text("ALTER TABLE analysis_results ADD COLUMN session_id INTEGER"))
        orphan_subjects = conn.execute(sql_text(
            "SELECT DISTINCT subject_id FROM analysis_results WHERE session_id IS NULL"
        )).fetchall()
        for (subject_id,) in orphan_subjects:
            conn.execute(sql_text(
                "INSERT INTO analysis_sessions (subject_id, label, created_at) "
                "VALUES (:sid, 'Análisis 1', :now)"
            ), {"sid": subject_id, "now": dt.datetime.utcnow()})
            session_id = conn.execute(sql_text(
                "SELECT id FROM analysis_sessions WHERE subject_id = :sid ORDER BY id DESC LIMIT 1"
            ), {"sid": subject_id}).scalar()
            conn.execute(sql_text(
                "UPDATE analysis_results SET session_id = :session_id "
                "WHERE subject_id = :sid AND session_id IS NULL"
            ), {"session_id": session_id, "sid": subject_id})


_migrate_add_sessions()

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
        converted_from_mv = parsed.converted_from_mv
        fmt = "asc"
    elif name.endswith(".emt"):
        parsed = parse_emt(text)
        fs, channels, data = parsed.fs, parsed.channel_names, parsed.data_uv
        converted_from_mv = parsed.converted_from_mv
        fmt = "emt"
    else:
        parsed = parse_tabular(text)
        fs, channels, data = 1000.0, parsed.column_names, parsed.data
        converted_from_mv = parsed.converted_from_mv
        fmt = "tabular"

    if data.ndim == 1:
        data = data.reshape(-1, 1)

    max_channels_preview = 8
    preview = [_decimate(clean_nan(data[:, c])) for c in range(min(data.shape[1], max_channels_preview))]

    return {
        "format": fmt,
        "fs": fs,
        "channels": channels,
        "n_samples": data.shape[0],
        "n_channels": data.shape[1],
        "preview": preview,
        # Canales cuyo valor se convirtió automáticamente de mV a µV
        # (detectado por la cabecera del archivo, p.ej. ".emt" con
        # "Measure unit: mV", ".asc" con sección [UNITS], o un nombre de
        # columna que contenga "mV" en CSV/TXT).
        "converted_from_mv": converted_from_mv,
    }


# --- Servir el frontend compilado (debe ir al final: las rutas de la
# API de arriba se comprueban primero; esto solo captura lo que no
# haya coincidido con ninguna ruta de la API) ---
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
