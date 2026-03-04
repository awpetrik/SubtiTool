import re
from typing import List, Dict


def parse_srt(content: str) -> List[Dict]:
    """Parse SRT content menjadi list of segment dict.
    Handles both Unix (\n) dan Windows (\r\n) line endings.
    """
    # Normalize semua line endings ke \n
    content = content.replace('\r\n', '\n').replace('\r', '\n')

    # Split berdasarkan baris kosong (satu atau lebih)
    blocks = re.split(r'\n{2,}', content.strip())

    segments = []
    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue

        # Baris pertama harus nomor urut
        try:
            index = int(lines[0].strip())
        except ValueError:
            continue

        # Baris kedua harus timecode
        timecode_line = lines[1].strip()
        match = re.match(r'(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}[,\.]\d{3})', timecode_line)
        if not match:
            continue

        start = match.group(1).replace('.', ',')
        end = match.group(2).replace('.', ',')

        # Sisa baris = teks subtitle (bisa multi-line, pertahankan HTML tags)
        text = '\n'.join(lines[2:]).strip()

        if not text:
            continue

        segments.append({
            'index': index,
            'timecode_start': start,
            'timecode_end': end,
            'original': text,
        })

    return segments


def serialize_srt(segments: List[Dict]) -> str:
    """Konversi list segment dict kembali ke format SRT string."""
    parts = []
    for seg in segments:
        translation = seg.get('translation') or seg.get('original', '')
        parts.append(
            f"{seg['index']}\n"
            f"{seg['timecode_start']} --> {seg['timecode_end']}\n"
            f"{translation}"
        )
    return '\n\n'.join(parts) + '\n'
