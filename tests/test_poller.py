import time
import pytest
from unittest.mock import AsyncMock

from src.poller import Poller


ENTITY_IDS = [
    "sensor.probe_1",
    "sensor.probe_2",
    "sensor.probe_3",
    "sensor.probe_4",
]


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

    assert len(state) == 4
    assert state[0]["temp_f"] == 225.0
    assert state[0]["available"] is True
    assert state[1]["temp_f"] == 180.0
    assert state[1]["available"] is True
    assert state[2]["temp_f"] is None
    assert state[2]["available"] is False
    assert state[3]["temp_f"] is None
    assert state[3]["available"] is False


@pytest.mark.asyncio
async def test_poll_logs_readings_during_session(db):
    ha = make_ha([225.0, 180.0, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    session_id = db.start_session(time.time())
    await poller.poll()

    readings = db.get_readings(session_id)
    # Only probes 1 and 2 have valid temps
    assert len(readings) == 2
    probes_logged = {r["probe"] for r in readings}
    assert probes_logged == {1, 2}
    assert readings[0]["temp_f"] == 225.0
    assert readings[1]["temp_f"] == 180.0


@pytest.mark.asyncio
async def test_no_readings_without_session(db):
    ha = make_ha([225.0, 180.0, 150.0, 160.0])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    await poller.poll()

    # No session active, so no readings should be inserted.
    # We can't query readings without a session_id, but we can verify
    # by starting a session now and confirming it has no readings.
    sid = db.start_session(time.time())
    readings = db.get_readings(sid)
    assert len(readings) == 0


@pytest.mark.asyncio
async def test_setpoint_alert_fires(db):
    ha = make_ha([205.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    session_id = db.start_session(time.time())
    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=200.0)

    await poller.poll()

    notifier.send.assert_called_once()
    msg = notifier.send.call_args[0][0]
    assert "Brisket" in msg or "probe 1" in msg.lower() or "Probe 1" in msg

    alerts = db.get_alerts(session_id)
    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "setpoint"
    assert alerts[0]["probe"] == 1


@pytest.mark.asyncio
async def test_range_breach_alert(db):
    # Temp 150 is below range min of 200
    ha = make_ha([150.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    session_id = db.start_session(time.time())
    db.set_probe_config(1, mode="range", label="Smoker",
                        min_temp_f=200.0, max_temp_f=275.0)

    await poller.poll()

    notifier.send.assert_called_once()
    msg = notifier.send.call_args[0][0]
    assert "Smoker" in msg or "probe 1" in msg.lower() or "Probe 1" in msg

    alerts = db.get_alerts(session_id)
    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "range"
    assert alerts[0]["probe"] == 1


@pytest.mark.asyncio
async def test_no_alert_without_session(db):
    ha = make_ha([205.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=200.0)

    await poller.poll()

    notifier.send.assert_not_called()


@pytest.mark.asyncio
async def test_no_alert_without_config(db):
    ha = make_ha([205.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    db.start_session(time.time())
    # No probe config set

    await poller.poll()

    notifier.send.assert_not_called()


@pytest.mark.asyncio
async def test_alert_repeats_after_interval(db):
    ha = make_ha([205.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    db.start_session(time.time())
    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=200.0)
    db.set_setting("notification_repeat_seconds", "0")

    await poller.poll()
    await poller.poll()

    assert notifier.send.call_count == 2


@pytest.mark.asyncio
async def test_alert_respects_cooldown(db):
    ha = make_ha([205.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    db.start_session(time.time())
    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=200.0)
    db.set_setting("notification_repeat_seconds", "300")

    await poller.poll()
    await poller.poll()

    assert notifier.send.call_count == 1


@pytest.mark.asyncio
async def test_signal_lost_alert(db):
    ha = make_ha([None, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    session_id = db.start_session(time.time())
    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=200.0)
    db.set_setting("signal_lost_seconds", "0")

    await poller.poll()

    notifier.send.assert_called_once()
    msg = notifier.send.call_args[0][0]
    assert "signal" in msg.lower() or "lost" in msg.lower()

    alerts = db.get_alerts(session_id)
    assert len(alerts) == 1
    assert alerts[0]["alert_type"] == "signal_lost"


@pytest.mark.asyncio
async def test_clearing_config_clears_alert_state(db):
    ha = make_ha([205.0, None, None, None])
    notifier = AsyncMock()
    poller = Poller(ha=ha, db=db, notifier=notifier, entity_ids=ENTITY_IDS)

    db.start_session(time.time())
    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=200.0)
    db.set_setting("notification_repeat_seconds", "300")

    # First poll: alert fires
    await poller.poll()
    assert notifier.send.call_count == 1

    # Clear config: should reset alert state
    db.clear_probe_config(1)
    await poller.poll()

    # Re-set same config
    db.set_probe_config(1, mode="setpoint", label="Brisket", target_temp_f=200.0)

    # Poll again: alert should fire again (cooldown was cleared)
    await poller.poll()
    assert notifier.send.call_count == 2
