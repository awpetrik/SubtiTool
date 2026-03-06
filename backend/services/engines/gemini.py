import asyncio
import json
import re
import logging
from typing import List, Dict

from google import genai
from services.translator import TranslateEngine

logger = logging.getLogger(__name__)

BATCH_SIZE = 50 
OVERLAP = 5
MAX_RETRIES = 3


def _build_system_prompt(context: Dict, glossary: List[Dict]) -> str:
    glossary_text = ""
    if glossary:
        entries = "\n".join(f'  - "{g["source_term"]}" → "{g["target_term"]}"' for g in glossary)
        glossary_text = f"\nGlossary (wajib diikuti):\n{entries}"

    lang_map = {
        "id": "Indonesian (Bahasa Indonesia)", 
        "en": "English", 
        "ms": "Malay (Bahasa Melayu)", 
        "ja": "Japanese", 
        "ko": "Korean", 
        "es": "Spanish", 
        "fr": "French"
    }
    lang_to_code = context.get('lang_to', 'id')
    lang_to_name = lang_map.get(lang_to_code.lower(), lang_to_code)
    
    hint_text = f"\nExtra Context: {context['hint']}" if context.get('hint') else ""
    return f"""You are an expert subtitle localizer. 
Your task is to TRANSLATE the following subtitles from {context.get('lang_from', 'English')} to {lang_to_name}.

Context:
- Show/Movie Title: {context.get('title', '')}
- Genre/Vibe: {context.get('genre', '')}
- Key Characters & Relationships: {context.get('char_context', '')}
- Target Language: {lang_to_name}{hint_text}
{glossary_text}

Rules for highly accurate & immersive subtitles:
1. MANDATORY: The final output MUST be in {lang_to_name}. Do NOT return the original source text if it is in a different language.
2. DO NOT translate literally. Prioritize meaning, intent, and natural conversational flow in {lang_to_name}.
3. SLANG & IDIOMS: Adapt English slang, jokes, or idioms to the closest natural equivalent in {lang_to_name} slang or colloquialism. Do not output literal nonsense.
4. TONE & FORMALITY: Match the relationship between speakers based on the context. If it's a casual teenage drama, use casual pronous (e.g., in Indonesian: lo/gue, aku/kamu). If formal/historical, use formal pronouns.
5. SPATIAL & TIMING AWARENESS (NETFLIX STANDARD): Subtitles must be readable. Adapt the phrasing so it operates safely around or below 17 Characters Per Second (CPS) if spoken fast. If the visual line gets too long, insert a physical line break `\n` at the most logical grammatical pause. Keep it concise. Omit filler words if it doesn't lose the core meaning.
6. PRESERVE TAGS: Keep any HTML/formatting tags (like <i>, <b>) or music notes (♪) exactly as they are.
7. CONTINUITY: The prompt will contain an array of lines. Use the surrounding lines as context for pronouns and ambiguous words.
8. Output EXACTLY a JSON array of strings that matches the input length. No markdown, no preambles, no explanations. Just the JSON array."""


class GeminiEngine(TranslateEngine):
    def __init__(self, api_key: str):
        if not api_key or not api_key.strip():
            raise ValueError("Fitur AI membutuhkan API Key Gemini. Silakan masukkan key Anda di kolom atas panel Editor.")
        # Menggunakan google-genai Client
        self.client = genai.Client(api_key=api_key)
        self.model_id = "gemini-3-flash-preview"

    async def translate_batch(self, lines: List[str], context: Dict, glossary: List[Dict]) -> List[str]:
        system_prompt = _build_system_prompt(context, glossary)
        
        tasks = []
        batch_info = []
        
        # Parallelize all batches
        for i in range(0, len(lines), BATCH_SIZE):
            context_start = max(0, i - OVERLAP)
            batch = lines[context_start: i + BATCH_SIZE]
            tasks.append(self._translate_with_retry(batch, system_prompt))
            batch_info.append({"start": i, "context_start": context_start})
        
        if not tasks:
            return []
            
        results_raw = await asyncio.gather(*tasks, return_exceptions=True)
        
        final_results = [None] * len(lines)
        for info, translated in zip(batch_info, results_raw):
            if isinstance(translated, Exception):
                logger.error(f"Batch failed: {translated}")
                # Fallback: keep original for failed batch lines
                start = info["start"]
                for j in range(BATCH_SIZE):
                    if start + j < len(lines):
                        final_results[start + j] = lines[start + j]
                continue
                
            start = info["start"]
            c_start = info["context_start"]
            offset = start - c_start
            
            actual_content = translated[offset:]
            for k, txt in enumerate(actual_content):
                if start + k < len(lines):
                    final_results[start + k] = txt
        
        return [r if r is not None else "" for r in final_results]

    async def _translate_with_retry(self, batch: List[str], system_prompt: str) -> List[str]:
        numbered = "\n".join(f"{i+1}. {line}" for i, line in enumerate(batch))
        prompt = f"{system_prompt}\n\nSubtitles ({len(batch)} lines):\n{numbered}"

        for attempt in range(MAX_RETRIES):
            try:
                # Use native async if available, fallback to executor
                if hasattr(self.client, "aio"):
                    response = await self.client.aio.models.generate_content(
                        model=self.model_id, contents=prompt
                    )
                else:
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
                    await asyncio.sleep(1.5 ** attempt) # Slightly faster backoff
                else:
                    logger.error(f"Max retries reached for batch. Falling back to per-line. Error: {e}")
                    return await self._fallback_per_line(batch, system_prompt)

    async def _fallback_per_line(self, batch: List[str], system_prompt: str) -> List[str]:
        # Parallelize fallback too! 
        async def _translate_single(line):
            if not line.strip():
                return line
            try:
                prompt = f"{system_prompt}\n\nTranslate this single subtitle line:\n{line}\n\nReturn ONLY the translated string."
                if hasattr(self.client, "aio"):
                    response = await self.client.aio.models.generate_content(
                        model=self.model_id, contents=prompt
                    )
                else:
                    response = await asyncio.get_event_loop().run_in_executor(
                        None, lambda: self.client.models.generate_content(
                            model=self.model_id, contents=prompt
                        )
                    )
                return response.text.strip().strip('"').strip("'")
            except Exception as e:
                logger.error(f"Individual fallback failed: {e}")
                return line # Return original if still fails

        return await asyncio.gather(*[_translate_single(line) for line in batch])
