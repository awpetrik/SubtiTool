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

    lang_to = context.get('lang_to', 'id')
    return f"""You are an expert subtitle localizer and translator.
Context:
- Show/Movie Title: {context.get('title', '')}
- Genre/Vibe: {context.get('genre', '')}
- Key Characters & Relationships: {context.get('char_context', '')}
- Target Language: {lang_to}
{glossary_text}

Rules for highly accurate & immersive subtitles:
1. DO NOT translate literally. Prioritize meaning, intent, and natural conversational flow in {lang_to}.
2. SLANG & IDIOMS: Adapt English slang, jokes, or idioms to the closest natural equivalent in {lang_to} slang or colloquialism. Do not output literal nonsense.
3. TONE & FORMALITY: Match the relationship between speakers based on the context. If it's a casual teenage drama, use casual pronous (e.g., in Indonesian: lo/gue, aku/kamu). If formal/historical, use formal pronouns.
4. SPATIAL AWARENESS: Subtitles must be readable. Keep it concise. Omit filler words if it doesn't lose the core meaning.
5. PRESERVE TAGS: Keep any HTML/formatting tags (like <i>, <b>) or music notes (♪) exactly as they are.
6. CONTINUITY: The prompt will contain an array of lines. Use the surrounding lines as context for pronouns and ambiguous words.
7. Output EXACTLY a JSON array of strings that matches the input length. No markdown, no preambles, no explanations. Just the JSON array."""


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
