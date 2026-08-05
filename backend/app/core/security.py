from __future__ import annotations

import datetime as dt
import hashlib
import secrets

from jose import jwt

from app.core.config import settings


def generate_6_digit_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def verify_code(code: str, code_hash: str) -> bool:
    return hash_code(code) == code_hash


def create_session_token(email: str) -> str:
    expire = dt.datetime.utcnow() + dt.timedelta(minutes=settings.session_expire_minutes)
    payload = {"sub": email, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_session_token(token: str) -> str:
    """Devuelve el email si el token es válido; lanza excepción si no."""
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    return payload["sub"]
