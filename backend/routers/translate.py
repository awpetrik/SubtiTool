import asyncio
import hashlib
import uuid
import re
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
    skip_lyrics: str = Form("true"),
    skip_sfx: str = Form("true"),
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

    # Idempotency: cek apakah file yang sama sudah pernah diupload
    file_hash = hashlib.sha1(raw.encode()).hexdigest()
    existing = db.query(Project).filter(Project.file_hash == file_hash).first()
    if existing:
        seg_count = db.query(Segment).filter(Segment.project_id == existing.id).count()
        return {"job_id": None, "project_id": existing.id, "total": seg_count, "resumed": True}

    project = Project(
        title=title, genre=genre, char_context=char_context,
        lang_from=lang_from, lang_to=lang_to, engine=engine,
        file_hash=file_hash,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    is_skip_lyrics = skip_lyrics == "true"
    is_skip_sfx = skip_sfx == "true"
    
    pending_segs_for_job = []
    segments_to_insert = []

    for seg in segments_data:
        text_clean = seg["original"].strip()
        is_skipped = False
        
        if re.sub(r'[\W\d_]', '', text_clean) == "":
            is_skipped = True
            
        if not is_skipped and is_skip_lyrics:
            if text_clean.startswith("♪") or text_clean.endswith("♪") or text_clean.startswith("♫") or text_clean.endswith("♫"):
                is_skipped = True
                
        if not is_skipped and is_skip_sfx:
            if (text_clean.startswith("[") and text_clean.endswith("]")) or (text_clean.startswith("(") and text_clean.endswith(")")):
                if ":" not in text_clean:
                    is_skipped = True
                    
        status = "skipped" if is_skipped else "pending"
        translation = text_clean if is_skipped else ""

        segments_to_insert.append(Segment(
            project_id=project.id,
            index=seg["index"],
            timecode_start=seg["timecode_start"],
            timecode_end=seg["timecode_end"],
            original=seg["original"],
            translation=translation,
            status=status,
        ))
        
        if status == "pending":
            pending_segs_for_job.append(seg)
            
    db.bulk_save_objects(segments_to_insert)
            
    db.commit()

    if engine == "manual":
        return {"job_id": None, "project_id": project.id, "total": len(segments_data)}

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "project_id": project.id,
        "status": "running",
        "processed": 0,
        "total": len(pending_segs_for_job),
        "logs": [],
    }

    background_tasks.add_task(
        _run_translate_job,
        job_id=job_id,
        project_id=project.id,
        segments_data=pending_segs_for_job,
        context={"title": title, "genre": genre, "char_context": char_context,
                 "lang_from": lang_from, "lang_to": lang_to},
        engine_name=engine,
        gemini_key=gemini_api_key,
    )

    return {"job_id": job_id, "project_id": project.id, "total": len(segments_data)}


@router.post("/{project_id}/resume")
async def resume_translate(
    project_id: int,
    background_tasks: BackgroundTasks,
    gemini_api_key: str = Form(""),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    pending_segs = db.query(Segment).filter(Segment.project_id == project_id, Segment.status == "pending").order_by(Segment.index).all()
    
    if not pending_segs:
        return {"job_id": None, "project_id": project.id, "total": 0}

    pending_segs_for_job = [{"index": s.index, "original": s.original, "timecode_start": s.timecode_start, "timecode_end": s.timecode_end} for s in pending_segs]

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "project_id": project.id,
        "status": "running",
        "processed": 0,
        "total": len(pending_segs_for_job),
        "logs": [],
    }

    background_tasks.add_task(
        _run_translate_job,
        job_id=job_id,
        project_id=project.id,
        segments_data=pending_segs_for_job,
        context={"title": project.title, "genre": project.genre, "char_context": project.char_context,
                 "lang_from": project.lang_from, "lang_to": project.lang_to},
        engine_name=project.engine,
        gemini_key=gemini_api_key,
    )

    return {"job_id": job_id, "project_id": project.id, "total": len(pending_segs)}


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

    import logging as _log
    _logger = _log.getLogger(__name__)
    try:
        all_translated: list[str] = []
        failed_batches = []

        for i in range(0, len(lines), BATCH_SIZE):
            context_start = max(0, i - OVERLAP)
            batch_lines = lines[context_start: i + BATCH_SIZE]

            try:
                translated = await translate_engine.translate_batch(batch_lines, context, glossary)
            except Exception as batch_err:
                _logger.error(f"Batch {i // BATCH_SIZE + 1} gagal: {batch_err}")
                failed_batches.append(i // BATCH_SIZE + 1)
                # Fallback: isi dengan original text, jangan crash seluruh job
                effective_batch = batch_lines[OVERLAP:] if i > 0 else batch_lines
                translated = (batch_lines[:OVERLAP] if i > 0 else []) + effective_batch
                job["logs"].append(f"⚠ Batch {i // BATCH_SIZE + 1} gagal, lanjut batch berikutnya")

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
            job["logs"].append(f"Batch {i // BATCH_SIZE + 1}: {job['processed']}/{job['total']} baris selesai")

        job["status"] = "done_partial" if failed_batches else "done"
        if failed_batches:
            job["error"] = f"Batch gagal: {failed_batches} — sisa berhasil disimpan"
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

            if job.get("status") in ("done", "done_partial", "error"):
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
    
    # Ambil 5 baris sebelum dan sesudah untuk context hinting agar terjemahan luwes
    surrounding_segs = db.query(Segment).filter(
        Segment.project_id == project_id,
        Segment.index >= seg.index - 3,
        Segment.index <= seg.index + 3,
        Segment.id != seg.id,
    ).order_by(Segment.index).all()
    surr_text = "\\n".join(s.original for s in surrounding_segs if s.original.strip())
    
    if payload.translation_hint:
        context["hint"] = payload.translation_hint + f"\\n\\n[Surrounding Reference (from {project.lang_from}): {surr_text}]"
    else:
        context["hint"] = f"[Surrounding Reference (from {project.lang_from}): {surr_text}]"

    try:
        engine_name = project.engine
        
        # Upgrade to Gemini automatically if key is provided (Contextual Pro feature)
        if payload.gemini_api_key:
            engine_name = "gemini"
        elif engine_name == "manual":
            # Fallback for manual project without key
            engine_name = "google_free"
            
        engine = _get_engine(engine_name, payload.gemini_api_key)
        # Hack override prompt via hint if contextual translation is active
        result = await engine.translate_batch([seg.original], context, glossary)
        seg.translation = result[0] if result else seg.translation
        seg.status = "ai_done"
        db.commit()
        db.refresh(seg)
        return _segment_dict(seg)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class TranslateTextRequest(BaseModel):
    text: str
    gemini_api_key: Optional[str] = None

@router.post("/{project_id}/text")
async def translate_text_snippet(
    project_id: int,
    payload: TranslateTextRequest,
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    glossary_entries = db.query(Glossary).filter(Glossary.project_id == project_id).all()
    glossary = [{"source_term": g.source_term, "target_term": g.target_term} for g in glossary_entries]

    context = {
        "title": project.title, "genre": project.genre,
        "char_context": project.char_context,
        "lang_from": project.lang_from, "lang_to": project.lang_to,
    }

    try:
        # User requested to force Google Translate for contextual translation
        engine = _get_engine("google_free", None)
        result = await engine.translate_batch([payload.text], context, glossary)
        return {"translation": result[0] if result else ""}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Gagal terhubung ke layanan terjemahan. Pastikan internet aktif!")


class RefineRequest(BaseModel):
    selected_text: str
    full_original: str
    action: str  # 'shorten' or 'rephrase'
    gemini_api_key: Optional[str] = None


@router.post("/{project_id}/refine")
async def refine_snippet(
    project_id: int,
    payload: RefineRequest,
    db: Session = Depends(get_db)
):
    # Error fallback Google Free: Karena shortening/rephrasing pakai Google Free Translate biasa 
    # sangat buruk (hanya translate word-by-word), kita beritahu user bahwa fitur Pro ini butuh Gemini.
    if not payload.gemini_api_key:
        raise HTTPException(
            status_code=400, 
            detail="Fitur '✂️ Shorten' & '✨ Rephrase' khusus didesain untuk AI. Masukkan API Key Gemini Anda di pojok kanan atas untuk membukanya."
        )

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")

    action_prompt = f"Significantly shorten the localization text to meet strict Netflix CPS (Characters Per Second) limits without reducing its core meaning. The output MUST stay in {project.lang_to}."
    if payload.action == "rephrase":
        action_prompt = f"Rephrase the localization text to be much more natural, idiomatic, and fluid based on the genre. Eliminate robotic translations. The output MUST stay in {project.lang_to}."

    prompt = f"""You are an elite subtitle localization editor working on a high-end production.
Project Guidance:
- Target Language: {project.lang_to}
- Genre/Theme: {project.genre}
- Key Character Dynamics: {project.char_context}

Original Full Line (for context):
"{payload.full_original}"

The localized text piece you need to fix:
"{payload.selected_text}"

Task: {action_prompt} 
(Output ONLY the raw repaired {project.lang_to} text. No Markdown block, no preamble, DO NOT wrap with quotes, DO NOT explain)."""

    try:
        from google import genai
        client = genai.Client(api_key=payload.gemini_api_key)
        
        # Use native async for much faster response and less blocking
        if hasattr(client, "aio"):
            response = await client.aio.models.generate_content(
                model="gemini-3-flash-preview", contents=prompt
            )
        else:
            # Fallback legacy sdk
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, lambda: client.models.generate_content(
                    model="gemini-3-flash-preview", contents=prompt
                )
            )
        return {"result": response.text.strip().strip('"').strip("'")}
    except Exception as e:
        err_msg = str(e).lower()
        if "api key" in err_msg or "invalid" in err_msg:
            raise HTTPException(status_code=400, detail="Gemini API Key Anda tidak aktif/invalid.")
        raise HTTPException(status_code=500, detail=f"AI sedang sibuk, harap coba lagi. Error: {str(e)}")
