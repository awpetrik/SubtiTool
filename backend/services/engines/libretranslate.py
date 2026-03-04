import asyncio
import logging
import os
from typing import List, Dict

import httpx

from services.translator import TranslateEngine

logger = logging.getLogger(__name__)

LIBRETRANSLATE_URL = os.getenv("LIBRETRANSLATE_URL", "http://localhost:5000")


class LibreTranslateEngine(TranslateEngine):
    """Engine self-hosted LibreTranslate — fully offline/private."""

    async def translate_batch(self, lines: List[str], context: Dict, glossary: List[Dict]) -> List[str]:
        lang_from = context.get("lang_from", "en")
        lang_to = context.get("lang_to", "id")
        results = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            for line in lines:
                if not line.strip():
                    results.append(line)
                    continue
                try:
                    resp = await client.post(
                        f"{LIBRETRANSLATE_URL}/translate",
                        json={"q": line, "source": lang_from, "target": lang_to, "format": "text"},
                    )
                    resp.raise_for_status()
                    results.append(resp.json().get("translatedText", line))
                except Exception as e:
                    logger.warning(f"LibreTranslate error: {e}")
                    results.append(line)

        return results
