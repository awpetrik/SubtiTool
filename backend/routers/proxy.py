import os
import uuid
import asyncio
import re
import ffmpeg
from fastapi import APIRouter, File, UploadFile, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path

router = APIRouter(prefix="/api/proxy", tags=["proxy"])

TEMP_DIR = Path("temp_proxies")
TEMP_DIR.mkdir(exist_ok=True)

conversion_tasks = {}

def cleanup_file(filepath: Path):
    if filepath.exists():
        try:
            os.remove(filepath)
        except:
            pass

def get_duration(filepath: str):
    try:
        probe = ffmpeg.probe(filepath)
        return float(probe['format']['duration'])
    except:
        return 0

async def process_video(task_id: str, input_path: Path, output_path: Path):
    try:
        duration = get_duration(str(input_path))
        conversion_tasks[task_id]["status"] = "converting"
        
        # ffmpeg command
        cmd = [
            "ffmpeg", "-i", str(input_path),
            "-vcodec", "libx264",
            "-vf", "scale=-2:480",
            "-b:v", "800k",
            "-acodec", "aac",
            "-b:a", "128k",
            "-preset", "ultrafast",
            "-movflags", "+faststart",
            "-y", str(output_path)
        ]
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE
        )
        
        time_regex = re.compile(r"time=(\d+):(\d+):(\d+.\d+)")
        
        ffmpeg_log = []
        
        while True:
            line = await process.stderr.readline()
            if not line:
                break
            line_str = line.decode("utf-8", errors="replace")
            ffmpeg_log.append(line_str)
            match = time_regex.search(line_str)
            if match and duration > 0:
                h, m, s = match.groups()
                current_time = int(h) * 3600 + int(m) * 60 + float(s)
                progress = min(99, int((current_time / duration) * 100))
                conversion_tasks[task_id]["progress"] = progress

        await process.wait()
        
        if process.returncode == 0:
            conversion_tasks[task_id]["status"] = "done"
            conversion_tasks[task_id]["progress"] = 100
        else:
            conversion_tasks[task_id]["status"] = "error"
            # Return last few lines of the error for context
            error_details = "".join(ffmpeg_log[-5:]).strip()
            conversion_tasks[task_id]["error"] = f"FFmpeg error: {error_details}"
            
    except Exception as e:
        conversion_tasks[task_id]["status"] = "error"
        conversion_tasks[task_id]["error"] = str(e)
    finally:
        cleanup_file(input_path)

@router.post("/convert")
async def start_proxy_conversion(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not file.filename:
        return JSONResponse(status_code=400, content={"error": "File tidak valid."})
        
    ext = Path(file.filename).suffix
    task_id = str(uuid.uuid4())
    input_path = TEMP_DIR / f"{task_id}_raw{ext}"
    output_path = TEMP_DIR / f"{task_id}_proxy.mp4"
    
    conversion_tasks[task_id] = {
        "status": "uploading",
        "progress": 0,
        "filename": file.filename
    }
    
    # Save the chunk to disk
    with open(input_path, "wb") as buffer:
        while content := await file.read(1024 * 1024):  # 1MB chunks
            buffer.write(content)
        
    background_tasks.add_task(process_video, task_id, input_path, output_path)
    
    return {"task_id": task_id}

@router.get("/status/{task_id}")
async def get_status(task_id: str):
    if task_id not in conversion_tasks:
        return JSONResponse(status_code=404, content={"error": "Task not found"})
    return conversion_tasks[task_id]
