import sqlite3
from contextlib import contextmanager
from typing import Optional


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
                    probe INTEGER PRIMARY KEY CHECK (probe >= 1 AND probe <= 4),
                    mode TEXT CHECK (mode IS NULL OR mode IN ('setpoint', 'range')),
                    label TEXT,
                    target_temp_f REAL,
                    min_temp_f REAL,
                    max_temp_f REAL,
                    preset_id INTEGER REFERENCES presets(id),
                    range_preset_id INTEGER REFERENCES range_presets(id)
                );

                CREATE TABLE IF NOT EXISTS readings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL REFERENCES cook_sessions(id) ON DELETE CASCADE,
                    timestamp REAL NOT NULL,
                    probe INTEGER NOT NULL CHECK (probe >= 1 AND probe <= 4),
                    temp_f REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_readings_session_probe_ts
                    ON readings(session_id, probe, timestamp);

                CREATE TABLE IF NOT EXISTS alert_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL REFERENCES cook_sessions(id) ON DELETE CASCADE,
                    timestamp REAL NOT NULL,
                    probe INTEGER,
                    alert_type TEXT NOT NULL,
                    message TEXT
                );
            """)

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

    def list_tables(self) -> list:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
            return [r["name"] for r in rows]

    # --- settings ---

    def get_setting(self, key: str, default: str = "") -> str:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT value FROM settings WHERE key=?", (key,)
            ).fetchone()
            return row["value"] if row else default

    def set_setting(self, key: str, value: str):
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value
            """, (key, value))

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

    # --- presets ---

    def add_preset(self, meat: str, doneness: str, temp_f: float) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO presets (meat, doneness, temp_f) VALUES (?, ?, ?)",
                (meat, doneness, temp_f),
            )
            return int(cur.lastrowid)

    def get_preset(self, id: int) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM presets WHERE id=?", (id,)
            ).fetchone()
            return dict(row) if row else None

    def list_presets(self) -> list:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM presets ORDER BY meat, doneness"
            ).fetchall()
            return [dict(r) for r in rows]

    def update_preset(self, id: int, meat: str, doneness: str, temp_f: float):
        with self._connect() as conn:
            conn.execute(
                "UPDATE presets SET meat=?, doneness=?, temp_f=? WHERE id=?",
                (meat, doneness, temp_f, id),
            )

    def delete_preset(self, id: int):
        with self._connect() as conn:
            conn.execute("DELETE FROM presets WHERE id=?", (id,))

    # --- range presets ---

    def add_range_preset(self, name: str, min_f: float, max_f: float) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO range_presets (name, min_temp_f, max_temp_f) "
                "VALUES (?, ?, ?)",
                (name, min_f, max_f),
            )
            return int(cur.lastrowid)

    def list_range_presets(self) -> list:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM range_presets ORDER BY name"
            ).fetchall()
            return [dict(r) for r in rows]

    def update_range_preset(self, id: int, name: str, min_f: float, max_f: float):
        with self._connect() as conn:
            conn.execute(
                "UPDATE range_presets SET name=?, min_temp_f=?, max_temp_f=? "
                "WHERE id=?",
                (name, min_f, max_f, id),
            )

    def delete_range_preset(self, id: int):
        with self._connect() as conn:
            conn.execute("DELETE FROM range_presets WHERE id=?", (id,))

    # --- cook sessions ---

    def start_session(self, start_ts: float) -> int:
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO cook_sessions (start_ts) VALUES (?)",
                (start_ts,),
            )
            return int(cur.lastrowid)

    def end_session(self, id: int, end_ts: float):
        with self._connect() as conn:
            conn.execute(
                "UPDATE cook_sessions SET end_ts=? WHERE id=?",
                (end_ts, id),
            )

    def get_active_session(self) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM cook_sessions WHERE end_ts IS NULL "
                "ORDER BY start_ts DESC LIMIT 1"
            ).fetchone()
            return dict(row) if row else None

    def get_session(self, id: int) -> Optional[dict]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM cook_sessions WHERE id=?", (id,)
            ).fetchone()
            return dict(row) if row else None

    def list_sessions(self) -> list:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM cook_sessions ORDER BY start_ts DESC"
            ).fetchall()
            return [dict(r) for r in rows]

    # --- readings ---

    def insert_reading(self, session_id: int, ts: float, probe: int, temp_f: float):
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO readings (session_id, timestamp, probe, temp_f) "
                "VALUES (?, ?, ?, ?)",
                (session_id, ts, probe, temp_f),
            )

    def get_readings(self, session_id: int, probe: int = None) -> list:
        with self._connect() as conn:
            if probe is not None:
                rows = conn.execute(
                    "SELECT * FROM readings "
                    "WHERE session_id=? AND probe=? "
                    "ORDER BY timestamp",
                    (session_id, probe),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM readings "
                    "WHERE session_id=? ORDER BY timestamp",
                    (session_id,),
                ).fetchall()
            return [dict(r) for r in rows]

    # --- probe config ---

    def set_probe_config(self, probe: int, *, mode: str = None,
                         label: str = None, target_temp_f: float = None,
                         min_temp_f: float = None, max_temp_f: float = None,
                         preset_id: int = None, range_preset_id: int = None):
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO probe_config
                    (probe, mode, label, target_temp_f, min_temp_f,
                     max_temp_f, preset_id, range_preset_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(probe) DO UPDATE SET
                    mode=excluded.mode,
                    label=excluded.label,
                    target_temp_f=excluded.target_temp_f,
                    min_temp_f=excluded.min_temp_f,
                    max_temp_f=excluded.max_temp_f,
                    preset_id=excluded.preset_id,
                    range_preset_id=excluded.range_preset_id
            """, (probe, mode, label, target_temp_f, min_temp_f,
                  max_temp_f, preset_id, range_preset_id))

    def get_probe_config(self, probe: int) -> dict:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM probe_config WHERE probe=?", (probe,)
            ).fetchone()
            if row:
                return dict(row)
            return {
                "probe": probe,
                "mode": None,
                "label": None,
                "target_temp_f": None,
                "min_temp_f": None,
                "max_temp_f": None,
                "preset_id": None,
                "range_preset_id": None,
            }

    def get_all_probe_configs(self) -> list:
        configs = []
        for probe in range(1, 5):
            configs.append(self.get_probe_config(probe))
        return configs

    def clear_probe_config(self, probe: int):
        with self._connect() as conn:
            conn.execute("DELETE FROM probe_config WHERE probe=?", (probe,))

    # --- alerts ---

    def insert_alert(self, session_id: int, ts: float, probe: int,
                     alert_type: str, message: str):
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO alert_log "
                "(session_id, timestamp, probe, alert_type, message) "
                "VALUES (?, ?, ?, ?, ?)",
                (session_id, ts, probe, alert_type, message),
            )

    def get_alerts(self, session_id: int) -> list:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM alert_log WHERE session_id=? "
                "ORDER BY timestamp",
                (session_id,),
            ).fetchall()
            return [dict(r) for r in rows]
