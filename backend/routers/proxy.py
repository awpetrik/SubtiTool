import os
import uuid
import ffmpeg
from fastapi import APIRouter, File, UploadFile, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path

router = APIRouter(prefix="/api/proxy", tags=["proxy"])

TEMP_DIR = Path("temp_proxies")
TEMP_DIR.mkdir(exist_ok=True)

def cleanup_file(filepath: Path):
    if filepath.exists():
        os.remove(filepath)

@router.post("/convert")
async def convert_to_proxy(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not file.filename:
        return JSONResponse(status_code=400, content={"error": "File tidak valid."})
        
    ext = Path(file.filename).suffix
    unique_id = str(uuid.uuid4())
    input_path = TEMP_DIR / f"{unique_id}_raw{ext}"
    output_path = TEMP_DIR / f"{unique_id}_proxy.mp4"
    
    # Simpan file upload ke disk
    with open(input_path, "wb") as buffer:
        buffer.write(await file.read())
        
    try:
        # Eksekusi FFmpeg: downscale ke 480p, bitrate rendah, optimasi untuk web streaming cepat
        stream = ffmpeg.input(str(input_path))
        stream = ffmpeg.output(
            stream, 
            str(output_path),
            vcodec='libx264',
            vf='scale=-2:480',  # Lebar otomatis, tinggi 480p
            video_bitrate='800k',
            acodec='aac',
            audio_bitrate='128k',
            preset='ultrafast',
            movflags='+faststart' # Biar video lgsg main sebelum donlot selesai semua
        )
        ffmpeg.run(stream, overwrite_output=True, quiet=True)
    except ffmpeg.Error as e:
        cleanup_file(input_path)
        cleanup_file(output_path)
        return JSONResponse(status_code=500, content={"error": f"Gagal convert video: {str(e)}"})
        
    # File ori udah ga dibutuhin, lgsg hapus buat hemat memori cloud
    cleanup_file(input_path)
    
    # Jadwalkan hapus hasil proxy saat request kelar 
    # (Idealnya pake cron/job lain klo proxy mo disimpan lama, 
    # tp untuk on-the-fly streaming sementara gini gpp)
    background_tasks.add_task(cleanup_file, output_path)
    
    return FileResponse(
        path=output_path, 
        media_type="video/mp4",
        filename=f"proxy_720p.mp4"
    )
