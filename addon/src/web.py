import asyncio
import logging
import time
from pathlib import Path

from aiohttp import web

log = logging.getLogger(__name__)
STATIC_DIR = Path(__file__).parent / "static"

# Default settings with their default values
_SETTING_DEFAULTS = {
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


class WebServer:
    def __init__(self, *, db, poller):
        self._db = db
        self._poller = poller

    # ── Dashboard ────────────────────────────────────────────────

    async def handle_dashboard(self, request):
        probes = self._poller.latest_state()
        configs = self._db.get_all_probe_configs()
        config_map = {c["probe"]: c for c in configs}

        for p in probes:
            p["config"] = config_map.get(p["probe"], {
                "probe": p["probe"],
                "mode": None,
                "label": None,
                "target_temp_f": None,
                "min_temp_f": None,
                "max_temp_f": None,
                "preset_id": None,
                "range_preset_id": None,
            })

        session = self._db.get_active_session()
        return web.json_response({"probes": probes, "session": session})

    # ── Sessions ─────────────────────────────────────────────────

    async def handle_session_start(self, request):
        session_id = self._db.start_session(time.time())
        return web.json_response({"session_id": session_id})

    async def handle_session_end(self, request):
        session = self._db.get_active_session()
        if session is None:
            return web.json_response({"error": "no active session"}, status=400)
        self._db.end_session(session["id"], time.time())
        return web.json_response({"ok": True})

    async def handle_sessions_list(self, request):
        sessions = self._db.list_sessions()
        return web.json_response(sessions)

    async def handle_readings_session(self, request):
        session = self._db.get_active_session()
        if session is None:
            return web.json_response([])
        readings = self._db.get_readings(session["id"])
        return web.json_response(readings)

    async def handle_readings_recent(self, request):
        session = self._db.get_active_session()
        if session is None:
            return web.json_response([])
        minutes = int(request.query.get("minutes", "10"))
        since_ts = time.time() - minutes * 60
        readings = self._db.get_recent_readings(session["id"], since_ts)
        return web.json_response(readings)

    async def handle_session_detail(self, request):
        session_id = int(request.match_info["id"])
        session = self._db.get_session(session_id)
        if session is None:
            return web.json_response({"error": "not found"}, status=404)
        readings = self._db.get_readings(session_id)
        alerts = self._db.get_alerts(session_id)
        return web.json_response({
            "session": session,
            "readings": readings,
            "alerts": alerts,
        })

    # ── Presets ───────────────────────────────────────────────────

    async def handle_presets_list(self, request):
        return web.json_response(self._db.list_presets())

    async def handle_preset_create(self, request):
        body = await request.json()
        pid = self._db.add_preset(
            body["meat"], body["doneness"], body["temp_f"],
        )
        return web.json_response({"ok": True, "id": pid})

    async def handle_preset_update(self, request):
        pid = int(request.match_info["id"])
        body = await request.json()
        self._db.update_preset(pid, body["meat"], body["doneness"], body["temp_f"])
        return web.json_response({"ok": True})

    async def handle_preset_delete(self, request):
        pid = int(request.match_info["id"])
        self._db.delete_preset(pid)
        return web.json_response({"ok": True})

    # ── Range presets ────────────────────────────────────────────

    async def handle_range_presets_list(self, request):
        return web.json_response(self._db.list_range_presets())

    async def handle_range_preset_create(self, request):
        body = await request.json()
        rid = self._db.add_range_preset(
            body["name"], body["min_temp_f"], body["max_temp_f"],
        )
        return web.json_response({"ok": True, "id": rid})

    async def handle_range_preset_update(self, request):
        rid = int(request.match_info["id"])
        body = await request.json()
        self._db.update_range_preset(
            rid, body["name"], body["min_temp_f"], body["max_temp_f"],
        )
        return web.json_response({"ok": True})

    async def handle_range_preset_delete(self, request):
        rid = int(request.match_info["id"])
        self._db.delete_range_preset(rid)
        return web.json_response({"ok": True})

    # ── Probe config ─────────────────────────────────────────────

    async def handle_probe_config_set(self, request):
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

    async def handle_probe_config_clear(self, request):
        probe = int(request.match_info["probe"])
        self._db.clear_probe_config(probe)
        return web.json_response({"ok": True})

    # ── Settings ─────────────────────────────────────────────────

    async def handle_settings_get(self, request):
        result = {}
        for key, default in _SETTING_DEFAULTS.items():
            result[key] = self._db.get_setting(key, default)
        return web.json_response(result)

    async def handle_settings_update(self, request):
        body = await request.json()
        for key, value in body.items():
            self._db.set_setting(key, str(value))
        return web.json_response({"ok": True})

    # ── SPA fallback ─────────────────────────────────────────────

    async def handle_spa_fallback(self, request):
        spa_path = STATIC_DIR / "dist" / "index.html"
        if spa_path.exists():
            return web.FileResponse(spa_path)
        return web.Response(text="SPA not built", status=404)

    # ── Route registration ───────────────────────────────────────

    def attach(self, app: web.Application) -> None:
        # Dashboard
        app.router.add_get("/api/dashboard", self.handle_dashboard)

        # Sessions
        app.router.add_post("/api/session/start", self.handle_session_start)
        app.router.add_post("/api/session/end", self.handle_session_end)
        app.router.add_get("/api/sessions", self.handle_sessions_list)
        app.router.add_get("/api/readings/session", self.handle_readings_session)
        app.router.add_get("/api/readings/recent", self.handle_readings_recent)
        app.router.add_get("/api/sessions/{id}", self.handle_session_detail)

        # Presets
        app.router.add_get("/api/presets", self.handle_presets_list)
        app.router.add_post("/api/presets", self.handle_preset_create)
        app.router.add_put("/api/presets/{id}", self.handle_preset_update)
        app.router.add_delete("/api/presets/{id}", self.handle_preset_delete)

        # Range presets
        app.router.add_get("/api/range-presets", self.handle_range_presets_list)
        app.router.add_post("/api/range-presets", self.handle_range_preset_create)
        app.router.add_put("/api/range-presets/{id}", self.handle_range_preset_update)
        app.router.add_delete("/api/range-presets/{id}", self.handle_range_preset_delete)

        # Probe config
        app.router.add_post("/api/probe/{probe}/config", self.handle_probe_config_set)
        app.router.add_delete("/api/probe/{probe}/config", self.handle_probe_config_clear)

        # Settings
        app.router.add_get("/api/settings", self.handle_settings_get)
        app.router.add_post("/api/settings", self.handle_settings_update)

        # Static files (if dist exists)
        dist_dir = STATIC_DIR / "dist"
        if dist_dir.exists():
            app.router.add_static("/assets/", path=str(dist_dir / "assets"))

        # SPA fallback for all other routes
        app.router.add_get("/{path:.*}", self.handle_spa_fallback)

    async def run(self, port: int = 8099):
        app = web.Application()
        self.attach(app)
        runner = web.AppRunner(app)
        await runner.setup()
        await web.TCPSite(runner, "0.0.0.0", port).start()
        log.info("Web UI on port %d", port)
        while True:
            await asyncio.sleep(3600)
