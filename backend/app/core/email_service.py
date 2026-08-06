from __future__ import annotations

import httpx

from app.core.config import settings


def send_access_code(email: str, code: str) -> None:
    """Envía el código de 6 cifras al correo autorizado.

    Si no hay RESEND_API_KEY configurada (desarrollo local), simplemente
    lo imprime en consola para poder probar el flujo sin enviar emails
    reales. Ojo: si esto ocurre en producción normalmente significa que
    falta configurar RESEND_API_KEY en las variables de entorno del
    servidor — revisa los logs si "no llega el código".
    """
    if not settings.resend_api_key:
        print(f"[auth][AVISO] RESEND_API_KEY no configurada: código para {email} solo impreso, no enviado por correo: {code}")
        return

    response = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        json={
            "from": settings.email_from,
            "to": [email],
            "subject": "Tu código de acceso a Matlab_app",
            "html": f"<p>Tu código de acceso es: <strong>{code}</strong></p>"
                    f"<p>Caduca en {settings.auth_code_expire_minutes} minutos.</p>",
        },
        timeout=10.0,
    )
    response.raise_for_status()
