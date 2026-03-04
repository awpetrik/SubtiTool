import asyncio
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import get_db
from models import Project, Segment, Glossary
from services.srt_parser import parse_srt
from routers.projects import _segment_dict
from services.engines.gemini import GeminiEngine
from services.engines.google_free import GoogleFreeEngine
from services.engines.libretranslate import LibreTranslateEngine

router = APIRouter(prefix="/api/translate", tags=["translate"])

_jobs: dict = {}
BATCH_SIZE = 40
OVERLAP = 5


class RetranslateRequest(BaseModel):
    translation_hint: Optional[str] = None
    gemini_api_key: Optional[str] = None


def _get_engine(engine_name: str, gemini_key: Optional[str]):
    if engine_name == "gemini":
        return GeminiEngine(api_key=gemini_key or "")
    if engine_name == "google_free":
        return GoogleFreeEngine()
    if engine_name == "libretranslate":
        return LibreTranslateEngine()
    raise ValueError(f"Engine tidak dikenal: {engine_name}")


@router.post("")
async def start_translate(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    genre: str = Form(""),
    char_context: str = Form(""),
    lang_from: str = Form("en"),
    lang_to: str = Form("id"),
    engine: str = Form("google_free"),
    gemini_api_key: str = Form(""),
    db: Session = Depends(get_db),
):
    content = await file.read()
    try:
        raw = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raw = content.decode("latin-1")

    segments_data = parse_srt(raw)
    if not segments_data:
        raise HTTPException(status_code=400, detail="File SRT tidak valid atau kosong.")

    project = Project(
        title=title, genre=genre, char_context=char_context,
        lang_from=lang_from, lang_to=lang_to, engine=engine,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    for seg in segments_data:
        db.add(Segment(
            project_id=project.id,
            index=seg["index"],
            timecode_start=seg["timecode_start"],
            timecode_end=seg["timecode_end"],
            original=seg["original"],
            translation="",
            status="pending",
        ))
    db.commit()

    if engine == "manual":
        return {"job_id": None, "project_id": project.id, "total": len(segments_data)}

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "project_id": project.id,
        "status": "running",
        "processed": 0,
        "total": len(segments_data),
        "logs": [],
    }

    background_tasks.add_task(
        _run_translate_job,
        job_id=job_id,
        project_id=project.id,
        segments_data=segments_data,
        context={"title": title, "genre": genre, "char_context": char_context,
                 "lang_from": lang_from, "lang_to": lang_to},
        engine_name=engine,
        gemini_key=gemini_api_key,
    )

    return {"job_id": job_id, "project_id": project.id, "total": len(segments_data)}


def _run_translate_job(job_id, project_id, segments_data, context, engine_name, gemini_key):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(
            _run_translate_job_async(job_id, project_id, segments_data, context, engine_name, gemini_key)
        )
    except Exception as e:
        if job_id in _jobs:
            _jobs[job_id]["status"] = "error"
            _jobs[job_id]["error"] = str(e)
    finally:
        loop.close()


async def _run_translate_job_async(job_id, project_id, segments_data, context, engine_name, gemini_key):
    from db import SessionLocal
    db = SessionLocal()
    job = _jobs[job_id]

    try:
        translate_engine = _get_engine(engine_name, gemini_key)
    except ValueError as e:
        job["status"] = "error"
        job["error"] = str(e)
        db.close()
        return

    glossary_entries = db.query(Glossary).filter(Glossary.project_id == project_id).all()
    glossary = [{"source_term": g.source_term, "target_term": g.target_term} for g in glossary_entries]
    lines = [seg["original"] for seg in segments_data]

    try:
        all_translated: list[str] = []
        for i in range(0, len(lines), BATCH_SIZE):
            context_start = max(0, i - OVERLAP)
            batch_lines = lines[context_start: i + BATCH_SIZE]
            translated = await translate_engine.translate_batch(batch_lines, context, glossary)

            if i > 0:
                translated = translated[OVERLAP:]
            all_translated.extend(translated)

            for idx_offset, trans in enumerate(translated):
                seg_index = (len(all_translated) - len(translated)) + idx_offset
                if seg_index >= len(segments_data):
                    break
                orig_seg = segments_data[seg_index]
                db.query(Segment).filter(
                    Segment.project_id == project_id,
                    Segment.index == orig_seg["index"]
                ).update({"translation": trans, "status": "ai_done"})

            db.commit()
            job["processed"] = min(len(all_translated), len(lines))
            job["logs"].append(f"Batch {i//BATCH_SIZE + 1}: {job['processed']}/{job['total']} baris selesai")

        job["status"] = "done"
    except Exception as e:
        job["status"] = "error"
        job["error"] = str(e)
    finally:
        db.close()


@router.get("/{job_id}/progress")
async def get_progress(job_id: str):
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan")

    async def event_stream():
        sent_logs = 0
        while True:
            job = _jobs.get(job_id, {})
            logs = job.get("logs", [])

            for log in logs[sent_logs:]:
                yield f"data: {log}\n\n"
                sent_logs += 1

            yield (
                f"event: progress\n"
                f"data: processed={job.get('processed', 0)}&"
                f"total={job.get('total', 0)}&"
                f"status={job.get('status', 'running')}\n\n"
            )

            if job.get("status") in ("done", "error"):
                yield f"event: done\ndata: status={job['status']}&error={job.get('error', '')}\n\n"
                break

            await asyncio.sleep(0.8)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{project_id}/segment/{seg_id}")
async def retranslate_segment(
    project_id: int,
    seg_id: int,
    payload: RetranslateRequest,
    db: Session = Depends(get_db),
):
    seg = db.query(Segment).filter(Segment.id == seg_id, Segment.project_id == project_id).first()
    if not seg:
        raise HTTPException(status_code=404, detail="Segment tidak ditemukan")

    project = db.query(Project).filter(Project.id == project_id).first()
    glossary_entries = db.query(Glossary).filter(Glossary.project_id == project_id).all()
    glossary = [{"source_term": g.source_term, "target_term": g.target_term} for g in glossary_entries]

    context = {
        "title": project.title, "genre": project.genre,
        "char_context": project.char_context,
        "lang_from": project.lang_from, "lang_to": project.lang_to,
    }
    if payload.translation_hint:
        context["hint"] = payload.translation_hint

    try:
        engine = _get_engine(project.engine, payload.gemini_api_key)
        result = await engine.translate_batch([seg.original], context, glossary)
        seg.translation = result[0] if result else seg.translation
        seg.status = "ai_done"
        db.commit()
        db.refresh(seg)
        return _segment_dict(seg)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
