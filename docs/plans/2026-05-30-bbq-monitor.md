# BBQ Temperature Monitor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Home Assistant add-on that monitors 4 Inkbird iBBQ-4T temperature probes, provides a React dashboard with setpoint/range alerting, preset management, Discord notifications, and cook history logging.

**Architecture:** Dual-loop Python backend (poller + web server) with aiohttp, SQLite persistence, React 18 + TypeScript + Vite frontend. Follows ha-heatcast patterns exactly: inline styles, CSS custom properties, typed API client, async polling loops.

**Tech Stack:** Python 3.12 (aiohttp), React 18 + TypeScript + Vite, SQLite3, Docker (alpine)

**Reference:** `/Users/oliver/workspace/.featurefactory/tasks/TASK-014/ha-heatcast/` — follow its patterns for all code structure.

---

### Task 1: Add-on Scaffold

**Files:**
- Create: `addon/config.yaml`
- Create: `addon/Dockerfile`
- Create: `addon/run.sh`
- Create: `addon/requirements.txt`
- Create: `addon/pytest.ini`
- Create: `addon/src/__init__.py`
- Create: `build.sh`
- Create: `repository.yaml`
- Modify: `.gitignore`

**Step 1: Create addon/config.yaml**

```yaml
name: "BBQ Monitor"
description: "Temperature monitoring for Inkbird iBBQ-4T probes"
version: "0.1.0"
slug: ha_ibbq
url: "https://github.com/oliverj/ha-ibbq"
arch:
  - aarch64
  - amd64
  - armv7
homeassistant_api: true
hassio_api: true
ingress: true
ingress_port: 8099
panel_icon: "mdi:grill"
map:
  - data:rw
```

**Step 2: Create addon/Dockerfile**

```dockerfile
ARG BUILD_FROM
FROM ${BUILD_FROM:-python:3.12-alpine}

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ src/
COPY run.sh .
RUN chmod +x run.sh

CMD ["/app/run.sh"]
```

**Step 3: Create addon/run.sh**

```bash
#!/bin/sh
set -e
python -m src.main
```

**Step 4: Create addon/requirements.txt**

```
aiohttp>=3.9
```

**Step 5: Create addon/pytest.ini**

```ini
[pytest]
asyncio_mode = auto
testpaths = ../tests
```

**Step 6: Create addon/src/__init__.py**

Empty file.

**Step 7: Create build.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Building frontend..."
cd frontend
npm ci
npm run build
cd ..

echo "==> Frontend built to addon/src/static/dist/"
echo "==> Run 'docker build addon/' to build the add-on image."
```

**Step 8: Create repository.yaml**

```yaml
name: BBQ Monitor
url: https://github.com/oliverj/ha-ibbq
maintainer: Oliver Johnston
```

**Step 9: Update .gitignore**

```
.featurefactory/
node_modules/
addon/src/static/dist/
__pycache__/
*.pyc
.pytest_cache/
```

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: add-on scaffold with config, Dockerfile, and build script"
```

---

### Task 2: Database Layer

**Files:**
- Create: `addon/src/database.py`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`
- Create: `tests/test_database.py`

**Step 1: Write the failing test**

Create `tests/conftest.py`:

```python
import os
import sys
import tempfile
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "addon"))

from src.database import Database


@pytest.fixture
def db():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    database = Database(path)
    database.init_schema()
    yield database
    os.unlink(path)
```

Create `tests/test_database.py`:

```python
import pytest
import time
from src.database import Database


def test_init_schema_creates_tables(db):
    with db._connect() as conn:
        tables = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()]
    assert "settings" in tables
    assert "presets" in tables
    assert "range_presets" in tables
    assert "cook_sessions" in tables
    assert "probe_config" in tables
    assert "readings" in tables
    assert "alert_log" in tables


def test_settings_roundtrip(db):
    db.set_setting("unit", "C")
    assert db.get_setting("unit") == "C"
    db.set_setting("unit", "F")
    assert db.get_setting("unit") == "F"


def test_get_setting_default(db):
    assert db.get_setting("missing", "default") == "default"


def test_get_setting_int(db):
    db.set_setting("poll_interval", "5")
    assert db.get_setting_int("poll_interval", 10) == 5
    assert db.get_setting_int("missing", 10) == 10


def test_preset_crud(db):
    pid = db.add_preset("Brisket", "Done", 203.0)
    presets = db.list_presets()
    assert len(presets) == 1
    assert presets[0]["meat"] == "Brisket"
    assert presets[0]["doneness"] == "Done"
    assert presets[0]["temp_f"] == 203.0

    db.update_preset(pid, "Brisket", "Done", 205.0)
    presets = db.list_presets()
    assert presets[0]["temp_f"] == 205.0

    db.delete_preset(pid)
    assert len(db.list_presets()) == 0


def test_range_preset_crud(db):
    rid = db.add_range_preset("Low and Slow", 225.0, 275.0)
    rps = db.list_range_presets()
    assert len(rps) == 1
    assert rps[0]["name"] == "Low and Slow"

    db.update_range_preset(rid, "Low and Slow", 220.0, 270.0)
    rps = db.list_range_presets()
    assert rps[0]["min_temp_f"] == 220.0

    db.delete_range_preset(rid)
    assert len(db.list_range_presets()) == 0


def test_cook_session_lifecycle(db):
    now = time.time()
    sid = db.start_session(now)
    session = db.get_active_session()
    assert session is not None
    assert session["id"] == sid

    db.end_session(sid, now + 3600)
    assert db.get_active_session() is None

    sessions = db.list_sessions()
    assert len(sessions) == 1
    assert sessions[0]["end_ts"] is not None


def test_readings_insert_and_query(db):
    now = time.time()
    sid = db.start_session(now)
    db.insert_reading(sid, now, 1, 225.0)
    db.insert_reading(sid, now + 5, 1, 230.0)
    db.insert_reading(sid, now, 2, 180.0)

    rows = db.get_readings(sid, probe=1)
    assert len(rows) == 2
    assert rows[0]["temp_f"] == 225.0

    all_rows = db.get_readings(sid)
    assert len(all_rows) == 3


def test_probe_config_crud(db):
    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=203.0)
    cfg = db.get_probe_config(1)
    assert cfg["mode"] == "setpoint"
    assert cfg["label"] == "Brisket"
    assert cfg["target_temp_f"] == 203.0

    db.clear_probe_config(1)
    cfg = db.get_probe_config(1)
    assert cfg["mode"] is None


def test_alert_log(db):
    now = time.time()
    sid = db.start_session(now)
    db.insert_alert(sid, now, 1, "setpoint_reached", "Brisket reached 203°F")
    alerts = db.get_alerts(sid)
    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "setpoint_reached"
```

**Step 2: Run tests to verify they fail**

Run: `cd addon && python -m pytest ../tests/test_database.py -v`
Expected: FAIL with ModuleNotFoundError

**Step 3: Write the database implementation**

Create `addon/src/database.py`:

```python
import logging
import sqlite3
from contextlib import contextmanager

log = logging.getLogger(__name__)


class Database:
    def __init__(self, path: str):
        self._path = path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    @contextmanager
    def transaction(self):
        conn = self._connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init_schema(self):
        with self._connect() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );

                CREATE TABLE IF NOT EXISTS presets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    meat TEXT NOT NULL,
                    doneness TEXT NOT NULL,
                    temp_f REAL NOT NULL,
                    UNIQUE(meat, doneness)
                );

                CREATE TABLE IF NOT EXISTS range_presets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    min_temp_f REAL NOT NULL,
                    max_temp_f REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS cook_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    start_ts REAL NOT NULL,
                    end_ts REAL
                );

                CREATE TABLE IF NOT EXISTS probe_config (
                    probe INTEGER PRIMARY KEY CHECK(probe BETWEEN 1 AND 4),
                    mode TEXT CHECK(mode IN ('setpoint', 'range')),
                    label TEXT,
                    target_temp_f REAL,
                    min_temp_f REAL,
                    max_temp_f REAL,
                    preset_id INTEGER REFERENCES presets(id) ON DELETE SET NULL,
                    range_preset_id INTEGER REFERENCES range_presets(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS readings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL REFERENCES cook_sessions(id) ON DELETE CASCADE,
                    timestamp REAL NOT NULL,
                    probe INTEGER NOT NULL CHECK(probe BETWEEN 1 AND 4),
                    temp_f REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS alert_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL REFERENCES cook_sessions(id) ON DELETE CASCADE,
                    timestamp REAL NOT NULL,
                    probe INTEGER NOT NULL,
                    alert_type TEXT NOT NULL,
                    message TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_readings_session_probe
                    ON readings(session_id, probe, timestamp);
            """)

    # -- Settings --

    def get_setting(self, key: str, default: str = "") -> str:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT value FROM settings WHERE key=?", (key,)
            ).fetchone()
            return row["value"] if row else default

    def set_setting(self, key: str, value: str):
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )

    def get_setting_int(self, key: str, default: int) -> int:
        raw = (self.get_setting(key, "") or "").strip()
        if not raw:
            return default
        try:
            return int(raw)
        except (TypeError, ValueError):
            return default

    def get_setting_float(self, key: str, default: float) -> float:
        raw = (self.get_setting(key, "") or "").strip()
        if not raw:
            return default
        try:
            return float(raw)
        except (TypeError, ValueError):
            return default

    # -- Presets --

    def add_preset(self, meat: str, doneness: str, temp_f: float) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO presets (meat, doneness, temp_f) VALUES (?, ?, ?)",
                (meat, doneness, temp_f),
            )
            return cur.lastrowid

    def update_preset(self, preset_id: int, meat: str, doneness: str, temp_f: float):
        with self._connect() as conn:
            conn.execute(
                "UPDATE presets SET meat=?, doneness=?, temp_f=? WHERE id=?",
                (meat, doneness, temp_f, preset_id),
            )

    def delete_preset(self, preset_id: int):
        with self._connect() as conn:
            conn.execute("DELETE FROM presets WHERE id=?", (preset_id,))

    def list_presets(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM presets ORDER BY meat, doneness"
            ).fetchall()
            return [dict(r) for r in rows]

    def get_preset(self, preset_id: int) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM presets WHERE id=?", (preset_id,)
            ).fetchone()
            return dict(row) if row else None

    # -- Range Presets --

    def add_range_preset(self, name: str, min_f: float, max_f: float) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO range_presets (name, min_temp_f, max_temp_f) VALUES (?, ?, ?)",
                (name, min_f, max_f),
            )
            return cur.lastrowid

    def update_range_preset(self, preset_id: int, name: str, min_f: float, max_f: float):
        with self._connect() as conn:
            conn.execute(
                "UPDATE range_presets SET name=?, min_temp_f=?, max_temp_f=? WHERE id=?",
                (name, min_f, max_f, preset_id),
            )

    def delete_range_preset(self, preset_id: int):
        with self._connect() as conn:
            conn.execute("DELETE FROM range_presets WHERE id=?", (preset_id,))

    def list_range_presets(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM range_presets ORDER BY name"
            ).fetchall()
            return [dict(r) for r in rows]

    # -- Cook Sessions --

    def start_session(self, start_ts: float) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO cook_sessions (start_ts) VALUES (?)", (start_ts,)
            )
            return cur.lastrowid

    def end_session(self, session_id: int, end_ts: float):
        with self._connect() as conn:
            conn.execute(
                "UPDATE cook_sessions SET end_ts=? WHERE id=?",
                (end_ts, session_id),
            )

    def get_active_session(self) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM cook_sessions WHERE end_ts IS NULL "
                "ORDER BY start_ts DESC LIMIT 1"
            ).fetchone()
            return dict(row) if row else None

    def list_sessions(self) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM cook_sessions ORDER BY start_ts DESC"
            ).fetchall()
            return [dict(r) for r in rows]

    def get_session(self, session_id: int) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM cook_sessions WHERE id=?", (session_id,)
            ).fetchone()
            return dict(row) if row else None

    # -- Readings --

    def insert_reading(self, session_id: int, ts: float, probe: int, temp_f: float):
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO readings (session_id, timestamp, probe, temp_f) "
                "VALUES (?, ?, ?, ?)",
                (session_id, ts, probe, temp_f),
            )

    def get_readings(self, session_id: int, probe: int | None = None) -> list[dict]:
        with self._connect() as conn:
            if probe is not None:
                rows = conn.execute(
                    "SELECT * FROM readings WHERE session_id=? AND probe=? "
                    "ORDER BY timestamp",
                    (session_id, probe),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM readings WHERE session_id=? ORDER BY timestamp",
                    (session_id,),
                ).fetchall()
            return [dict(r) for r in rows]

    # -- Probe Config --

    def set_probe_config(
        self,
        probe: int,
        mode: str | None = None,
        label: str | None = None,
        target_temp_f: float | None = None,
        min_temp_f: float | None = None,
        max_temp_f: float | None = None,
        preset_id: int | None = None,
        range_preset_id: int | None = None,
    ):
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO probe_config "
                "(probe, mode, label, target_temp_f, min_temp_f, max_temp_f, "
                "preset_id, range_preset_id) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(probe) DO UPDATE SET "
                "mode=excluded.mode, label=excluded.label, "
                "target_temp_f=excluded.target_temp_f, "
                "min_temp_f=excluded.min_temp_f, max_temp_f=excluded.max_temp_f, "
                "preset_id=excluded.preset_id, "
                "range_preset_id=excluded.range_preset_id",
                (probe, mode, label, target_temp_f, min_temp_f, max_temp_f,
                 preset_id, range_preset_id),
            )

    def get_probe_config(self, probe: int) -> dict:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM probe_config WHERE probe=?", (probe,)
            ).fetchone()
            if row:
                return dict(row)
            return {
                "probe": probe, "mode": None, "label": None,
                "target_temp_f": None, "min_temp_f": None, "max_temp_f": None,
                "preset_id": None, "range_preset_id": None,
            }

    def get_all_probe_configs(self) -> list[dict]:
        return [self.get_probe_config(i) for i in range(1, 5)]

    def clear_probe_config(self, probe: int):
        with self._connect() as conn:
            conn.execute("DELETE FROM probe_config WHERE probe=?", (probe,))

    # -- Alert Log --

    def insert_alert(
        self, session_id: int, ts: float, probe: int,
        alert_type: str, message: str,
    ):
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO alert_log "
                "(session_id, timestamp, probe, alert_type, message) "
                "VALUES (?, ?, ?, ?, ?)",
                (session_id, ts, probe, alert_type, message),
            )

    def get_alerts(self, session_id: int) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM alert_log WHERE session_id=? ORDER BY timestamp",
                (session_id,),
            ).fetchall()
            return [dict(r) for r in rows]
```

**Step 4: Run tests to verify they pass**

Run: `cd addon && python -m pytest ../tests/test_database.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add addon/src/database.py tests/conftest.py tests/test_database.py tests/__init__.py
git commit -m "feat: database layer with schema, settings, presets, sessions, readings"
```

---

### Task 3: HA Client

**Files:**
- Create: `addon/src/ha_client.py`
- Create: `tests/test_ha_client.py`

**Step 1: Write the failing test**

Create `tests/test_ha_client.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from aioresponses import aioresponses
from src.ha_client import HAClient

BASE = "http://supervisor/core"
TOKEN = "test-token"


@pytest.fixture
def client():
    return HAClient(base_url=BASE, token=TOKEN)


@pytest.mark.asyncio
async def test_get_state(client):
    with aioresponses() as m:
        m.get(
            f"{BASE}/api/states/sensor.ibbq_4t_probe_1",
            payload={"state": "22500", "attributes": {"unit_of_measurement": "F"}},
        )
        state = await client.get_state("sensor.ibbq_4t_probe_1")
    assert state["state"] == "22500"


@pytest.mark.asyncio
async def test_get_state_404(client):
    with aioresponses() as m:
        m.get(f"{BASE}/api/states/sensor.missing", status=404)
        state = await client.get_state("sensor.missing")
    assert state is None


@pytest.mark.asyncio
async def test_get_state_error(client):
    with aioresponses() as m:
        m.get(f"{BASE}/api/states/sensor.fail", exception=Exception("timeout"))
        state = await client.get_state("sensor.fail")
    assert state is None


@pytest.mark.asyncio
async def test_call_service(client):
    with aioresponses() as m:
        m.post(f"{BASE}/api/services/notify/robeson_chat", payload=[])
        await client.call_service("notify", "robeson_chat", {"message": "test"})


@pytest.mark.asyncio
async def test_get_probe_temps(client):
    with aioresponses() as m:
        for i in range(1, 5):
            m.get(
                f"{BASE}/api/states/sensor.ibbq_4t_probe_{i}",
                payload={"state": str(22500 + i * 100),
                         "attributes": {"unit_of_measurement": "F"},
                         "last_updated": "2026-05-30T12:00:00Z"},
            )
        temps = await client.get_probe_temps([
            f"sensor.ibbq_4t_probe_{i}" for i in range(1, 5)
        ])
    assert len(temps) == 4
    assert temps[0]["temp_f"] == pytest.approx(225.0)
    assert temps[1]["temp_f"] == pytest.approx(226.0)
```

**Step 2: Run tests to verify they fail**

Run: `cd addon && python -m pytest ../tests/test_ha_client.py -v`
Expected: FAIL with ModuleNotFoundError

**Step 3: Write the HA client implementation**

Create `addon/src/ha_client.py`:

```python
import logging
from typing import Optional
import aiohttp

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
        url = f"{self._base}/api/services/{domain}/{service}"
        try:
            async with aiohttp.ClientSession(headers=self._headers) as session:
                async with session.post(url, json=data) as resp:
                    resp.raise_for_status()
        except Exception as e:
            log.warning("call_service %s.%s failed: %s", domain, service, e)

    async def get_probe_temps(
        self, entity_ids: list[str]
    ) -> list[dict]:
        results = []
        for eid in entity_ids:
            state = await self.get_state(eid)
            if state is None:
                results.append({
                    "entity_id": eid, "temp_f": None,
                    "last_updated": None, "available": False,
                })
                continue
            raw = state.get("state", "")
            try:
                temp_f = float(raw) * 0.01
            except (TypeError, ValueError):
                temp_f = None
            results.append({
                "entity_id": eid,
                "temp_f": temp_f,
                "last_updated": state.get("last_updated"),
                "available": temp_f is not None and temp_f > 0,
            })
        return results
```

**Step 4: Run tests to verify they pass**

Run: `cd addon && python -m pytest ../tests/test_ha_client.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add addon/src/ha_client.py tests/test_ha_client.py
git commit -m "feat: HA REST API client with state fetching and probe temp reading"
```

---

### Task 4: Notifier

**Files:**
- Create: `addon/src/notifier.py`
- Create: `tests/test_notifier.py`

**Step 1: Write the failing test**

Create `tests/test_notifier.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from src.notifier import Notifier
from src.database import Database


@pytest.mark.asyncio
async def test_send_notification(db):
    ha = AsyncMock()
    db.set_setting("discord_notify_entity", "notify.robeson_chat")
    db.set_setting("discord_alerts_channel_id", "1483226515461115954")
    notifier = Notifier(ha=ha, db=db)

    await notifier.send("Brisket reached 203°F!")

    ha.call_service.assert_awaited_once_with(
        "notify", "robeson_chat",
        {"message": "Brisket reached 203°F!", "target": "1483226515461115954"},
    )


@pytest.mark.asyncio
async def test_send_strips_notify_prefix(db):
    ha = AsyncMock()
    db.set_setting("discord_notify_entity", "notify.robeson_chat")
    notifier = Notifier(ha=ha, db=db)

    await notifier.send("test")
    ha.call_service.assert_awaited_once()
    args = ha.call_service.call_args
    assert args[0][1] == "robeson_chat"


@pytest.mark.asyncio
async def test_send_no_entity_configured(db):
    ha = AsyncMock()
    notifier = Notifier(ha=ha, db=db)

    await notifier.send("test")
    ha.call_service.assert_not_called()


@pytest.mark.asyncio
async def test_send_no_channel(db):
    ha = AsyncMock()
    db.set_setting("discord_notify_entity", "robeson_chat")
    notifier = Notifier(ha=ha, db=db)

    await notifier.send("test")
    ha.call_service.assert_awaited_once()
    data = ha.call_service.call_args[0][2]
    assert "target" not in data
```

**Step 2: Run tests to verify they fail**

Run: `cd addon && python -m pytest ../tests/test_notifier.py -v`
Expected: FAIL

**Step 3: Write the notifier implementation**

Create `addon/src/notifier.py`:

```python
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
```

**Step 4: Run tests to verify they pass**

Run: `cd addon && python -m pytest ../tests/test_notifier.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add addon/src/notifier.py tests/test_notifier.py
git commit -m "feat: Discord notifier via HA notify service"
```

---

### Task 5: Poller (Temperature Polling + Alert Evaluation)

**Files:**
- Create: `addon/src/poller.py`
- Create: `tests/test_poller.py`

**Step 1: Write the failing test**

Create `tests/test_poller.py`:

```python
import pytest
import time
from unittest.mock import AsyncMock, MagicMock, patch
from src.poller import Poller
from src.database import Database
from src.notifier import Notifier

ENTITY_IDS = [f"sensor.ibbq_4t_probe_{i}" for i in range(1, 5)]


def make_ha(temps=None):
    """Create mock HA client returning given temps (list of 4 floats or None)."""
    if temps is None:
        temps = [225.0, 180.0, None, None]
    ha = AsyncMock()

    async def get_probe_temps(eids):
        results = []
        for i, eid in enumerate(eids):
            t = temps[i] if i < len(temps) else None
            results.append({
                "entity_id": eid,
                "temp_f": t,
                "last_updated": "2026-05-30T12:00:00Z" if t else None,
                "available": t is not None and t > 0,
            })
        return results

    ha.get_probe_temps = AsyncMock(side_effect=get_probe_temps)
    return ha


@pytest.mark.asyncio
async def test_poll_reads_temps(db):
    ha = make_ha([225.0, 180.0, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    await poller.poll()

    state = poller.latest_state()
    assert state[0]["temp_f"] == 225.0
    assert state[1]["temp_f"] == 180.0
    assert state[2]["temp_f"] is None


@pytest.mark.asyncio
async def test_poll_logs_readings_during_session(db):
    ha = make_ha([225.0, 180.0, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    sid = db.start_session(time.time())
    await poller.poll()

    readings = db.get_readings(sid)
    assert len(readings) == 2  # only probes with valid temps


@pytest.mark.asyncio
async def test_setpoint_alert_fires(db):
    ha = make_ha([205.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=203.0)
    sid = db.start_session(time.time())
    await poller.poll()

    notifier.send.assert_awaited()
    alerts = db.get_alerts(sid)
    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "setpoint_reached"


@pytest.mark.asyncio
async def test_range_breach_alert(db):
    ha = make_ha([300.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    db.set_probe_config(1, mode="range", label="Smoker",
                        min_temp_f=225.0, max_temp_f=275.0)
    sid = db.start_session(time.time())
    await poller.poll()

    notifier.send.assert_awaited()
    alerts = db.get_alerts(sid)
    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "range_breach"


@pytest.mark.asyncio
async def test_no_alert_without_session(db):
    ha = make_ha([205.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=203.0)
    await poller.poll()

    notifier.send.assert_not_awaited()


@pytest.mark.asyncio
async def test_no_alert_without_config(db):
    ha = make_ha([205.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    sid = db.start_session(time.time())
    await poller.poll()

    notifier.send.assert_not_awaited()


@pytest.mark.asyncio
async def test_alert_repeats_after_interval(db):
    ha = make_ha([205.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)
    db.set_setting("notification_repeat_seconds", "0")  # no cooldown

    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=203.0)
    sid = db.start_session(time.time())

    await poller.poll()
    await poller.poll()

    assert notifier.send.await_count == 2


@pytest.mark.asyncio
async def test_alert_respects_cooldown(db):
    ha = make_ha([205.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)
    db.set_setting("notification_repeat_seconds", "300")

    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=203.0)
    sid = db.start_session(time.time())

    await poller.poll()
    await poller.poll()

    assert notifier.send.await_count == 1


@pytest.mark.asyncio
async def test_signal_lost_alert(db):
    ha = make_ha([None, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)
    db.set_setting("signal_lost_seconds", "0")  # immediate signal lost

    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=203.0)
    sid = db.start_session(time.time())

    await poller.poll()

    notifier.send.assert_awaited()
    msg = notifier.send.call_args[0][0]
    assert "signal" in msg.lower() or "Signal" in msg


@pytest.mark.asyncio
async def test_clearing_config_clears_alert_state(db):
    ha = make_ha([205.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)
    db.set_setting("notification_repeat_seconds", "300")

    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=203.0)
    sid = db.start_session(time.time())
    await poller.poll()

    db.clear_probe_config(1)
    await poller.poll()

    # Re-set config — should alert again since state was cleared
    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=203.0)
    await poller.poll()

    assert notifier.send.await_count == 2
```

**Step 2: Run tests to verify they fail**

Run: `cd addon && python -m pytest ../tests/test_poller.py -v`
Expected: FAIL

**Step 3: Write the poller implementation**

Create `addon/src/poller.py`:

```python
import asyncio
import logging
import time
from typing import Optional

log = logging.getLogger(__name__)

DEFAULT_SIGNAL_LOST_SECONDS = 300
DEFAULT_NOTIFICATION_REPEAT_SECONDS = 300


class Poller:
    def __init__(self, *, ha, db, notifier, entity_ids: list[str]):
        self._ha = ha
        self._db = db
        self._notifier = notifier
        self._entity_ids = entity_ids
        self._probe_state: list[dict] = [
            {"probe": i + 1, "temp_f": None, "last_updated": None, "available": False}
            for i in range(4)
        ]
        self._last_good_ts: dict[int, float] = {}
        self._last_alert_ts: dict[int, float] = {}
        self._signal_lost_sent: set[int] = set()

    def latest_state(self) -> list[dict]:
        return list(self._probe_state)

    async def poll(self):
        now = time.time()
        temps = await self._ha.get_probe_temps(self._entity_ids)

        for i, t in enumerate(temps):
            probe_num = i + 1
            self._probe_state[i] = {
                "probe": probe_num,
                "temp_f": t["temp_f"],
                "last_updated": t["last_updated"],
                "available": t["available"],
            }
            if t["available"]:
                self._last_good_ts[probe_num] = now

        session = self._db.get_active_session()
        if not session:
            return

        sid = session["id"]

        for i, t in enumerate(temps):
            probe_num = i + 1
            if t["available"]:
                self._db.insert_reading(sid, now, probe_num, t["temp_f"])

        await self._evaluate_alerts(sid, now)

    async def _evaluate_alerts(self, session_id: int, now: float):
        configs = self._db.get_all_probe_configs()
        repeat_sec = self._db.get_setting_int(
            "notification_repeat_seconds", DEFAULT_NOTIFICATION_REPEAT_SECONDS
        )
        signal_lost_sec = self._db.get_setting_int(
            "signal_lost_seconds", DEFAULT_SIGNAL_LOST_SECONDS
        )
        notifications_enabled = self._db.get_setting("notifications_enabled", "true") != "false"

        for cfg in configs:
            probe_num = cfg["probe"]
            mode = cfg["mode"]

            if not mode:
                self._last_alert_ts.pop(probe_num, None)
                self._signal_lost_sent.discard(probe_num)
                continue

            probe_data = self._probe_state[probe_num - 1]
            label = cfg["label"] or f"Probe {probe_num}"

            if not probe_data["available"]:
                await self._check_signal_lost(
                    session_id, now, probe_num, label,
                    signal_lost_sec, repeat_sec, notifications_enabled,
                )
                continue

            self._signal_lost_sent.discard(probe_num)

            if mode == "setpoint":
                await self._check_setpoint(
                    session_id, now, probe_num, label,
                    probe_data["temp_f"], cfg["target_temp_f"],
                    repeat_sec, notifications_enabled,
                )
            elif mode == "range":
                await self._check_range(
                    session_id, now, probe_num, label,
                    probe_data["temp_f"], cfg["min_temp_f"], cfg["max_temp_f"],
                    repeat_sec, notifications_enabled,
                )

    async def _check_setpoint(
        self, sid, now, probe, label, temp_f, target_f, repeat_sec, notify_on,
    ):
        if target_f is None or temp_f < target_f:
            return
        if not self._can_alert(probe, now, repeat_sec):
            return
        self._last_alert_ts[probe] = now
        msg = f"🔥 {label}: reached {temp_f:.1f}°F (target {target_f:.1f}°F)"
        self._db.insert_alert(sid, now, probe, "setpoint_reached", msg)
        if notify_on:
            await self._notifier.send(msg)

    async def _check_range(
        self, sid, now, probe, label, temp_f, min_f, max_f, repeat_sec, notify_on,
    ):
        if min_f is None or max_f is None:
            return
        if min_f <= temp_f <= max_f:
            return
        if not self._can_alert(probe, now, repeat_sec):
            return
        self._last_alert_ts[probe] = now
        direction = "below" if temp_f < min_f else "above"
        msg = (
            f"⚠️ {label}: {temp_f:.1f}°F is {direction} range "
            f"({min_f:.1f}–{max_f:.1f}°F)"
        )
        self._db.insert_alert(sid, now, probe, "range_breach", msg)
        if notify_on:
            await self._notifier.send(msg)

    async def _check_signal_lost(
        self, sid, now, probe, label, threshold_sec, repeat_sec, notify_on,
    ):
        last_good = self._last_good_ts.get(probe)
        if last_good is not None and (now - last_good) < threshold_sec:
            return
        if not self._can_alert(probe, now, repeat_sec):
            return
        self._last_alert_ts[probe] = now
        msg = f"📡 {label}: Signal lost"
        self._db.insert_alert(sid, now, probe, "signal_lost", msg)
        if notify_on:
            await self._notifier.send(msg)

    def _can_alert(self, probe: int, now: float, repeat_sec: int) -> bool:
        last = self._last_alert_ts.get(probe)
        if last is None:
            return True
        return (now - last) >= repeat_sec

    async def run_loop(self, interval=5):
        while True:
            try:
                await self.poll()
            except Exception as e:
                log.error("Poller error: %s", e)
            await asyncio.sleep(
                int(interval() if callable(interval) else interval)
            )
```

**Step 4: Run tests to verify they pass**

Run: `cd addon && python -m pytest ../tests/test_poller.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add addon/src/poller.py tests/test_poller.py
git commit -m "feat: poller with temp reading, alert evaluation, and signal loss detection"
```

---

### Task 6: Web Server (REST API)

**Files:**
- Create: `addon/src/web.py`
- Create: `tests/test_web.py`

**Step 1: Write the failing test**

Create `tests/test_web.py`:

```python
import pytest
import pytest_asyncio
import time
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from unittest.mock import AsyncMock, MagicMock
from src.web import WebServer
from src.database import Database


def make_poller(temps=None):
    if temps is None:
        temps = [225.0, 180.0, None, None]
    poller = MagicMock()
    poller.latest_state.return_value = [
        {"probe": i + 1, "temp_f": temps[i] if i < len(temps) else None,
         "last_updated": "2026-05-30T12:00:00Z" if (i < len(temps) and temps[i]) else None,
         "available": temps[i] is not None and temps[i] > 0 if i < len(temps) else False}
        for i in range(4)
    ]
    return poller


@pytest_asyncio.fixture
async def client(db):
    poller = make_poller()
    server = WebServer(db=db, poller=poller)
    app = web.Application()
    server.attach(app)
    async with TestClient(TestServer(app)) as c:
        yield c, db


@pytest.mark.asyncio
async def test_dashboard(client):
    c, db = client
    resp = await c.get("/api/dashboard")
    assert resp.status == 200
    data = await resp.json()
    assert "probes" in data
    assert len(data["probes"]) == 4
    assert data["probes"][0]["temp_f"] == 225.0


@pytest.mark.asyncio
async def test_session_start_stop(client):
    c, db = client
    resp = await c.post("/api/session/start")
    assert resp.status == 200
    data = await resp.json()
    assert "session_id" in data

    resp = await c.post("/api/session/end")
    assert resp.status == 200


@pytest.mark.asyncio
async def test_preset_crud(client):
    c, db = client
    resp = await c.post("/api/presets", json={
        "meat": "Brisket", "doneness": "Done", "temp_f": 203.0
    })
    assert resp.status == 200
    data = await resp.json()
    pid = data["id"]

    resp = await c.get("/api/presets")
    assert resp.status == 200
    data = await resp.json()
    assert len(data["presets"]) == 1

    resp = await c.put(f"/api/presets/{pid}", json={
        "meat": "Brisket", "doneness": "Done", "temp_f": 205.0
    })
    assert resp.status == 200

    resp = await c.delete(f"/api/presets/{pid}")
    assert resp.status == 200

    resp = await c.get("/api/presets")
    data = await resp.json()
    assert len(data["presets"]) == 0


@pytest.mark.asyncio
async def test_range_preset_crud(client):
    c, db = client
    resp = await c.post("/api/range-presets", json={
        "name": "Low and Slow", "min_temp_f": 225.0, "max_temp_f": 275.0
    })
    assert resp.status == 200

    resp = await c.get("/api/range-presets")
    data = await resp.json()
    assert len(data["presets"]) == 1


@pytest.mark.asyncio
async def test_probe_config(client):
    c, db = client
    resp = await c.post("/api/probe/1/config", json={
        "mode": "setpoint", "label": "Brisket", "target_temp_f": 203.0
    })
    assert resp.status == 200

    resp = await c.get("/api/dashboard")
    data = await resp.json()
    assert data["probes"][0]["config"]["mode"] == "setpoint"

    resp = await c.delete("/api/probe/1/config")
    assert resp.status == 200


@pytest.mark.asyncio
async def test_settings_crud(client):
    c, db = client
    resp = await c.post("/api/settings", json={
        "unit": "C", "poll_interval": "10"
    })
    assert resp.status == 200

    resp = await c.get("/api/settings")
    data = await resp.json()
    assert data["unit"] == "C"


@pytest.mark.asyncio
async def test_session_history(client):
    c, db = client
    now = time.time()
    sid = db.start_session(now)
    db.insert_reading(sid, now, 1, 225.0)
    db.insert_reading(sid, now + 5, 1, 230.0)
    db.end_session(sid, now + 3600)

    resp = await c.get("/api/sessions")
    data = await resp.json()
    assert len(data["sessions"]) == 1

    resp = await c.get(f"/api/sessions/{sid}")
    data = await resp.json()
    assert len(data["readings"]) == 2
    assert len(data["alerts"]) == 0
```

**Step 2: Run tests to verify they fail**

Run: `cd addon && python -m pytest ../tests/test_web.py -v`
Expected: FAIL

**Step 3: Write the web server implementation**

Create `addon/src/web.py`:

```python
import json
import logging
import time
from pathlib import Path
from aiohttp import web

log = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).parent / "static"


class WebServer:
    def __init__(self, *, db, poller):
        self._db = db
        self._poller = poller

    def attach(self, app: web.Application) -> None:
        app.router.add_get("/api/dashboard", self.handle_dashboard)
        app.router.add_post("/api/session/start", self.handle_session_start)
        app.router.add_post("/api/session/end", self.handle_session_end)
        app.router.add_get("/api/sessions", self.handle_sessions)
        app.router.add_get("/api/sessions/{id}", self.handle_session_detail)
        app.router.add_get("/api/presets", self.handle_list_presets)
        app.router.add_post("/api/presets", self.handle_add_preset)
        app.router.add_put("/api/presets/{id}", self.handle_update_preset)
        app.router.add_delete("/api/presets/{id}", self.handle_delete_preset)
        app.router.add_get("/api/range-presets", self.handle_list_range_presets)
        app.router.add_post("/api/range-presets", self.handle_add_range_preset)
        app.router.add_put("/api/range-presets/{id}", self.handle_update_range_preset)
        app.router.add_delete("/api/range-presets/{id}", self.handle_delete_range_preset)
        app.router.add_post("/api/probe/{probe}/config", self.handle_set_probe_config)
        app.router.add_delete("/api/probe/{probe}/config", self.handle_clear_probe_config)
        app.router.add_get("/api/settings", self.handle_get_settings)
        app.router.add_post("/api/settings", self.handle_set_settings)

        dist = STATIC_DIR / "dist"
        if dist.exists():
            app.router.add_static("/assets/", path=str(dist / "assets"))
            app.router.add_get("/{tail:.*}", self.handle_spa_fallback)
        app.router.add_get("/", self.handle_spa_fallback)

    # -- Dashboard --

    async def handle_dashboard(self, request):
        probes = self._poller.latest_state()
        configs = self._db.get_all_probe_configs()
        session = self._db.get_active_session()

        probe_data = []
        for i, p in enumerate(probes):
            cfg = configs[i]
            probe_data.append({**p, "config": cfg})

        return web.json_response({
            "probes": probe_data,
            "session": session,
        })

    # -- Sessions --

    async def handle_session_start(self, request):
        now = time.time()
        sid = self._db.start_session(now)
        return web.json_response({"ok": True, "session_id": sid})

    async def handle_session_end(self, request):
        session = self._db.get_active_session()
        if not session:
            return web.json_response({"error": "no active session"}, status=400)
        self._db.end_session(session["id"], time.time())
        return web.json_response({"ok": True})

    async def handle_sessions(self, request):
        sessions = self._db.list_sessions()
        return web.json_response({"sessions": sessions})

    async def handle_session_detail(self, request):
        sid = int(request.match_info["id"])
        session = self._db.get_session(sid)
        if not session:
            return web.json_response({"error": "not found"}, status=404)
        readings = self._db.get_readings(sid)
        alerts = self._db.get_alerts(sid)
        return web.json_response({
            "session": session,
            "readings": readings,
            "alerts": alerts,
        })

    # -- Presets --

    async def handle_list_presets(self, request):
        return web.json_response({"presets": self._db.list_presets()})

    async def handle_add_preset(self, request):
        body = await request.json()
        pid = self._db.add_preset(body["meat"], body["doneness"], body["temp_f"])
        return web.json_response({"ok": True, "id": pid})

    async def handle_update_preset(self, request):
        pid = int(request.match_info["id"])
        body = await request.json()
        self._db.update_preset(pid, body["meat"], body["doneness"], body["temp_f"])
        return web.json_response({"ok": True})

    async def handle_delete_preset(self, request):
        pid = int(request.match_info["id"])
        self._db.delete_preset(pid)
        return web.json_response({"ok": True})

    # -- Range Presets --

    async def handle_list_range_presets(self, request):
        return web.json_response({"presets": self._db.list_range_presets()})

    async def handle_add_range_preset(self, request):
        body = await request.json()
        rid = self._db.add_range_preset(
            body["name"], body["min_temp_f"], body["max_temp_f"]
        )
        return web.json_response({"ok": True, "id": rid})

    async def handle_update_range_preset(self, request):
        rid = int(request.match_info["id"])
        body = await request.json()
        self._db.update_range_preset(
            rid, body["name"], body["min_temp_f"], body["max_temp_f"]
        )
        return web.json_response({"ok": True})

    async def handle_delete_range_preset(self, request):
        rid = int(request.match_info["id"])
        self._db.delete_range_preset(rid)
        return web.json_response({"ok": True})

    # -- Probe Config --

    async def handle_set_probe_config(self, request):
        probe = int(request.match_info["probe"])
        body = await request.json()
        self._db.set_probe_config(
            probe,
            mode=body.get("mode"),
            label=body.get("label"),
            target_temp_f=body.get("target_temp_f"),
            min_temp_f=body.get("min_temp_f"),
            max_temp_f=body.get("max_temp_f"),
            preset_id=body.get("preset_id"),
            range_preset_id=body.get("range_preset_id"),
        )
        return web.json_response({"ok": True})

    async def handle_clear_probe_config(self, request):
        probe = int(request.match_info["probe"])
        self._db.clear_probe_config(probe)
        return web.json_response({"ok": True})

    # -- Settings --

    async def handle_get_settings(self, request):
        return web.json_response({
            "unit": self._db.get_setting("unit", "F"),
            "poll_interval": self._db.get_setting("poll_interval", "5"),
            "notification_repeat_seconds": self._db.get_setting(
                "notification_repeat_seconds", "300"
            ),
            "notifications_enabled": self._db.get_setting(
                "notifications_enabled", "true"
            ),
            "signal_lost_seconds": self._db.get_setting(
                "signal_lost_seconds", "300"
            ),
            "discord_notify_entity": self._db.get_setting(
                "discord_notify_entity", "notify.robeson_chat"
            ),
            "discord_alerts_channel_id": self._db.get_setting(
                "discord_alerts_channel_id", "1483226515461115954"
            ),
            "probe_entity_1": self._db.get_setting(
                "probe_entity_1", "sensor.ibbq_4t_probe_1"
            ),
            "probe_entity_2": self._db.get_setting(
                "probe_entity_2", "sensor.ibbq_4t_probe_2"
            ),
            "probe_entity_3": self._db.get_setting(
                "probe_entity_3", "sensor.ibbq_4t_probe_3"
            ),
            "probe_entity_4": self._db.get_setting(
                "probe_entity_4", "sensor.ibbq_4t_probe_4"
            ),
        })

    async def handle_set_settings(self, request):
        body = await request.json()
        for key, value in body.items():
            self._db.set_setting(key, str(value))
        return web.json_response({"ok": True})

    # -- SPA --

    async def handle_spa_fallback(self, request):
        index = STATIC_DIR / "dist" / "index.html"
        if index.exists():
            return web.FileResponse(index)
        return web.Response(text="Frontend not built. Run build.sh first.", status=503)

    async def run(self, port: int = 8099):
        app = web.Application()
        self.attach(app)
        runner = web.AppRunner(app)
        await runner.setup()
        await web.TCPSite(runner, "0.0.0.0", port).start()
        log.info("Web UI on port %d", port)
        while True:
            await asyncio.sleep(3600)
```

**Step 4: Run tests to verify they pass**

Run: `cd addon && python -m pytest ../tests/test_web.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add addon/src/web.py tests/test_web.py
git commit -m "feat: REST API with dashboard, sessions, presets, probe config, settings"
```

---

### Task 7: Main Entry Point

**Files:**
- Create: `addon/src/main.py`

**Step 1: Write the main entry point**

Create `addon/src/main.py`:

```python
import asyncio
import json
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
```

**Step 2: Commit**

```bash
git add addon/src/main.py
git commit -m "feat: main entry point wiring poller and web server"
```

---

### Task 8: Frontend Scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/api/client.ts`

**Step 1: Create frontend/package.json**

```json
{
  "name": "ha-ibbq-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.3",
    "vite": "^5.4.0"
  }
}
```

**Step 2: Create frontend/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../addon/src/static/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8099',
    },
  },
})
```

**Step 3: Create frontend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

**Step 4: Create frontend/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>BBQ Monitor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 5: Create frontend/src/styles/tokens.css**

Use the ha-heatcast tokens.css as reference but adapt the color palette for a BBQ/fire theme. Keep the same structure: CSS custom properties for colors, fonts, radii, plus global utility classes (`.tap`, `.mono`), global input styles, and `.screen-grid`.

Key color adaptations:
- `--ember` family as primary (fire/heat theme)
- `--leaf` for in-range/good
- `--rose` for alerts/breached
- `--honey` for warnings/approaching

**Step 6: Create frontend/src/main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/tokens.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Step 7: Create frontend/src/api/client.ts**

```typescript
const BASE = './api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`)
  return res.json()
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}`)
  return res.json()
}

async function put<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`PUT ${path}: ${res.status}`)
  return res.json()
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`DELETE ${path}: ${res.status}`)
  return res.json()
}

// -- Types --

export interface ProbeConfig {
  probe: number
  mode: string | null
  label: string | null
  target_temp_f: number | null
  min_temp_f: number | null
  max_temp_f: number | null
  preset_id: number | null
  range_preset_id: number | null
}

export interface ProbeData {
  probe: number
  temp_f: number | null
  last_updated: string | null
  available: boolean
  config: ProbeConfig
}

export interface Session {
  id: number
  start_ts: number
  end_ts: number | null
}

export interface DashboardData {
  probes: ProbeData[]
  session: Session | null
}

export interface Preset {
  id: number
  meat: string
  doneness: string
  temp_f: number
}

export interface RangePreset {
  id: number
  name: string
  min_temp_f: number
  max_temp_f: number
}

export interface Reading {
  id: number
  session_id: number
  timestamp: number
  probe: number
  temp_f: number
}

export interface Alert {
  id: number
  session_id: number
  timestamp: number
  probe: number
  alert_type: string
  message: string
}

export interface SettingsData {
  unit: string
  poll_interval: string
  notification_repeat_seconds: string
  notifications_enabled: string
  signal_lost_seconds: string
  discord_notify_entity: string
  discord_alerts_channel_id: string
  probe_entity_1: string
  probe_entity_2: string
  probe_entity_3: string
  probe_entity_4: string
}

// -- API --

export const api = {
  dashboard: () => get<DashboardData>('/dashboard'),
  startSession: () => post<{ ok: boolean; session_id: number }>('/session/start'),
  endSession: () => post<{ ok: boolean }>('/session/end'),
  sessions: () => get<{ sessions: Session[] }>('/sessions'),
  sessionDetail: (id: number) =>
    get<{ session: Session; readings: Reading[]; alerts: Alert[] }>(`/sessions/${id}`),
  presets: () => get<{ presets: Preset[] }>('/presets'),
  addPreset: (p: Omit<Preset, 'id'>) => post<{ ok: boolean; id: number }>('/presets', p),
  updatePreset: (id: number, p: Omit<Preset, 'id'>) => put<{ ok: boolean }>(`/presets/${id}`, p),
  deletePreset: (id: number) => del<{ ok: boolean }>(`/presets/${id}`),
  rangePresets: () => get<{ presets: RangePreset[] }>('/range-presets'),
  addRangePreset: (p: Omit<RangePreset, 'id'>) =>
    post<{ ok: boolean; id: number }>('/range-presets', p),
  updateRangePreset: (id: number, p: Omit<RangePreset, 'id'>) =>
    put<{ ok: boolean }>(`/range-presets/${id}`, p),
  deleteRangePreset: (id: number) => del<{ ok: boolean }>(`/range-presets/${id}`),
  setProbeConfig: (probe: number, config: Partial<ProbeConfig>) =>
    post<{ ok: boolean }>(`/probe/${probe}/config`, config),
  clearProbeConfig: (probe: number) => del<{ ok: boolean }>(`/probe/${probe}/config`),
  settings: () => get<SettingsData>('/settings'),
  updateSettings: (s: Partial<SettingsData>) => post<{ ok: boolean }>('/settings', s),
}
```

**Step 8: Create frontend/src/App.tsx**

```typescript
import React, { useState, useCallback, useEffect } from 'react'
import { api, DashboardData, SettingsData, Preset, RangePreset } from './api/client'
import { Dashboard } from './screens/Dashboard'
import { Presets } from './screens/Presets'
import { Settings } from './screens/Settings'
import { TabBar, TabId } from './components/TabBar'

const POLL_MS = 5_000

export const App: React.FC = () => {
  const [tab, setTab] = useState<TabId>('dashboard')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [presets, setPresets] = useState<Preset[] | null>(null)
  const [rangePresets, setRangePresets] = useState<RangePreset[] | null>(null)
  const [settings, setSettings] = useState<SettingsData | null>(null)

  const load = useCallback(async () => {
    try {
      switch (tab) {
        case 'dashboard': {
          const d = await api.dashboard()
          setDashboard(d)
          break
        }
        case 'presets': {
          const [p, rp] = await Promise.all([api.presets(), api.rangePresets()])
          setPresets(p.presets)
          setRangePresets(rp.presets)
          break
        }
        case 'settings': {
          const s = await api.settings()
          setSettings(s)
          break
        }
      }
    } catch { /* retry next poll */ }
  }, [tab])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-0)', color: 'var(--fg-0)',
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        {tab === 'dashboard' && <Dashboard data={dashboard} onRefresh={load} />}
        {tab === 'presets' && (
          <Presets presets={presets} rangePresets={rangePresets} onRefresh={load} />
        )}
        {tab === 'settings' && <Settings data={settings} onRefresh={load} />}
      </div>
      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
```

**Step 9: Install dependencies and verify build**

Run: `cd frontend && npm install && npx tsc --noEmit`
Note: This will fail until screens/components are created — that's expected. Just verify npm install works.

**Step 10: Commit**

```bash
git add frontend/ build.sh
git commit -m "feat: frontend scaffold with Vite, React, API client, and App shell"
```

---

### Task 9: Frontend Components

**Files:**
- Create: `frontend/src/components/TabBar.tsx`
- Create: `frontend/src/components/Card.tsx`
- Create: `frontend/src/components/ProbeCard.tsx`
- Create: `frontend/src/components/SessionBar.tsx`
- Create: `frontend/src/components/Segmented.tsx`
- Create: `frontend/src/components/BottomSheet.tsx`

**Step 1: Create TabBar**

Three tabs: Dashboard (flame icon), Presets (list icon), Settings (gear icon). Follow the ha-heatcast TabBar pattern: fixed position bottom, gradient backdrop blur, SVG icons inline.

```typescript
export type TabId = 'dashboard' | 'presets' | 'settings'

interface Props {
  active: TabId
  onChange: (tab: TabId) => void
}
```

**Step 2: Create Card**

Same as ha-heatcast: `background: var(--bg-2)`, `border: 1px solid var(--line-1)`, `borderRadius: var(--r-lg)`.

**Step 3: Create ProbeCard**

The main dashboard component for each probe. Displays:
- Probe number and editable label
- Large temperature reading with unit conversion
- Mode toggle (Segmented: Setpoint | Range)
- Setpoint mode: target input + preset dropdown (meat → doneness)
- Range mode: min/max inputs + range preset dropdown
- Status dot: green/amber/red based on proximity to target/range
- States: Active (normal), Signal Lost (yellow border), No Probe (greyed out, opacity 0.4)

**Step 4: Create SessionBar**

Top bar with:
- "Start Cook" / "End Cook" button
- Elapsed timer (updates every second via setInterval)
- Session status indicator

**Step 5: Create Segmented**

Same as ha-heatcast: pill-shaped toggle with `var(--bg-3)` background.

**Step 6: Create BottomSheet**

Same as ha-heatcast: fixed overlay with slide-up animation, manages body overflow.

**Step 7: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

**Step 8: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: UI components — TabBar, Card, ProbeCard, SessionBar, Segmented, BottomSheet"
```

---

### Task 10: Dashboard Screen

**Files:**
- Create: `frontend/src/screens/Dashboard.tsx`

**Step 1: Build the Dashboard screen**

Layout:
- `SessionBar` at top
- 2x2 grid of `ProbeCard` components (use CSS grid: `grid-template-columns: 1fr 1fr` on >=600px, single column on mobile)
- "History" section below the grid showing past cook sessions as a collapsible list

State management:
- Receives `DashboardData | null` and `onRefresh` from App
- Shows loading state when data is null
- Presets loaded on demand when user opens a preset selector

Temperature conversion: read unit from dashboard data or fetch settings, convert with `(f - 32) * 5/9` when unit is "C".

ProbeCard interactions:
- Mode toggle calls `api.setProbeConfig()` then `onRefresh()`
- Preset selection calls `api.setProbeConfig()` with preset values
- Clear button calls `api.clearProbeConfig()` then `onRefresh()`

Session bar interactions:
- Start calls `api.startSession()` then `onRefresh()`
- End calls `api.endSession()` then `onRefresh()`

History section:
- Lists past sessions with timestamp and duration
- Tap to expand shows readings chart and alerts (future enhancement: canvas chart; for now, a simple table of readings)

**Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add frontend/src/screens/Dashboard.tsx
git commit -m "feat: Dashboard screen with probe cards, session bar, and cook history"
```

---

### Task 11: Presets Screen

**Files:**
- Create: `frontend/src/screens/Presets.tsx`

**Step 1: Build the Presets screen**

Two sections in a scrollable view:

**Meat/Doneness Presets:**
- List of existing presets grouped by meat type
- Each row: meat name, doneness, target temp (in current unit)
- Edit/delete buttons per row
- "Add Preset" button opens BottomSheet with: meat (text input), doneness (text input), target temp (number input)
- Edit opens same BottomSheet pre-filled

**Range Presets:**
- List of existing range presets
- Each row: name, min–max temp range
- Edit/delete buttons per row
- "Add Range Preset" button opens BottomSheet with: name (text), min temp (number), max temp (number)

All temps displayed in current unit setting, stored as °F internally.

**Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add frontend/src/screens/Presets.tsx
git commit -m "feat: Presets screen with meat/doneness and range preset management"
```

---

### Task 12: Settings Screen

**Files:**
- Create: `frontend/src/screens/Settings.tsx`

**Step 1: Build the Settings screen**

Sections with form fields:

**General:**
- Temperature unit: Segmented control (°F | °C)
- Poll interval: number input (seconds)

**Notifications:**
- Enable/disable: toggle
- Repeat interval: number input (seconds)
- Discord entity: text input (default: `notify.robeson_chat`)
- Discord channel ID: text input (default: `1483226515461115954`)

**Probes:**
- Entity ID for each probe: text inputs (1–4)

**Signal:**
- Signal lost threshold: number input (seconds)

Each field calls `api.updateSettings()` on change (debounced or on blur).

**Step 2: Verify and build**

Run: `cd frontend && npx tsc --noEmit && npm run build`

**Step 3: Commit**

```bash
git add frontend/src/screens/Settings.tsx
git commit -m "feat: Settings screen with unit, notifications, probes, and signal config"
```

---

### Task 13: Integration Testing & Polish

**Step 1: Run all backend tests**

Run: `cd addon && python -m pytest ../tests/ -v`
Expected: All PASS

**Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds, output in `addon/src/static/dist/`

**Step 3: Fix any issues found**

Address any TypeScript errors, test failures, or missing imports.

**Step 4: Add missing `asyncio` import in web.py**

The `run()` method uses `asyncio.sleep` — ensure `import asyncio` is at the top.

**Step 5: Add `aioresponses` to test requirements**

Create `tests/requirements.txt`:
```
pytest>=7.0
pytest-asyncio>=0.23
aioresponses>=0.7
```

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: integration fixes and test requirements"
```

---

### Task 14: Default Settings Initialization

**Step 1: Add default settings migration to database init**

In `database.py`, after `init_schema()` creates tables, insert default settings if not present:

```python
defaults = {
    "unit": "F",
    "poll_interval": "5",
    "notification_repeat_seconds": "300",
    "notifications_enabled": "true",
    "signal_lost_seconds": "300",
    "discord_notify_entity": "notify.robeson_chat",
    "discord_alerts_channel_id": "1483226515461115954",
    "probe_entity_1": "sensor.ibbq_4t_probe_1",
    "probe_entity_2": "sensor.ibbq_4t_probe_2",
    "probe_entity_3": "sensor.ibbq_4t_probe_3",
    "probe_entity_4": "sensor.ibbq_4t_probe_4",
}
for key, value in defaults.items():
    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
        (key, value),
    )
```

**Step 2: Test defaults are set**

```python
def test_default_settings(db):
    assert db.get_setting("unit") == "F"
    assert db.get_setting("probe_entity_1") == "sensor.ibbq_4t_probe_1"
```

**Step 3: Commit**

```bash
git add addon/src/database.py tests/test_database.py
git commit -m "feat: default settings initialization for probes, discord, and units"
```
