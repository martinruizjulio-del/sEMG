from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class DesktopCreate(BaseModel):
    name: str
    folder_name: Optional[str] = None
    edit_link_url: Optional[str] = None


class DesktopOut(BaseModel):
    id: int
    name: str
    folder_name: Optional[str]
    edit_link_url: Optional[str]

    class Config:
        from_attributes = True


class DesktopUpdate(BaseModel):
    edit_link_url: Optional[str] = None


class SubjectCreate(BaseModel):
    group: Literal["control", "experimental"] = "experimental"


class SubjectOut(BaseModel):
    id: int
    label: str
    group: str

    class Config:
        from_attributes = True


class ChannelMappingItem(BaseModel):
    index: int
    label: str
    side: Optional[Literal["R", "L"]] = None
    sensor_type: Literal["emg", "accelerometer", "force_platform", "raw"] = "emg"


class ChannelTemplateCreate(BaseModel):
    name: str
    mapping: list[ChannelMappingItem]


class ChannelTemplateOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class AnalysisResultOut(BaseModel):
    id: int
    subject_id: int
    session_id: Optional[int]
    session_label: Optional[str] = None
    variable_name: str
    channel_label: str
    metric: str
    value: float
    unit: Optional[str]
    include_in_matrix: bool

    class Config:
        from_attributes = True


class AnalysisResultUpdate(BaseModel):
    include_in_matrix: bool
