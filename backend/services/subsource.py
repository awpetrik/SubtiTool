import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

BASE = "https://api.subsource.net/api/v1"


async def search_movie(query: str, api_key: Optional[str] = None) -> dict:
    headers = {}
    if api_key:
        headers["X-API-Key"] = api_key
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{BASE}/movies", params={"query": query}, headers=headers)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.error(f"SubSource search error: {e}")
        return {"results": [], "error": str(e)}


async def get_subtitle_info(subtitle_id: str, api_key: Optional[str] = None) -> dict:
    headers = {}
    if api_key:
        headers["X-API-Key"] = api_key
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{BASE}/subtitles/{subtitle_id}", headers=headers)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.error(f"SubSource subtitle info error: {e}")
        return {"error": str(e)}
