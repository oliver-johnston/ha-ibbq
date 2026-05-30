# Claude instructions for this repo

## Version bumps

Every change that ships must bump the add-on version in `addon/config.yaml`.

- Feature additions or user-visible UI changes → minor bump (e.g. 0.1.0 → 0.2.0).
- Bug fixes or internal refactors with no user-visible change → patch bump (e.g. 0.2.0 → 0.2.1).
- Breaking changes to HA integration / config options → major bump.

The bump can ride along with the change that needs it — it doesn't need a separate commit.

## Running tests

```bash
cd addon && python3 -m pytest ../tests/ -v
```

## Building the frontend

```bash
cd frontend && npm ci && npm run build
```

Output goes to `addon/src/static/dist/`. The web server serves this directory.

## Architecture

- **Backend**: Python 3.12, aiohttp, SQLite. Two async loops: poller (reads probe temps, evaluates alerts) and web server (REST API + SPA).
- **Frontend**: React 18 + TypeScript + Vite. Three tabs: Dashboard, Presets, Settings.
- **Entry point**: `addon/src/main.py` → `python -m src.main`
- **Database**: `/data/bbq.db` (SQLite) — settings, presets, sessions, readings, alerts, probe config.
- **Notifications**: Discord via HA `notify.robeson_chat` service.
- **Probes**: 4x Inkbird iBBQ-4T via LocalTuya (sensor.ibbq_4t_probe_1..4), raw values scaled by 0.01.
