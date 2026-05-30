const BASE = './api'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) {
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

function get<T>(path: string): Promise<T> { return request<T>('GET', path) }
function post<T>(path: string, body?: unknown): Promise<T> { return request<T>('POST', path, body) }
function put<T>(path: string, body?: unknown): Promise<T> { return request<T>('PUT', path, body) }
function del<T>(path: string): Promise<T> { return request<T>('DELETE', path) }

// ── Interfaces ───────────────────────────────────────────

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

// ── API ──────────────────────────────────────────────────

export const api = {
  dashboard: () => get<DashboardData>('/dashboard'),

  startSession: () => post<{ ok: boolean; session_id: number }>('/session/start'),
  endSession: () => post<{ ok: boolean }>('/session/end'),
  listSessions: () => get<Session[]>('/sessions'),
  getSession: (id: number) =>
    get<{ session: Session; readings: Reading[]; alerts: Alert[] }>(`/sessions/${id}`),

  listPresets: () => get<Preset[]>('/presets'),
  addPreset: (p: Omit<Preset, 'id'>) => post<{ ok: boolean; id: number }>('/presets', p),
  updatePreset: (id: number, p: Omit<Preset, 'id'>) => put<{ ok: boolean }>(`/presets/${id}`, p),
  deletePreset: (id: number) => del<{ ok: boolean }>(`/presets/${id}`),

  listRangePresets: () => get<RangePreset[]>('/range-presets'),
  addRangePreset: (p: Omit<RangePreset, 'id'>) =>
    post<{ ok: boolean; id: number }>('/range-presets', p),
  updateRangePreset: (id: number, p: Omit<RangePreset, 'id'>) =>
    put<{ ok: boolean }>(`/range-presets/${id}`, p),
  deleteRangePreset: (id: number) => del<{ ok: boolean }>(`/range-presets/${id}`),

  setProbeConfig: (probe: number, config: Partial<ProbeConfig>) =>
    post<{ ok: boolean }>(`/probe/${probe}/config`, config),
  clearProbeConfig: (probe: number) => del<{ ok: boolean }>(`/probe/${probe}/config`),

  getSettings: () => get<SettingsData>('/settings'),
  updateSettings: (s: Partial<SettingsData>) => post<{ ok: boolean }>('/settings', s),
}
