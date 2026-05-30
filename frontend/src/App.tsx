import React, { useState, useEffect, useCallback } from 'react'
import { TabBar, TabId } from './components/TabBar'
import { DashboardScreen } from './screens/Dashboard'
import { PresetsScreen } from './screens/Presets'
import { SettingsScreen } from './screens/Settings'
import { api, DashboardData, Preset, RangePreset, SettingsData } from './api/client'

const POLL_MS = 5000

export const App: React.FC = () => {
  const [tab, setTab] = useState<TabId>('dashboard')

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [presets, setPresets] = useState<Preset[]>([])
  const [rangePresets, setRangePresets] = useState<RangePreset[]>([])
  const [settings, setSettings] = useState<SettingsData | null>(null)

  const unit = settings?.unit || 'F'

  const load = useCallback(async () => {
    try {
      switch (tab) {
        case 'dashboard': {
          const [d, p, rp] = await Promise.all([
            api.dashboard(),
            api.listPresets(),
            api.listRangePresets(),
          ])
          setDashboardData(d)
          setPresets(p)
          setRangePresets(rp)
          break
        }
        case 'presets': {
          const [p, rp] = await Promise.all([
            api.listPresets(),
            api.listRangePresets(),
          ])
          setPresets(p)
          setRangePresets(rp)
          break
        }
        case 'settings': {
          const s = await api.getSettings()
          setSettings(s)
          break
        }
      }
    } catch {
      // silently retry on next poll
    }
  }, [tab])

  // Load settings once on mount to get unit preference
  useEffect(() => {
    api.getSettings().then(s => setSettings(s)).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      <div style={{ flex: 1, paddingBottom: 90, overflowY: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {tab === 'dashboard' && (
            <DashboardScreen
              data={dashboardData}
              presets={presets}
              rangePresets={rangePresets}
              unit={unit}
              onRefresh={load}
            />
          )}
          {tab === 'presets' && (
            <PresetsScreen
              presets={presets}
              rangePresets={rangePresets}
              unit={unit}
              onRefresh={load}
            />
          )}
          {tab === 'settings' && (
            <SettingsScreen data={settings} onRefresh={load} />
          )}
        </div>
      </div>
      <TabBar active={tab} onChange={setTab} />
    </div>
  )
}
