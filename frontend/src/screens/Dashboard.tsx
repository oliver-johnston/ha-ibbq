import React, { useState, useEffect } from 'react'
import { DashboardData, Preset, RangePreset, Reading, Session, api, Alert } from '../api/client'
import { SessionBar } from '../components/SessionBar'
import { ProbeCard } from '../components/ProbeCard'
import { Card } from '../components/Card'

const toDisplay = (f: number, unit: string) => unit === 'C' ? (f - 32) * 5 / 9 : f
const fmt = (n: number) => n.toFixed(1)

interface Props {
  data: DashboardData | null
  presets: Preset[]
  rangePresets: RangePreset[]
  readings: Reading[]
  unit: string
  onRefresh: () => void
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString()
}

function formatDuration(start: number, end: number | null): string {
  const seconds = (end ?? Date.now() / 1000) - start
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

interface SessionDetail {
  id: number
  alerts: Alert[]
  minTemp: Record<number, number>
  maxTemp: Record<number, number>
}

export const DashboardScreen: React.FC<Props> = ({ data, presets, rangePresets, readings, unit, onRefresh }) => {
  const [sessions, setSessions] = useState<Session[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [details, setDetails] = useState<Record<number, SessionDetail>>({})

  useEffect(() => {
    api.listSessions().then(r => setSessions(r)).catch(() => {})
  }, [data])

  const handleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!details[id]) {
      try {
        const d = await api.getSession(id)
        const minTemp: Record<number, number> = {}
        const maxTemp: Record<number, number> = {}
        for (const r of d.readings) {
          if (minTemp[r.probe] === undefined || r.temp_f < minTemp[r.probe]) minTemp[r.probe] = r.temp_f
          if (maxTemp[r.probe] === undefined || r.temp_f > maxTemp[r.probe]) maxTemp[r.probe] = r.temp_f
        }
        setDetails(prev => ({ ...prev, [id]: { id, alerts: d.alerts, minTemp, maxTemp } }))
      } catch { /* */ }
    }
  }

  if (!data) {
    return (
      <div style={{ padding: '80px 16px', textAlign: 'center', color: 'var(--fg-3)', fontSize: 13 }}>
        Loading&hellip;
      </div>
    )
  }

  // Filter to past sessions (not the current active one)
  const pastSessions = sessions.filter(s => s.end_ts !== null)

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em' }}>
        BBQ Monitor
      </h1>

      <SessionBar session={data.session} onRefresh={onRefresh} />

      <div className="screen-grid">
        {data.probes.map(p => (
          <ProbeCard
            key={p.probe}
            probe={p}
            unit={unit}
            presets={presets}
            rangePresets={rangePresets}
            readings={readings}
            onConfigChange={onRefresh}
          />
        ))}
      </div>

      {/* Cook History */}
      {pastSessions.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 10, color: 'var(--fg-1)' }}>
            Cook History
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pastSessions.map(s => {
              const isExpanded = expandedId === s.id
              const detail = details[s.id]
              return (
                <Card key={s.id} onClick={() => handleExpand(s.id)} style={{ cursor: 'pointer' }}>
                  <div style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-0)' }}>
                        {formatDate(s.start_ts)}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>
                        {formatDuration(s.start_ts, s.end_ts)}
                      </span>
                    </div>
                    {isExpanded && detail && (
                      <div style={{ marginTop: 10, borderTop: '1px solid var(--line-1)', paddingTop: 10 }}>
                        {Object.keys(detail.minTemp).length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600, marginBottom: 4 }}>Temp Ranges</div>
                            {Object.keys(detail.minTemp).map(p => {
                              const probeNum = parseInt(p)
                              return (
                                <div key={p} style={{ fontSize: 12, color: 'var(--fg-1)', marginBottom: 2 }}>
                                  Probe {probeNum}: {fmt(toDisplay(detail.minTemp[probeNum], unit))} - {fmt(toDisplay(detail.maxTemp[probeNum], unit))}&deg;{unit}
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {detail.alerts.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600, marginBottom: 4 }}>Alerts</div>
                            {detail.alerts.map(a => (
                              <div key={a.id} style={{ fontSize: 12, color: 'var(--rose)', marginBottom: 2 }}>
                                {a.message}
                              </div>
                            ))}
                          </div>
                        )}
                        {Object.keys(detail.minTemp).length === 0 && detail.alerts.length === 0 && (
                          <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>No readings recorded.</div>
                        )}
                      </div>
                    )}
                    {isExpanded && !detail && (
                      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--fg-3)' }}>Loading...</div>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ height: 110 }} />
    </div>
  )
}
