from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Único correo autorizado a entrar en la app
    allowed_email: str = "cambia-esto@ejemplo.com"

    database_url: str = "sqlite:///./dev.db"

    jwt_secret: str = "cambia-este-secreto-en-produccion"
    jwt_algorithm: str = "HS256"
    session_expire_minutes: int = 60 * 24 * 30  # 30 días

    auth_code_expire_minutes: int = 10

    # Envío de email (Resend). Si no se configura, el código se imprime
    # en consola (útil en desarrollo local).
    resend_api_key: str | None = None
    email_from: str = "Matlab_app <onboarding@resend.dev>"

    class Config:
        env_file = ".env"


settings = Settings()
