from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.email_service import send_access_code
from app.core.security import (
    generate_6_digit_code,
    hash_code,
    verify_code,
    create_session_token,
    decode_session_token,
)
from app.db.session import get_db
from app.db.models import AuthCode
from app.schemas.auth import RequestCodeIn, VerifyCodeIn, SessionOut

router = APIRouter(prefix="/auth", tags=["auth"])
bearer_scheme = HTTPBearer()


@router.post("/request-code")
def request_code(payload: RequestCodeIn, db: Session = Depends(get_db)):
    if payload.email.lower() != settings.allowed_email.lower():
        # No revelamos si el correo es válido o no, para no dar pistas.
        return {"detail": "Si el correo es válido, recibirás un código."}

    code = generate_6_digit_code()
    expires_at = dt.datetime.utcnow() + dt.timedelta(minutes=settings.auth_code_expire_minutes)

    db.add(AuthCode(email=payload.email, code_hash=hash_code(code), expires_at=expires_at))
    db.commit()

    send_access_code(payload.email, code)
    return {"detail": "Si el correo es válido, recibirás un código."}


@router.post("/verify-code", response_model=SessionOut)
def verify_code_endpoint(payload: VerifyCodeIn, db: Session = Depends(get_db)):
    record = (
        db.query(AuthCode)
        .filter(AuthCode.email == payload.email, AuthCode.used == False)  # noqa: E712
        .order_by(AuthCode.created_at.desc())
        .first()
    )

    if not record or record.expires_at < dt.datetime.utcnow():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Código no válido o caducado")

    if not verify_code(payload.code, record.code_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Código no válido o caducado")

    record.used = True
    db.commit()

    token = create_session_token(payload.email)
    return SessionOut(access_token=token)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    try:
        email = decode_session_token(credentials.credentials)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión no válida")
    if email.lower() != settings.allowed_email.lower():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No autorizado")
    return email
