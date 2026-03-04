import re
from typing import List, Dict


def parse_srt(content: str) -> List[Dict]:
    content = content.replace('\r\n', '\n').replace('\r', '\n')
    blocks = re.split(r'\n{2,}', content.strip())
    segments = []
    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        try:
            index = int(lines[0].strip())
        except ValueError:
            continue
        timecode_line = lines[1].strip()
        match = re.match(r'(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[,\.]\d{3})', timecode_line)
        if not match:
            continue
        start = match.group(1).replace('.', ',')
        end = match.group(2).replace('.', ',')
        text = '\n'.join(lines[2:]).strip()
        if not text:
            continue
        segments.append({'index': index, 'timecode_start': start, 'timecode_end': end, 'original': text})
    return segments


def serialize_srt(segments: List[Dict]) -> str:
    parts = []
    for seg in segments:
        translation = seg.get('translation') or seg.get('original', '')
        parts.append(f"{seg['index']}\n{seg['timecode_start']} --> {seg['timecode_end']}\n{translation}")
    return '\n\n'.join(parts) + '\n'
