from __future__ import annotations

import datetime as dt

from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class AuthCode(Base):
    __tablename__ = "auth_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    code_hash: Mapped[str] = mapped_column(String(255))
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)


class Desktop(Base):
    """Un 'escritorio': agrupa un estudio con sus sujetos, plantilla de
    canales, cálculos seleccionados y resultados."""
    __tablename__ = "desktops"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    folder_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    edit_link_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    onedrive_folder_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow
    )

    subjects: Mapped[list["Subject"]] = relationship(back_populates="desktop", cascade="all, delete-orphan")
    channel_templates: Mapped[list["ChannelTemplate"]] = relationship(
        back_populates="desktop", cascade="all, delete-orphan"
    )


class ChannelTemplate(Base):
    """Plantilla de mapeo de canales (nombre, lado, tipo de sensor),
    reutilizable entre sujetos del mismo escritorio/estudio."""
    __tablename__ = "channel_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    desktop_id: Mapped[int] = mapped_column(ForeignKey("desktops.id"))
    name: Mapped[str] = mapped_column(String(255))
    # JSON serializado: [{"index":0,"label":"Biceps brachii","side":"R","sensor_type":"emg"}, ...]
    mapping_json: Mapped[str] = mapped_column(Text)

    desktop: Mapped["Desktop"] = relationship(back_populates="channel_templates")


class Subject(Base):
    """Un sujeto/medición dentro de un escritorio: 'Sujeto 1', 'Sujeto 2'..."""
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(primary_key=True)
    desktop_id: Mapped[int] = mapped_column(ForeignKey("desktops.id"))
    label: Mapped[str] = mapped_column(String(255))  # "Sujeto 1", "Sujeto 2"...
    group: Mapped[str] = mapped_column(String(50), default="experimental")  # "control" | "experimental"
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)

    desktop: Mapped["Desktop"] = relationship(back_populates="subjects")
    sessions: Mapped[list["AnalysisSession"]] = relationship(back_populates="subject", cascade="all, delete-orphan")
    results: Mapped[list["AnalysisResult"]] = relationship(back_populates="subject", cascade="all, delete-orphan")


class AnalysisSession(Base):
    """Un análisis concreto (un archivo subido y analizado) para un
    sujeto. Un mismo sujeto puede tener varias sesiones (varias pruebas),
    cada una exportada como su propia fila en el Excel."""
    __tablename__ = "analysis_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    label: Mapped[str] = mapped_column(String(255))  # nombre del archivo analizado, p.ej. "S14_1"
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)

    subject: Mapped["Subject"] = relationship(back_populates="sessions")
    results: Mapped[list["AnalysisResult"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class AnalysisResult(Base):
    """Una variable calculada para una sesión de análisis de un sujeto,
    lista para exportar a la matriz de datos (una fila por sesión). El
    nombre de variable se genera automáticamente (sin espacios ni
    caracteres especiales)."""
    __tablename__ = "analysis_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    session_id: Mapped[int | None] = mapped_column(ForeignKey("analysis_sessions.id"), nullable=True)
    variable_name: Mapped[str] = mapped_column(String(255))  # p.ej. "Biceps_R_RMS_media"
    channel_label: Mapped[str] = mapped_column(String(255))
    metric: Mapped[str] = mapped_column(String(50))  # media|max|mediana|pico|frecuencia|fatiga|ratio|pct_activacion
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    include_in_matrix: Mapped[bool] = mapped_column(Boolean, default=True)

    subject: Mapped["Subject"] = relationship(back_populates="results")
    session: Mapped["AnalysisSession"] = relationship(back_populates="results")
