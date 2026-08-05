from __future__ import annotations

import io
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from openpyxl import Workbook

from app.db.session import get_db
from app.db.models import Desktop, Subject, ChannelTemplate, AnalysisResult
from app.routers.auth import get_current_user
from app.schemas.desktop import (
    DesktopCreate, DesktopOut,
    SubjectCreate, SubjectOut,
    ChannelTemplateCreate, ChannelTemplateOut,
    AnalysisResultOut,
)

router = APIRouter(prefix="/desktops", tags=["desktops"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[DesktopOut])
def list_desktops(db: Session = Depends(get_db)):
    return db.query(Desktop).order_by(Desktop.updated_at.desc()).all()


@router.post("", response_model=DesktopOut)
def create_desktop(payload: DesktopCreate, db: Session = Depends(get_db)):
    desktop = Desktop(name=payload.name, folder_name=payload.folder_name, edit_link_url=payload.edit_link_url)
    db.add(desktop)
    db.commit()
    db.refresh(desktop)
    return desktop


@router.get("/{desktop_id}", response_model=DesktopOut)
def get_desktop(desktop_id: int, db: Session = Depends(get_db)):
    desktop = db.get(Desktop, desktop_id)
    if not desktop:
        raise HTTPException(404, "Escritorio no encontrado")
    return desktop


@router.post("/{desktop_id}/subjects", response_model=SubjectOut)
def add_subject(desktop_id: int, payload: SubjectCreate, db: Session = Depends(get_db)):
    desktop = db.get(Desktop, desktop_id)
    if not desktop:
        raise HTTPException(404, "Escritorio no encontrado")

    existing_count = db.query(Subject).filter(Subject.desktop_id == desktop_id).count()
    label = f"Sujeto {existing_count + 1}"

    subject = Subject(desktop_id=desktop_id, label=label, group=payload.group)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject


@router.get("/{desktop_id}/subjects", response_model=list[SubjectOut])
def list_subjects(desktop_id: int, db: Session = Depends(get_db)):
    return db.query(Subject).filter(Subject.desktop_id == desktop_id).all()


@router.post("/{desktop_id}/channel-templates", response_model=ChannelTemplateOut)
def create_channel_template(desktop_id: int, payload: ChannelTemplateCreate, db: Session = Depends(get_db)):
    desktop = db.get(Desktop, desktop_id)
    if not desktop:
        raise HTTPException(404, "Escritorio no encontrado")

    template = ChannelTemplate(
        desktop_id=desktop_id,
        name=payload.name,
        mapping_json=json.dumps([item.model_dump() for item in payload.mapping]),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.get("/{desktop_id}/channel-templates", response_model=list[ChannelTemplateOut])
def list_channel_templates(desktop_id: int, db: Session = Depends(get_db)):
    return db.query(ChannelTemplate).filter(ChannelTemplate.desktop_id == desktop_id).all()


@router.get("/{desktop_id}/results", response_model=list[AnalysisResultOut])
def list_results(desktop_id: int, db: Session = Depends(get_db)):
    results = (
        db.query(AnalysisResult)
        .join(Subject, AnalysisResult.subject_id == Subject.id)
        .filter(Subject.desktop_id == desktop_id)
        .all()
    )
    return results


@router.get("/{desktop_id}/export")
def export_desktop(desktop_id: int, db: Session = Depends(get_db)):
    """Exporta la matriz de datos del escritorio a .xlsx: una fila por
    sujeto, una columna por variable (nombre lógico ya generado)."""
    desktop = db.get(Desktop, desktop_id)
    if not desktop:
        raise HTTPException(404, "Escritorio no encontrado")

    subjects = db.query(Subject).filter(Subject.desktop_id == desktop_id).all()

    # Recopilar el conjunto de variables (columnas) presentes
    variable_names: list[str] = []
    rows: list[dict] = []
    for subject in subjects:
        row = {"Sujeto": subject.label, "Grupo": subject.group}
        for result in subject.results:
            if not result.include_in_matrix:
                continue
            row[result.variable_name] = result.value
            if result.variable_name not in variable_names:
                variable_names.append(result.variable_name)
        rows.append(row)

    wb = Workbook()
    ws = wb.active
    ws.title = desktop.name[:31] or "Datos"

    headers = ["Sujeto", "Grupo"] + variable_names
    ws.append(headers)
    for row in rows:
        ws.append([row.get(h, "") for h in headers])

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{desktop.name}.xlsx"'},
    )
