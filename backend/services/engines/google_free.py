import asyncio
import logging
from typing import List, Dict

from deep_translator import GoogleTranslator

from services.translator import TranslateEngine

logger = logging.getLogger(__name__)

BATCH_SIZE = 50


class GoogleFreeEngine(TranslateEngine):
    """Engine gratis menggunakan deep-translator (Google Translate tanpa API key)."""

    async def translate_batch(self, lines: List[str], context: Dict, glossary: List[Dict]) -> List[str]:
        lang_from = context.get("lang_from", "en")
        lang_to = context.get("lang_to", "id")
        results = []

        for i in range(0, len(lines), BATCH_SIZE):
            batch = lines[i: i + BATCH_SIZE]
            translated = await asyncio.get_event_loop().run_in_executor(
                None, lambda b=batch: self._translate_batch_sync(b, lang_from, lang_to)
            )
            results.extend(translated)

        return results

    def _translate_batch_sync(self, batch: List[str], lang_from: str, lang_to: str) -> List[str]:
        results = []
        for line in batch:
            if not line.strip():
                results.append(line)
                continue
            try:
                translated = GoogleTranslator(source=lang_from, target=lang_to).translate(line)
                results.append(translated or line)
            except Exception as e:
                logger.warning(f"GoogleFree translate error: {e}")
                results.append(line)
        return results
