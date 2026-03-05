import asyncio
import logging
import time
from typing import List, Dict

from deep_translator import GoogleTranslator

from services.translator import TranslateEngine

logger = logging.getLogger(__name__)

BATCH_SIZE = 50
MAX_RETRIES = 3
RETRY_DELAY = 1.5  # seconds, doubles each retry


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
            results.append(self._translate_with_retry(line, lang_from, lang_to))
        return results

    def _translate_with_retry(self, line: str, lang_from: str, lang_to: str) -> str:
        delay = RETRY_DELAY
        for attempt in range(MAX_RETRIES):
            try:
                translated = GoogleTranslator(source=lang_from, target=lang_to).translate(line)
                return translated or line
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    logger.warning(f"GoogleFree retry {attempt + 1}/{MAX_RETRIES}: {e}")
                    time.sleep(delay)
                    delay *= 2
                else:
                    logger.error(f"GoogleFree gagal setelah {MAX_RETRIES} retry: {e}")
                    # Fallback: kembalikan teks asli daripada crash seluruh batch
                    return line
