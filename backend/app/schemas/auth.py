from __future__ import annotations

from pydantic import BaseModel, EmailStr


class RequestCodeIn(BaseModel):
    email: EmailStr


class VerifyCodeIn(BaseModel):
    email: EmailStr
    code: str


class SessionOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
