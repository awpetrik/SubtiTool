import re
from typing import List, Dict

def parse_srt(content: str) -> List[Dict]:
    """Parse SRT content menjadi list of segment dict."""
    blocks = re.split(r"\n\n+", content.strip())
    segments = []
    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        try:
            index = int(lines[0].strip())
        except ValueError:
            continue
        timecodes = lines[1].strip()
        match = re.match(r"(\S+)\s+-->\s+(\S+)", timecodes)
        if not match:
            continue
        start, end = match.group(1), match.group(2)
        text = "\n".join(lines[2:]).strip()
        segments.append({
            "index": index,
            "timecode_start": start,
            "timecode_end": end,
            "original": text,
        })
    return segments


def serialize_srt(segments: List[Dict]) -> str:
    """Konversi list segment dict kembali ke format SRT string."""
    parts = []
    for seg in segments:
        translation = seg.get("translation") or seg.get("original", "")
        parts.append(
            f"{seg['index']}\n"
            f"{seg['timecode_start']} --> {seg['timecode_end']}\n"
            f"{translation}"
        )
    return "\n\n".join(parts) + "\n"
