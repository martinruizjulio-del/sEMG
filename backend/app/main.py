"""
Esqueleto de la API de Matlab_app.

Endpoints previstos (a implementar con base de datos real en la siguiente
iteración):
  POST /auth/request-code   -> envía código de 6 cifras al correo autorizado
  POST /auth/verify-code    -> valida código y devuelve sesión/token
  GET  /desktops            -> lista escritorios guardados del usuario
  POST /desktops            -> crea un escritorio nuevo (con nombre)
  POST /desktops/{id}/files -> sube archivo(s) / carpeta a un escritorio
  POST /desktops/{id}/analyze -> ejecuta filtros/RMS/picos/FFT/fatiga sobre
                                  los archivos del escritorio, según los
                                  cálculos seleccionados
  GET  /desktops/{id}/export -> exporta la matriz de datos del escritorio
                                  a hoja de cálculo (.xlsx)
"""
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

import numpy as np

from app.parsers.asc_parser import parse_asc
from app.parsers.emt_parser import parse_emt
from app.parsers.csv_txt_parser import parse_tabular
from app.db.session import Base, engine
from app.db import models  # noqa: F401 (registra los modelos en Base)
from app.routers import auth, desktops, analyze

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Matlab_app API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ajustar en producción a sEMG.actividadfisica.app
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


from fastapi import Depends
from app.routers.auth import get_current_user


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
