import asyncio
import json
import re
import logging
from typing import List, Dict

from google import genai
from services.translator import TranslateEngine

logger = logging.getLogger(__name__)

BATCH_SIZE = 40
OVERLAP = 5
MAX_RETRIES = 3


def _build_system_prompt(context: Dict, glossary: List[Dict]) -> str:
    glossary_text = ""
    if glossary:
        entries = "\n".join(f'  - "{g["source_term"]}" → "{g["target_term"]}"' for g in glossary)
        glossary_text = f"\nGlossary (wajib diikuti):\n{entries}"

    return f"""You are a professional subtitle translator.
Show: {context.get('title', '')} | Genre: {context.get('genre', '')}
Characters: {context.get('char_context', '')}
Translate from {context.get('lang_from', 'en')} to {context.get('lang_to', 'id')}.{glossary_text}

Rules:
- Translate to natural, conversational {context.get('lang_to', 'id')}
- Keep translations SHORT to fit subtitle timing
- Preserve speaker tone (formal/casual/emotional)
- Never translate names, brands, or technical terms
- Maintain HTML tags like <i>, <b> as-is
- Output ONLY a JSON array of strings, same order and same count as input
- No explanations, no extra text"""


class GeminiEngine(TranslateEngine):
    def __init__(self, api_key: str):
        if not api_key or not api_key.strip():
            raise ValueError("GEMINI_API_KEY tidak boleh kosong.")
        self.client = genai.Client(api_key=api_key)
        self.model_id = "gemini-2.0-flash"

    async def translate_batch(self, lines: List[str], context: Dict, glossary: List[Dict]) -> List[str]:
        system_prompt = _build_system_prompt(context, glossary)
        results: List[str] = []

        for i in range(0, len(lines), BATCH_SIZE):
            context_start = max(0, i - OVERLAP)
            batch = lines[context_start: i + BATCH_SIZE]
            translated = await self._translate_with_retry(batch, system_prompt)
            if i > 0:
                translated = translated[OVERLAP:]
            results.extend(translated)

        return results[:len(lines)]

    async def _translate_with_retry(self, batch: List[str], system_prompt: str) -> List[str]:
        numbered = "\n".join(f"{i+1}. {line}" for i, line in enumerate(batch))
        prompt = f"{system_prompt}\n\nSubtitles ({len(batch)} lines):\n{numbered}"

        for attempt in range(MAX_RETRIES):
            try:
                response = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self.client.models.generate_content(
                        model=self.model_id, contents=prompt
                    )
                )
                text = response.text.strip()
                if text.startswith("```"):
                    text = re.sub(r"^```[a-z]*\n?", "", text)
                    text = re.sub(r"\n?```$", "", text)

                parsed = json.loads(text)
                if not isinstance(parsed, list):
                    raise ValueError("Response bukan JSON array")
                if len(parsed) != len(batch):
                    logger.warning(f"Count mismatch: expected {len(batch)}, got {len(parsed)}. Fallback per-line.")
                    return await self._fallback_per_line(batch, system_prompt)

                return [str(s) for s in parsed]

            except Exception as e:
                err_msg = str(e).lower()
                if "api key" in err_msg or "invalid" in err_msg:
                    raise ValueError(f"Gemini API key tidak valid: {e}")
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(2 ** attempt)
                else:
                    return await self._fallback_per_line(batch, system_prompt)

    async def _fallback_per_line(self, batch: List[str], system_prompt: str) -> List[str]:
        results = []
        for line in batch:
            if not line.strip():
                results.append(line)
                continue
            try:
                prompt = f"{system_prompt}\n\nTranslate this single subtitle line:\n{line}\n\nReturn ONLY the translated string."
                response = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self.client.models.generate_content(
                        model=self.model_id, contents=prompt
                    )
                )
                results.append(response.text.strip().strip('"'))
            except Exception:
                results.append(line)
        return results
