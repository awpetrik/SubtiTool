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


async def process_video(task_id: str, input_path: Path, output_path: Path):
    try:
        conversion_tasks[task_id]["status"] = "converting"
        
        audio_output_path = TEMP_DIR / f"{task_id}_proxy_audio.mp3"
        
        # ffmpeg command with multi-output!
        cmd = [
            "ffmpeg", "-i", str(input_path),
            
            # Output 1: The Proxy Video
            "-vcodec", "libx264",
            "-vf", "scale=-2:480",
            "-b:v", "800k",
            "-acodec", "aac",
            "-b:a", "128k",
            "-preset", "ultrafast",
            "-movflags", "+faststart",
            "-y", str(output_path),
            
            # Output 2: The Ultra-Lightweight Audio for WaveSurfer JSON bypassing OOM
            "-vn", 
            "-acodec", "libmp3lame",
            "-ar", "8000",
            "-ac", "1",
            "-b:a", "16k",
            "-y", str(audio_output_path)
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE
        )
        
        duration_regex = re.compile(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)")
        time_regex = re.compile(r"time=(\d+):(\d+):(\d+\.\d+)")
        
        duration = 0
        ffmpeg_log_buffer = [] # To store recent log lines for error context
        
        while True:
            chunk = await process.stderr.read(1024) # Read in chunks
            if not chunk:
                break
            line_str = chunk.decode("utf-8", errors="replace")
            
            # Keep a limited buffer of log lines for error context
            ffmpeg_log_buffer.extend(line_str.splitlines())
            # Keep only the last 10 lines to prevent excessive memory usage
            if len(ffmpeg_log_buffer) > 10:
                ffmpeg_log_buffer = ffmpeg_log_buffer[-10:]
            
            if duration == 0:
                d_match = duration_regex.search(line_str)
                if d_match:
                    h, m, s = d_match.groups()
                    duration = int(h) * 3600 + int(m) * 60 + float(s)
                    
            # Find all time matches in the current chunk and take the last one for progress
            matches = time_regex.findall(line_str)
            if matches and duration > 0:
                h, m, s = matches[-1] # Take the last match in the chunk
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
            error_details = "".join(ffmpeg_log_buffer[-5:]).strip()
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
