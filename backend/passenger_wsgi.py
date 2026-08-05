"""
Punto de entrada para Phusion Passenger (Plesk).

Plesk/Passenger esperan una app WSGI (como Flask o Django), pero
FastAPI es ASGI. Este archivo adapta la app con `a2wsgi` para que
Passenger pueda servirla.

Configuración en Plesk (subdominio api.actividadfisica.app):
  - Application Root: backend/
  - Application Startup File: passenger_wsgi.py
  - Application Entry point: application
  - Ejecutar "Run pip install" tras subir requirements.txt
  - Variables de entorno: ALLOWED_EMAIL, JWT_SECRET, DATABASE_URL, RESEND_API_KEY
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from a2wsgi import ASGIMiddleware
from app.main import app as fastapi_app

application = ASGIMiddleware(fastapi_app)
