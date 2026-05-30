import time
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from src.web import WebServer


def make_poller(temps=None):
    if temps is None:
        temps = [225.0, 180.0, None, None]
    poller = MagicMock()
    poller.latest_state.return_value = [
        {
            "probe": i + 1,
            "temp_f": temps[i] if i < len(temps) else None,
            "last_updated": (
                "2026-05-30T12:00:00Z"
                if (i < len(temps) and temps[i])
                else None
            ),
            "available": (
                temps[i] is not None and temps[i] > 0
                if i < len(temps)
                else False
            ),
        }
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
    # Set up a probe config so the dashboard merges it
    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=203.0)

    resp = await c.get("/api/dashboard")
    assert resp.status == 200
    data = await resp.json()

    assert "probes" in data
    assert len(data["probes"]) == 4

    # Probe 1 should have temp and config merged
    p1 = data["probes"][0]
    assert p1["probe"] == 1
    assert p1["temp_f"] == 225.0
    assert p1["available"] is True
    assert p1["config"]["mode"] == "setpoint"
    assert p1["config"]["label"] == "Brisket"
    assert p1["config"]["target_temp_f"] == 203.0

    # Probe 3 should be unavailable with no temp
    p3 = data["probes"][2]
    assert p3["temp_f"] is None
    assert p3["available"] is False

    # No active session by default
    assert data["session"] is None


@pytest.mark.asyncio
async def test_session_start_stop(client):
    c, db = client

    # Start session
    resp = await c.post("/api/session/start")
    assert resp.status == 200
    data = await resp.json()
    assert "session_id" in data
    session_id = data["session_id"]
    assert isinstance(session_id, int)

    # Dashboard should now show the active session
    resp = await c.get("/api/dashboard")
    data = await resp.json()
    assert data["session"] is not None
    assert data["session"]["id"] == session_id

    # End session
    resp = await c.post("/api/session/end")
    assert resp.status == 200

    # Dashboard should show no active session
    resp = await c.get("/api/dashboard")
    data = await resp.json()
    assert data["session"] is None


@pytest.mark.asyncio
async def test_preset_crud(client):
    c, db = client

    # Create preset
    resp = await c.post(
        "/api/presets",
        json={"meat": "Brisket", "doneness": "Done", "temp_f": 203.0},
    )
    assert resp.status == 200
    data = await resp.json()
    assert data["ok"] is True
    preset_id = data["id"]

    # List presets
    resp = await c.get("/api/presets")
    assert resp.status == 200
    presets = await resp.json()
    assert len(presets) == 1
    assert presets[0]["meat"] == "Brisket"
    assert presets[0]["doneness"] == "Done"
    assert presets[0]["temp_f"] == 203.0

    # Update preset
    resp = await c.put(
        f"/api/presets/{preset_id}",
        json={"meat": "Brisket", "doneness": "Well Done", "temp_f": 210.0},
    )
    assert resp.status == 200

    # Verify update
    resp = await c.get("/api/presets")
    presets = await resp.json()
    assert presets[0]["doneness"] == "Well Done"
    assert presets[0]["temp_f"] == 210.0

    # Delete preset
    resp = await c.delete(f"/api/presets/{preset_id}")
    assert resp.status == 200

    # Verify deletion
    resp = await c.get("/api/presets")
    presets = await resp.json()
    assert len(presets) == 0


@pytest.mark.asyncio
async def test_range_preset_crud(client):
    c, db = client

    # Create range preset
    resp = await c.post(
        "/api/range-presets",
        json={"name": "Low and Slow", "min_temp_f": 225.0, "max_temp_f": 275.0},
    )
    assert resp.status == 200
    data = await resp.json()
    assert data["ok"] is True
    rp_id = data["id"]

    # List range presets
    resp = await c.get("/api/range-presets")
    assert resp.status == 200
    rps = await resp.json()
    assert len(rps) == 1
    assert rps[0]["name"] == "Low and Slow"
    assert rps[0]["min_temp_f"] == 225.0
    assert rps[0]["max_temp_f"] == 275.0

    # Update
    resp = await c.put(
        f"/api/range-presets/{rp_id}",
        json={"name": "Hot and Fast", "min_temp_f": 350.0, "max_temp_f": 400.0},
    )
    assert resp.status == 200

    # Verify update
    resp = await c.get("/api/range-presets")
    rps = await resp.json()
    assert rps[0]["name"] == "Hot and Fast"
    assert rps[0]["min_temp_f"] == 350.0

    # Delete
    resp = await c.delete(f"/api/range-presets/{rp_id}")
    assert resp.status == 200

    # Verify deletion
    resp = await c.get("/api/range-presets")
    rps = await resp.json()
    assert len(rps) == 0


@pytest.mark.asyncio
async def test_probe_config(client):
    c, db = client

    # Set probe config
    resp = await c.post(
        "/api/probe/1/config",
        json={
            "mode": "setpoint",
            "label": "Pork Butt",
            "target_temp_f": 195.0,
        },
    )
    assert resp.status == 200

    # Verify in dashboard
    resp = await c.get("/api/dashboard")
    data = await resp.json()
    p1 = data["probes"][0]
    assert p1["config"]["mode"] == "setpoint"
    assert p1["config"]["label"] == "Pork Butt"
    assert p1["config"]["target_temp_f"] == 195.0

    # Clear probe config
    resp = await c.delete("/api/probe/1/config")
    assert resp.status == 200

    # Verify cleared
    resp = await c.get("/api/dashboard")
    data = await resp.json()
    p1 = data["probes"][0]
    assert p1["config"]["mode"] is None
    assert p1["config"]["label"] is None


@pytest.mark.asyncio
async def test_settings_crud(client):
    c, db = client

    # Update settings
    resp = await c.post(
        "/api/settings",
        json={"unit": "C", "poll_interval": "10"},
    )
    assert resp.status == 200

    # Get settings
    resp = await c.get("/api/settings")
    assert resp.status == 200
    settings = await resp.json()
    assert settings["unit"] == "C"
    assert settings["poll_interval"] == "10"

    # Defaults should be present for unset keys
    assert settings["notification_repeat_seconds"] == "300"
    assert settings["notifications_enabled"] == "true"


@pytest.mark.asyncio
async def test_session_history(client):
    c, db = client

    # Start and end a session
    resp = await c.post("/api/session/start")
    data = await resp.json()
    session_id = data["session_id"]

    # Insert readings and alerts directly into db
    now = time.time()
    db.insert_reading(session_id, now, 1, 225.0)
    db.insert_reading(session_id, now + 5, 1, 230.0)
    db.insert_alert(session_id, now + 5, 1, "setpoint", "Reached target")

    # End session
    resp = await c.post("/api/session/end")
    assert resp.status == 200

    # List sessions
    resp = await c.get("/api/sessions")
    assert resp.status == 200
    sessions = await resp.json()
    assert len(sessions) >= 1
    assert sessions[0]["id"] == session_id

    # Get session detail
    resp = await c.get(f"/api/sessions/{session_id}")
    assert resp.status == 200
    detail = await resp.json()
    assert detail["session"]["id"] == session_id
    assert detail["session"]["end_ts"] is not None
    assert len(detail["readings"]) == 2
    assert len(detail["alerts"]) == 1
    assert detail["alerts"][0]["alert_type"] == "setpoint"
