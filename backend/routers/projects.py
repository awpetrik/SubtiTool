from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import get_db
from models import Project, Segment, Glossary

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    title: str
    genre: str = ""
    char_context: str = ""
    lang_from: str = "en"
    lang_to: str = "id"
    engine: str = "gemini"


class SegmentUpdate(BaseModel):
    translation: Optional[str] = None
    status: Optional[str] = None
    flag_note: Optional[str] = None


def _project_dict(p) -> dict:
    return {
        "id": p.id, "title": p.title, "genre": p.genre,
        "char_context": p.char_context, "lang_from": p.lang_from,
        "lang_to": p.lang_to, "engine": p.engine,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _segment_dict(s) -> dict:
    return {
        "id": s.id, "project_id": s.project_id, "index": s.index,
        "timecode_start": s.timecode_start, "timecode_end": s.timecode_end,
        "original": s.original, "translation": s.translation,
        "status": s.status, "flag_note": s.flag_note,
    }


def _glossary_dict(g) -> dict:
    return {
        "id": g.id, "project_id": g.project_id,
        "source_term": g.source_term, "target_term": g.target_term, "note": g.note,
    }


@router.post("", status_code=201)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(**payload.dict())
    db.add(project)
    db.commit()
    db.refresh(project)
    return _project_dict(project)


@router.get("/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")
    segments = db.query(Segment).filter(Segment.project_id == project_id).order_by(Segment.index).all()
    glossary = db.query(Glossary).filter(Glossary.project_id == project_id).all()
    return {
        "project": _project_dict(project),
        "segments": [_segment_dict(s) for s in segments],
        "glossary": [_glossary_dict(g) for g in glossary],
    }


@router.get("")
def list_projects(db: Session = Depends(get_db)):
    return [_project_dict(p) for p in db.query(Project).order_by(Project.created_at.desc()).all()]


@router.patch("/{project_id}/segments/{seg_id}")
def update_segment(project_id: int, seg_id: int, payload: SegmentUpdate, db: Session = Depends(get_db)):
    seg = db.query(Segment).filter(Segment.id == seg_id, Segment.project_id == project_id).first()
    if not seg:
        raise HTTPException(status_code=404, detail="Segment tidak ditemukan")
    valid_statuses = {"pending", "ai_done", "flagged", "in_review", "approved"}
    if payload.status and payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status tidak valid. Pilihan: {valid_statuses}")
    for field, value in payload.dict(exclude_none=True).items():
        setattr(seg, field, value)
    db.commit()
    db.refresh(seg)
    return _segment_dict(seg)


@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")
    db.delete(project)
    db.commit()
    return {"ok": True}
