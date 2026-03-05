from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from typing import Optional

from db import get_db
from models import Project, Segment
from services.srt_parser import serialize_srt
from services import subsource

router = APIRouter(tags=["export"])


@router.get("/api/projects/{project_id}/export", response_class=PlainTextResponse)
def export_srt(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    segments = db.query(Segment).filter(Segment.project_id == project_id).order_by(Segment.index).all()
    data = [
        {
            "index": s.index,
            "timecode_start": s.timecode_start,
            "timecode_end": s.timecode_end,
            "original": s.original,
            "translation": s.translation,
            "status": s.status,
        }
        for s in segments
    ]
    srt_content = serialize_srt(data)
    filename = f"{project.title.replace(' ', '_')}_{project.lang_to}.srt"
    return PlainTextResponse(
        content=srt_content,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        media_type="application/x-subrip; charset=utf-8",
    )


@router.get("/api/subsource/search")
async def subsource_search(
    q: str = Query(..., min_length=1),
    api_key: Optional[str] = Query(None),
):
    result = await subsource.search_movie(q, api_key)
    return result
