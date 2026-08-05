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

from app.parsers.asc_parser import parse_asc
from app.parsers.emt_parser import parse_emt
from app.parsers.csv_txt_parser import parse_tabular
from app.db.session import Base, engine
from app.db import models  # noqa: F401 (registra los modelos en Base)
from app.routers import auth, desktops

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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/parse-preview")
async def parse_preview(file: UploadFile = File(...)):
    """Endpoint de prueba: sube un archivo y devuelve metadatos detectados
    (canales, fs, nº de muestras) sin guardar nada, para validar el parser
    contra archivos reales antes de construir el resto del flujo."""
    raw_bytes = await file.read()
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw_bytes.decode("latin-1", errors="ignore")
    name = file.filename.lower()

    if name.endswith(".asc"):
        parsed = parse_asc(text)
        return {
            "format": "asc",
            "fs": parsed.fs,
            "channels": parsed.channel_names,
            "n_samples": parsed.data.shape[0],
            "n_channels": parsed.data.shape[1] if parsed.data.ndim > 1 else 1,
        }
    if name.endswith(".emt"):
        parsed = parse_emt(text)
        return {
            "format": "emt",
            "fs": parsed.fs,
            "channels": parsed.channel_names,
            "n_samples": parsed.data_uv.shape[0],
            "n_channels": parsed.data_uv.shape[1],
        }
    # csv / txt genérico
    parsed = parse_tabular(text)
    return {
        "format": "tabular",
        "channels": parsed.column_names,
        "n_samples": parsed.data.shape[0],
        "n_channels": parsed.data.shape[1],
    }
