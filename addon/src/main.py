import asyncio
import logging
import os

from .database import Database
from .ha_client import HAClient
from .notifier import Notifier
from .poller import Poller
from .web import WebServer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)


async def main():
    db_path = os.environ.get("DB_PATH", "/data/bbq.db")
    db = Database(db_path)
    db.init_schema()

    ha = HAClient(
        base_url=os.environ.get("HA_BASE_URL", "http://supervisor/core"),
        token=os.environ["SUPERVISOR_TOKEN"],
    )

    notifier = Notifier(ha=ha, db=db)

    entity_ids = [
        db.get_setting(f"probe_entity_{i}", f"sensor.ibbq_4t_probe_{i}")
        for i in range(1, 5)
    ]

    poller = Poller(
        ha=ha, db=db, notifier=notifier, entity_ids=entity_ids,
    )

    server = WebServer(db=db, poller=poller)

    def _interval(key: str, default: int) -> int:
        return db.get_setting_int(key, default)

    tasks = [
        poller.run_loop(interval=lambda: _interval("poll_interval", 5)),
        server.run(port=8099),
    ]

    log.info("BBQ Monitor starting — polling %s", entity_ids)
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(main())
