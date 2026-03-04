from abc import ABC, abstractmethod
from typing import List, Dict

class TranslateEngine(ABC):
    """Abstract base class untuk semua translation engine."""

    @abstractmethod
    async def translate_batch(
        self,
        lines: List[str],
        context: Dict,
        glossary: List[Dict],
    ) -> List[str]:
        """
        Translate sekelompok baris subtitle.
        context: { title, genre, lang_from, lang_to, char_context }
        glossary: [{ source_term, target_term }]
        Returns list of translated strings, same length as input.
        """
        ...
