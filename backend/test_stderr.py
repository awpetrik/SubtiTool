import asyncio
import re

async def run():
    cmd = [
        "ffmpeg", "-f", "lavfi", "-i", "testsrc=duration=5",
        "-vcodec", "libx264", "-y", "/tmp/test.mp4"
    ]
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE
    )

    time_regex = re.compile(r"time=(\d+):(\d+):(\d+.\d+)")

    while True:
        try:
            line = await process.stderr.readuntil(b'\r')
        except asyncio.exceptions.IncompleteReadError as e:
            line = e.partial
        if not line:
            break
        print("Read:", line.decode("utf-8", errors="replace").strip()[:50])
        
    await process.wait()

asyncio.run(run())
