import time


EXPECTED_TABLES = {
    "settings",
    "presets",
    "range_presets",
    "cook_sessions",
    "probe_config",
    "readings",
    "alert_log",
}


def test_init_schema_creates_tables(db):
    """Verify all 7 tables exist after init_schema."""
    tables = db.list_tables()
    for table in EXPECTED_TABLES:
        assert table in tables, f"Missing table: {table}"


def test_settings_roundtrip(db):
    """set/get/overwrite a setting."""
    db.set_setting("discord_webhook", "https://example.com/hook")
    assert db.get_setting("discord_webhook") == "https://example.com/hook"

    # Overwrite
    db.set_setting("discord_webhook", "https://example.com/hook2")
    assert db.get_setting("discord_webhook") == "https://example.com/hook2"


def test_get_setting_default(db):
    """Missing key returns default."""
    assert db.get_setting("nonexistent") == ""
    assert db.get_setting("nonexistent", "fallback") == "fallback"


def test_get_setting_int(db):
    """Integer parsing with fallback."""
    db.set_setting("poll_interval", "30")
    assert db.get_setting_int("poll_interval", 10) == 30

    # Missing key returns default
    assert db.get_setting_int("missing_key", 42) == 42

    # Unparseable returns default
    db.set_setting("bad_int", "not_a_number")
    assert db.get_setting_int("bad_int", 99) == 99


def test_get_setting_float(db):
    """Float parsing with fallback."""
    db.set_setting("threshold", "98.6")
    assert db.get_setting_float("threshold", 0.0) == 98.6

    # Missing key
    assert db.get_setting_float("missing", 3.14) == 3.14

    # Unparseable
    db.set_setting("bad_float", "abc")
    assert db.get_setting_float("bad_float", 1.5) == 1.5


def test_preset_crud(db):
    """add/list/update/delete meat/doneness presets."""
    # Add
    pid1 = db.add_preset("pork", "medium", 145.0)
    pid2 = db.add_preset("beef", "rare", 125.0)
    assert pid1 is not None
    assert pid2 is not None

    # List
    presets = db.list_presets()
    assert len(presets) == 2
    meats = {p["meat"] for p in presets}
    assert meats == {"pork", "beef"}

    # Get single
    p = db.get_preset(pid1)
    assert p["meat"] == "pork"
    assert p["doneness"] == "medium"
    assert p["temp_f"] == 145.0

    # Update
    db.update_preset(pid1, "pork", "well_done", 160.0)
    p = db.get_preset(pid1)
    assert p["doneness"] == "well_done"
    assert p["temp_f"] == 160.0

    # Delete
    db.delete_preset(pid2)
    presets = db.list_presets()
    assert len(presets) == 1
    assert presets[0]["meat"] == "pork"


def test_preset_unique_constraint(db):
    """UNIQUE(meat, doneness) prevents duplicates."""
    import sqlite3

    db.add_preset("brisket", "medium", 195.0)
    try:
        db.add_preset("brisket", "medium", 200.0)
        assert False, "Should have raised IntegrityError"
    except sqlite3.IntegrityError:
        pass


def test_range_preset_crud(db):
    """add/list/update/delete range presets."""
    # Add
    rid1 = db.add_range_preset("low_and_slow", 225.0, 275.0)
    rid2 = db.add_range_preset("hot_and_fast", 350.0, 400.0)
    assert rid1 is not None
    assert rid2 is not None

    # List
    rps = db.list_range_presets()
    assert len(rps) == 2
    names = {rp["name"] for rp in rps}
    assert names == {"low_and_slow", "hot_and_fast"}

    # Update
    db.update_range_preset(rid1, "low_and_slow_updated", 220.0, 280.0)
    rps = db.list_range_presets()
    names = {rp["name"] for rp in rps}
    assert "low_and_slow_updated" in names

    # Delete
    db.delete_range_preset(rid2)
    rps = db.list_range_presets()
    assert len(rps) == 1


def test_range_preset_unique_name(db):
    """name UNIQUE prevents duplicates."""
    import sqlite3

    db.add_range_preset("smoking", 225.0, 250.0)
    try:
        db.add_range_preset("smoking", 200.0, 300.0)
        assert False, "Should have raised IntegrityError"
    except sqlite3.IntegrityError:
        pass


def test_cook_session_lifecycle(db):
    """start/get_active/end/list sessions."""
    now = time.time()

    # Start session
    sid = db.start_session(now)
    assert sid is not None

    # Get active session
    active = db.get_active_session()
    assert active is not None
    assert active["id"] == sid
    assert active["end_ts"] is None

    # Get by ID
    s = db.get_session(sid)
    assert s["id"] == sid
    assert s["start_ts"] == now

    # End session
    end_ts = now + 3600
    db.end_session(sid, end_ts)
    s = db.get_session(sid)
    assert s["end_ts"] == end_ts

    # No active session after ending
    assert db.get_active_session() is None

    # List sessions
    sessions = db.list_sessions()
    assert len(sessions) == 1
    assert sessions[0]["id"] == sid


def test_readings_insert_and_query(db):
    """Insert readings, query by session and optionally by probe."""
    now = time.time()
    sid = db.start_session(now)

    # Insert readings for multiple probes
    for i in range(5):
        db.insert_reading(sid, now + i * 10, 1, 200.0 + i)
        db.insert_reading(sid, now + i * 10, 2, 150.0 + i)

    # Query all readings for session
    all_readings = db.get_readings(sid)
    assert len(all_readings) == 10

    # Query by probe
    probe1_readings = db.get_readings(sid, probe=1)
    assert len(probe1_readings) == 5
    assert all(r["probe"] == 1 for r in probe1_readings)

    probe2_readings = db.get_readings(sid, probe=2)
    assert len(probe2_readings) == 5
    assert all(r["probe"] == 2 for r in probe2_readings)


def test_readings_cascade_delete(db):
    """Readings are deleted when their session is deleted."""
    now = time.time()
    sid = db.start_session(now)
    db.insert_reading(sid, now, 1, 200.0)

    readings = db.get_readings(sid)
    assert len(readings) == 1

    # Delete session manually to test cascade
    with db._connect() as conn:
        conn.execute("DELETE FROM cook_sessions WHERE id=?", (sid,))

    readings = db.get_readings(sid)
    assert len(readings) == 0


def test_probe_config_crud(db):
    """set/get/clear probe config."""
    # Get default (no config set)
    cfg = db.get_probe_config(1)
    assert cfg["probe"] == 1
    assert cfg["mode"] is None
    assert cfg["label"] is None

    # Set config in setpoint mode
    pid = db.add_preset("chicken", "done", 165.0)
    db.set_probe_config(
        1,
        mode="setpoint",
        label="Chicken breast",
        target_temp_f=165.0,
        preset_id=pid,
    )
    cfg = db.get_probe_config(1)
    assert cfg["mode"] == "setpoint"
    assert cfg["label"] == "Chicken breast"
    assert cfg["target_temp_f"] == 165.0
    assert cfg["preset_id"] == pid

    # Update (upsert) same probe
    db.set_probe_config(
        1,
        mode="range",
        label="Smoker",
        min_temp_f=225.0,
        max_temp_f=275.0,
    )
    cfg = db.get_probe_config(1)
    assert cfg["mode"] == "range"
    assert cfg["label"] == "Smoker"
    assert cfg["min_temp_f"] == 225.0
    assert cfg["max_temp_f"] == 275.0

    # Get all probe configs
    all_cfgs = db.get_all_probe_configs()
    assert len(all_cfgs) == 4  # probes 1-4 with defaults for unconfigured
    configured = [c for c in all_cfgs if c["mode"] is not None]
    assert len(configured) == 1

    # Clear
    db.clear_probe_config(1)
    cfg = db.get_probe_config(1)
    assert cfg["mode"] is None


def test_probe_config_range_preset(db):
    """Probe config with range_preset_id FK."""
    rid = db.add_range_preset("low_and_slow", 225.0, 275.0)
    db.set_probe_config(
        2,
        mode="range",
        label="Pit temp",
        min_temp_f=225.0,
        max_temp_f=275.0,
        range_preset_id=rid,
    )
    cfg = db.get_probe_config(2)
    assert cfg["range_preset_id"] == rid


def test_probe_config_check_constraint(db):
    """Probe number must be 1-4."""
    import sqlite3

    try:
        db.set_probe_config(5, mode="setpoint", label="Bad probe")
        assert False, "Should have raised IntegrityError"
    except sqlite3.IntegrityError:
        pass

    try:
        db.set_probe_config(0, mode="setpoint", label="Bad probe")
        assert False, "Should have raised IntegrityError"
    except sqlite3.IntegrityError:
        pass


def test_alert_log(db):
    """Insert and get alerts."""
    now = time.time()
    sid = db.start_session(now)

    db.insert_alert(sid, now + 100, 1, "setpoint_reached", "Probe 1 hit 165F")
    db.insert_alert(sid, now + 200, 2, "range_breach", "Probe 2 dropped below 225F")

    alerts = db.get_alerts(sid)
    assert len(alerts) == 2
    assert alerts[0]["alert_type"] == "setpoint_reached"
    assert alerts[0]["probe"] == 1
    assert alerts[1]["alert_type"] == "range_breach"
    assert alerts[1]["message"] == "Probe 2 dropped below 225F"


def test_alert_cascade_delete(db):
    """Alerts are deleted when their session is deleted."""
    now = time.time()
    sid = db.start_session(now)
    db.insert_alert(sid, now, 1, "test", "test message")

    alerts = db.get_alerts(sid)
    assert len(alerts) == 1

    with db._connect() as conn:
        conn.execute("DELETE FROM cook_sessions WHERE id=?", (sid,))

    alerts = db.get_alerts(sid)
    assert len(alerts) == 0


def test_transaction_context_manager(db):
    """Transaction commits on success and rolls back on failure."""
    # Success case
    with db.transaction() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?)",
            ("tx_key", "tx_value"),
        )
    assert db.get_setting("tx_key") == "tx_value"

    # Failure case
    try:
        with db.transaction() as conn:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?)",
                ("rollback_key", "rollback_value"),
            )
            raise ValueError("Intentional error")
    except ValueError:
        pass
    assert db.get_setting("rollback_key") == ""


def test_default_settings(db):
    """Default settings are populated on schema init."""
    assert db.get_setting("unit") == "F"
    assert db.get_setting("poll_interval") == "5"
    assert db.get_setting("notification_repeat_seconds") == "300"
    assert db.get_setting("notifications_enabled") == "true"
    assert db.get_setting("signal_lost_seconds") == "300"
    assert db.get_setting("discord_notify_entity") == "notify.robeson_chat"
    assert db.get_setting("probe_entity_1") == "sensor.ibbq_4t_probe_1"
    assert db.get_setting("probe_entity_4") == "sensor.ibbq_4t_probe_4"


def test_default_settings_not_overwritten(db):
    """User-set values survive re-init."""
    db.set_setting("unit", "C")
    db.init_schema()
    assert db.get_setting("unit") == "C"
