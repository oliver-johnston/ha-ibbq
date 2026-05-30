import asyncio
import copy
import logging
import time

log = logging.getLogger(__name__)


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
        self._last_good_ts: dict[int, float] = {}  # probe -> last time we got a valid reading
        self._last_alert_ts: dict[int, float] = {}  # probe -> last time we sent an alert
        self._signal_lost_sent: set[int] = set()

    def latest_state(self) -> list[dict]:
        """Return a copy of current probe state (for web API)."""
        return copy.deepcopy(self._probe_state)

    async def poll(self):
        """Called every cycle: read temps, log readings, evaluate alerts."""
        now = time.time()

        # 1. Get current temperatures from HA
        results = await self._ha.get_probe_temps(self._entity_ids)

        # 2. Update probe state
        for i, result in enumerate(results):
            if i >= 4:
                break
            probe = i + 1
            self._probe_state[i]["temp_f"] = result.get("temp_f")
            self._probe_state[i]["last_updated"] = result.get("last_updated")
            self._probe_state[i]["available"] = result.get("available", False)

            # 3. Track last good reading time
            if result.get("available") and result.get("temp_f") is not None:
                self._last_good_ts[probe] = now

        # 4. If there's an active cook session, insert readings and evaluate alerts
        session = self._db.get_active_session()
        if session is None:
            return

        session_id = session["id"]

        # Insert readings for valid probes
        for i, result in enumerate(results):
            if i >= 4:
                break
            probe = i + 1
            if result.get("available") and result.get("temp_f") is not None:
                self._db.insert_reading(session_id, now, probe, result["temp_f"])

        # Evaluate alerts
        await self._evaluate_alerts(session_id, now)

    async def _evaluate_alerts(self, session_id: int, now: float):
        """Check each probe config and fire alerts as needed."""
        repeat_sec = self._db.get_setting_int("notification_repeat_seconds", 300)
        signal_lost_sec = self._db.get_setting_int("signal_lost_seconds", 300)
        notifications_enabled = self._db.get_setting("notifications_enabled", "true")

        if notifications_enabled.lower() != "true":
            return

        for probe in range(1, 5):
            config = self._db.get_probe_config(probe)
            mode = config.get("mode")

            if mode is None:
                # No config: clear alert state for this probe
                self._last_alert_ts.pop(probe, None)
                self._signal_lost_sent.discard(probe)
                continue

            temp_f = self._probe_state[probe - 1].get("temp_f")
            available = self._probe_state[probe - 1].get("available", False)
            label = config.get("label") or f"Probe {probe}"

            # Signal lost check: probe has config but no valid reading
            if not available or temp_f is None:
                last_good = self._last_good_ts.get(probe)
                # If we never had a good reading, use 0 so elapsed is large
                if last_good is None:
                    elapsed = float("inf")
                else:
                    elapsed = now - last_good

                if elapsed >= signal_lost_sec and probe not in self._signal_lost_sent:
                    if self._can_alert(probe, now, repeat_sec):
                        msg = f"Signal lost: {label} (probe {probe}) - no valid reading"
                        await self._notifier.send(msg)
                        self._db.insert_alert(
                            session_id, now, probe, "signal_lost", msg
                        )
                        self._last_alert_ts[probe] = now
                        self._signal_lost_sent.add(probe)
                continue

            # Clear signal lost state when we have a valid reading again
            self._signal_lost_sent.discard(probe)

            if mode == "setpoint":
                target = config.get("target_temp_f")
                if target is not None and temp_f >= target:
                    if self._can_alert(probe, now, repeat_sec):
                        msg = (
                            f"Setpoint reached: {label} (probe {probe}) "
                            f"is at {temp_f:.1f}°F (target {target:.1f}°F)"
                        )
                        await self._notifier.send(msg)
                        self._db.insert_alert(
                            session_id, now, probe, "setpoint", msg
                        )
                        self._last_alert_ts[probe] = now

            elif mode == "range":
                min_temp = config.get("min_temp_f")
                max_temp = config.get("max_temp_f")
                breach = False
                direction = ""

                if min_temp is not None and temp_f < min_temp:
                    breach = True
                    direction = f"below min ({min_temp:.1f}°F)"
                elif max_temp is not None and temp_f > max_temp:
                    breach = True
                    direction = f"above max ({max_temp:.1f}°F)"

                if breach and self._can_alert(probe, now, repeat_sec):
                    msg = (
                        f"Range breach: {label} (probe {probe}) "
                        f"is at {temp_f:.1f}°F - {direction}"
                    )
                    await self._notifier.send(msg)
                    self._db.insert_alert(
                        session_id, now, probe, "range", msg
                    )
                    self._last_alert_ts[probe] = now

    def _can_alert(self, probe: int, now: float, repeat_sec: int) -> bool:
        """Returns True if no previous alert or enough time has passed."""
        last = self._last_alert_ts.get(probe)
        if last is None:
            return True
        return (now - last) >= repeat_sec

    async def run_loop(self, interval: int = 5):
        """Run forever, polling every `interval` seconds."""
        while True:
            try:
                await self.poll()
            except Exception:
                log.exception("Error in poll cycle")
            await asyncio.sleep(interval)
