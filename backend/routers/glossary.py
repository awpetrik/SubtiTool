from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import get_db
from models import Glossary

router = APIRouter(prefix="/api/projects", tags=["glossary"])


class GlossaryCreate(BaseModel):
    source_term: str
    target_term: str
    note: str = ""


@router.get("/{project_id}/glossary")
def get_glossary(project_id: int, db: Session = Depends(get_db)):
    return db.query(Glossary).filter(Glossary.project_id == project_id).all()


@router.post("/{project_id}/glossary", status_code=201)
def add_glossary(project_id: int, payload: GlossaryCreate, db: Session = Depends(get_db)):
    entry = Glossary(project_id=project_id, **payload.dict())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{project_id}/glossary/{entry_id}")
def delete_glossary(project_id: int, entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(Glossary).filter(Glossary.id == entry_id, Glossary.project_id == project_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Glossary entry tidak ditemukan")
    db.delete(entry)
    db.commit()
    return {"ok": True}
