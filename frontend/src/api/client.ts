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
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${method} ${path} failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<T>
}

function get<T>(path: string): Promise<T> {
  return request<T>('GET', path)
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body)
}

function put<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PUT', path, body)
}

function del<T>(path: string): Promise<T> {
  return request<T>('DELETE', path)
}

// ── Interfaces ───────────────────────────────────────────

export interface ProbeConfig {
  probe: number
  mode: 'target' | 'range' | 'off'
  label: string
  target_temp_f: number | null
  min_temp_f: number | null
  max_temp_f: number | null
  preset_id: string | null
  range_preset_id: string | null
}

export interface ProbeData {
  probe: number
  temp_f: number | null
  last_updated: string | null
  available: boolean
  config: ProbeConfig
}

export interface Session {
  id: string
  start_ts: string
  end_ts: string | null
}

export interface DashboardData {
  probes: ProbeData[]
  session: Session | null
}

export interface Preset {
  id: string
  meat: string
  doneness: string
  temp_f: number
}

export interface RangePreset {
  id: string
  name: string
  min_temp_f: number
  max_temp_f: number
}

export interface Reading {
  id: string
  session_id: string
  timestamp: string
  probe: number
  temp_f: number
}

export interface Alert {
  id: string
  session_id: string
  timestamp: string
  probe: number
  alert_type: string
  message: string
}

export interface SettingsData {
  unit: string
  poll_interval: number
  notification_repeat_seconds: number
  notifications_enabled: boolean
  signal_lost_seconds: number
  discord_notify_entity: string
  discord_alerts_channel_id: string
  probe_entity_1: string
  probe_entity_2: string
  probe_entity_3: string
  probe_entity_4: string
}

// ── API client ───────────────────────────────────────────

export const api = {
  // Dashboard
  dashboard: () => get<DashboardData>('/dashboard'),

  // Sessions
  sessions: {
    list: () => get<Session[]>('/sessions'),
    start: () => post<Session>('/sessions/start'),
    stop: () => post<Session>('/sessions/stop'),
  },

  // Presets
  presets: {
    list: () => get<Preset[]>('/presets'),
    create: (p: Omit<Preset, 'id'>) => post<Preset>('/presets', p),
    update: (id: string, p: Omit<Preset, 'id'>) => put<Preset>(`/presets/${id}`, p),
    delete: (id: string) => del<void>(`/presets/${id}`),
  },

  // Range presets
  rangePresets: {
    list: () => get<RangePreset[]>('/range-presets'),
    create: (p: Omit<RangePreset, 'id'>) => post<RangePreset>('/range-presets', p),
    update: (id: string, p: Omit<RangePreset, 'id'>) => put<RangePreset>(`/range-presets/${id}`, p),
    delete: (id: string) => del<void>(`/range-presets/${id}`),
  },

  // Probe config
  probeConfig: {
    update: (probe: number, config: Partial<ProbeConfig>) =>
      put<ProbeConfig>(`/probes/${probe}/config`, config),
  },

  // Settings
  settings: {
    get: () => get<SettingsData>('/settings'),
    update: (s: Partial<SettingsData>) => put<SettingsData>('/settings', s),
  },
}
