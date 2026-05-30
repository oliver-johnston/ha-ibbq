import React from 'react'
import { SettingsData, api } from '../api/client'
import { Card } from '../components/Card'
import { Segmented } from '../components/Segmented'

interface Props {
  data: SettingsData | null
  onRefresh: () => void
}

const sectionTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
  padding: '12px 16px 6px', color: 'var(--fg-1)',
}

const rowStyle: React.CSSProperties = {
  padding: '11px 16px', borderTop: '1px solid var(--line-1)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
}

const labelStyle: React.CSSProperties = {
  fontSize: 13, color: 'var(--fg-0)', fontWeight: 500,
}

const inputStyle: React.CSSProperties = {
  width: 180, height: 32, padding: '0 10px', borderRadius: 10,
  background: 'var(--bg-3)', border: '1px solid var(--line-1)',
  color: 'var(--fg-1)', fontSize: 12, fontFamily: 'var(--font-mono)',
}

const numberInputStyle: React.CSSProperties = {
  ...inputStyle, width: 90, textAlign: 'right',
}

export const SettingsScreen: React.FC<Props> = ({ data, onRefresh }) => {
  if (!data) {
    return (
      <div style={{ padding: '80px 16px', textAlign: 'center', color: 'var(--fg-3)', fontSize: 13 }}>
        Loading&hellip;
      </div>
    )
  }

  const update = async (patch: Partial<SettingsData>) => {
    try {
      await api.updateSettings(patch)
      onRefresh()
    } catch { /* */ }
  }

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em' }}>Settings</h1>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fg-2)' }}>
        Configure probes, notifications, and system.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* General */}
        <Card>
          <div style={sectionTitle}>General</div>
          <div style={rowStyle}>
            <span style={labelStyle}>Unit</span>
            <Segmented
              options={[
                { value: 'F', label: '°F' },
                { value: 'C', label: '°C' },
              ]}
              value={data.unit}
              onChange={v => update({ unit: v })}
            />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Poll interval (s)</span>
            <input
              type="number"
              defaultValue={data.poll_interval}
              onBlur={e => {
                if (e.target.value !== data.poll_interval) {
                  update({ poll_interval: e.target.value })
                }
              }}
              style={numberInputStyle}
            />
          </div>
        </Card>

        {/* Notifications */}
        <Card>
          <div style={sectionTitle}>Notifications</div>
          <div style={rowStyle}>
            <span style={labelStyle}>Enabled</span>
            <Segmented
              options={[
                { value: 'true', label: 'On' },
                { value: 'false', label: 'Off' },
              ]}
              value={data.notifications_enabled}
              onChange={v => update({ notifications_enabled: v })}
            />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Repeat interval (s)</span>
            <input
              type="number"
              defaultValue={data.notification_repeat_seconds}
              onBlur={e => {
                if (e.target.value !== data.notification_repeat_seconds) {
                  update({ notification_repeat_seconds: e.target.value })
                }
              }}
              style={numberInputStyle}
            />
          </div>
        </Card>

        {/* Discord */}
        <Card>
          <div style={sectionTitle}>Discord</div>
          <div style={rowStyle}>
            <span style={labelStyle}>Notify entity</span>
            <input
              type="text"
              defaultValue={data.discord_notify_entity}
              onBlur={e => {
                if (e.target.value !== data.discord_notify_entity) {
                  update({ discord_notify_entity: e.target.value })
                }
              }}
              style={inputStyle}
            />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Channel ID</span>
            <input
              type="text"
              defaultValue={data.discord_alerts_channel_id}
              onBlur={e => {
                if (e.target.value !== data.discord_alerts_channel_id) {
                  update({ discord_alerts_channel_id: e.target.value })
                }
              }}
              style={inputStyle}
            />
          </div>
        </Card>

        {/* Probes */}
        <Card>
          <div style={sectionTitle}>Probe Entities</div>
          {([1, 2, 3, 4] as const).map(n => {
            const key = `probe_entity_${n}` as keyof SettingsData
            return (
              <div key={n} style={rowStyle}>
                <span style={labelStyle}>Probe {n}</span>
                <input
                  type="text"
                  defaultValue={data[key]}
                  onBlur={e => {
                    if (e.target.value !== data[key]) {
                      update({ [key]: e.target.value })
                    }
                  }}
                  style={inputStyle}
                />
              </div>
            )
          })}
        </Card>

        {/* Signal */}
        <Card>
          <div style={sectionTitle}>Signal</div>
          <div style={rowStyle}>
            <span style={labelStyle}>Lost threshold (s)</span>
            <input
              type="number"
              defaultValue={data.signal_lost_seconds}
              onBlur={e => {
                if (e.target.value !== data.signal_lost_seconds) {
                  update({ signal_lost_seconds: e.target.value })
                }
              }}
              style={numberInputStyle}
            />
          </div>
        </Card>
      </div>

      <div style={{ height: 110 }} />
    </div>
  )
}
