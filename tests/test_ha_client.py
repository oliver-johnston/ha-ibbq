import pytest
import aiohttp
from aioresponses import aioresponses

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "addon"))

from src.ha_client import HAClient

BASE_URL = "http://supervisor/core"
TOKEN = "test-token-abc123"


@pytest.fixture
def client():
    return HAClient(BASE_URL, TOKEN)


@pytest.mark.asyncio
async def test_get_state(client):
    """Mock 200 response, verify JSON parsed."""
    payload = {
        "entity_id": "sensor.probe_1",
        "state": "225.0",
        "attributes": {"unit_of_measurement": "°F"},
        "last_updated": "2026-05-30T12:00:00+00:00",
    }
    with aioresponses() as m:
        m.get(f"{BASE_URL}/api/states/sensor.probe_1", payload=payload)
        result = await client.get_state("sensor.probe_1")

    assert result is not None
    assert result["entity_id"] == "sensor.probe_1"
    assert result["state"] == "225.0"
    assert result["last_updated"] == "2026-05-30T12:00:00+00:00"


@pytest.mark.asyncio
async def test_get_state_404(client):
    """Mock 404, verify returns None."""
    with aioresponses() as m:
        m.get(f"{BASE_URL}/api/states/sensor.nonexistent", status=404)
        result = await client.get_state("sensor.nonexistent")

    assert result is None


@pytest.mark.asyncio
async def test_get_state_error(client):
    """Mock exception, verify returns None."""
    with aioresponses() as m:
        m.get(
            f"{BASE_URL}/api/states/sensor.probe_1",
            exception=aiohttp.ClientError("Connection failed"),
        )
        result = await client.get_state("sensor.probe_1")

    assert result is None


@pytest.mark.asyncio
async def test_call_service(client):
    """Mock POST, verify it completes without error."""
    with aioresponses() as m:
        m.post(
            f"{BASE_URL}/api/services/switch/turn_on",
            payload={"result": "ok"},
        )
        # Should not raise
        await client.call_service("switch", "turn_on", {"entity_id": "switch.grill"})


@pytest.mark.asyncio
async def test_get_probe_temps(client):
    """Mock 4 probe states, verify temps are read directly (no scaling)."""
    entity_ids = [
        "sensor.ibbq_probe_1",
        "sensor.ibbq_probe_2",
        "sensor.ibbq_probe_3",
        "sensor.ibbq_probe_4",
    ]
    state_values = ["225.0", "165.0", "195.0", "0.0"]
    expected_temps = [225.0, 165.0, 195.0, 0.0]

    with aioresponses() as m:
        for eid, sv in zip(entity_ids, state_values):
            m.get(
                f"{BASE_URL}/api/states/{eid}",
                payload={
                    "entity_id": eid,
                    "state": sv,
                    "last_updated": "2026-05-30T12:00:00+00:00",
                },
            )

        results = await client.get_probe_temps(entity_ids)

    assert len(results) == 4
    for i, result in enumerate(results):
        assert result["entity_id"] == entity_ids[i]
        assert result["temp_f"] == expected_temps[i]
        assert result["last_updated"] == "2026-05-30T12:00:00+00:00"
        assert result["available"] is True


@pytest.mark.asyncio
async def test_get_probe_temps_unavailable(client):
    """Probe that returns 404 should have temp_f=None and available=False."""
    entity_ids = ["sensor.ibbq_probe_1"]

    with aioresponses() as m:
        m.get(f"{BASE_URL}/api/states/sensor.ibbq_probe_1", status=404)
        results = await client.get_probe_temps(entity_ids)

    assert len(results) == 1
    assert results[0]["entity_id"] == "sensor.ibbq_probe_1"
    assert results[0]["temp_f"] is None
    assert results[0]["last_updated"] is None
    assert results[0]["available"] is False


@pytest.mark.asyncio
async def test_get_probe_temps_unparseable_state(client):
    """Probe with non-numeric state should have temp_f=None, available=False."""
    entity_ids = ["sensor.ibbq_probe_1"]

    with aioresponses() as m:
        m.get(
            f"{BASE_URL}/api/states/sensor.ibbq_probe_1",
            payload={
                "entity_id": "sensor.ibbq_probe_1",
                "state": "unavailable",
                "last_updated": "2026-05-30T12:00:00+00:00",
            },
        )
        results = await client.get_probe_temps(entity_ids)

    assert len(results) == 1
    assert results[0]["temp_f"] is None
    assert results[0]["available"] is False
