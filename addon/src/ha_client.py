import logging
import aiohttp
from typing import List, Optional

log = logging.getLogger(__name__)


class HAClient:
    def __init__(self, base_url: str, token: str):
        self._base = base_url.rstrip("/")
        self._token = token
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def get_state(self, entity_id: str) -> Optional[dict]:
        """GET /api/states/{entity_id}, return None on 404 or error."""
        url = f"{self._base}/api/states/{entity_id}"
        try:
            async with aiohttp.ClientSession(headers=self._headers) as session:
                async with session.get(url) as resp:
                    if resp.status == 404:
                        return None
                    resp.raise_for_status()
                    return await resp.json()
        except Exception as e:
            log.warning("get_state %s failed: %s", entity_id, e)
            return None

    async def call_service(self, domain: str, service: str, data: dict) -> None:
        """POST /api/services/{domain}/{service} with JSON body."""
        url = f"{self._base}/api/services/{domain}/{service}"
        try:
            async with aiohttp.ClientSession(headers=self._headers) as session:
                async with session.post(url, json=data) as resp:
                    resp.raise_for_status()
        except Exception as e:
            log.warning("call_service %s/%s failed: %s", domain, service, e)

    async def get_probe_temps(self, entity_ids: List[str]) -> List[dict]:
        """Fetch state for each probe entity, apply 0.01 scaling.

        LocalTuya entities report raw integer values that need 0.01 scaling
        (e.g. raw 22500 = 225.0 degF).

        Returns list of:
            {"entity_id": str, "temp_f": float|None,
             "last_updated": str|None, "available": bool}
        """
        results = []
        for entity_id in entity_ids:
            state = await self.get_state(entity_id)
            if state is None:
                results.append({
                    "entity_id": entity_id,
                    "temp_f": None,
                    "last_updated": None,
                    "available": False,
                })
                continue

            try:
                raw_value = float(state["state"])
                temp_f = raw_value * 0.01
                results.append({
                    "entity_id": entity_id,
                    "temp_f": temp_f,
                    "last_updated": state.get("last_updated"),
                    "available": True,
                })
            except (TypeError, ValueError, KeyError):
                log.warning(
                    "Could not parse temperature for %s: state=%r",
                    entity_id,
                    state.get("state"),
                )
                results.append({
                    "entity_id": entity_id,
                    "temp_f": None,
                    "last_updated": state.get("last_updated"),
                    "available": False,
                })

        return results
