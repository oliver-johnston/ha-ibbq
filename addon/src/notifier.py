import logging

log = logging.getLogger(__name__)


class Notifier:
    def __init__(self, *, ha, db):
        self._ha = ha
        self._db = db

    def _resolve(self) -> tuple[str, str]:
        entity = (self._db.get_setting("discord_notify_entity", "") or "").strip()
        if entity.startswith("notify."):
            entity = entity[len("notify."):]
        channel = (self._db.get_setting("discord_alerts_channel_id", "") or "").strip()
        return entity, channel

    async def send(self, message: str) -> None:
        entity, channel = self._resolve()
        if not entity:
            log.info("Notifier: no discord_notify_entity configured — dropping message")
            return
        data: dict = {"message": message}
        if channel:
            data["target"] = channel
        await self._ha.call_service("notify", entity, data)
