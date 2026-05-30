import React, { useState, useMemo } from 'react'
import { ProbeData, Preset, RangePreset, Reading, api } from '../api/client'
import { Card } from './Card'
import { Segmented } from './Segmented'
import { MiniChart } from './MiniChart'

const toDisplay = (f: number, unit: string) => unit === 'C' ? (f - 32) * 5 / 9 : f
const toF = (v: number, unit: string) => unit === 'C' ? v * 9 / 5 + 32 : v
const fmt = (n: number) => n.toFixed(1)

interface Props {
  probe: ProbeData
  unit: string
  presets: Preset[]
  rangePresets: RangePreset[]
  readings: Reading[]
  onConfigChange: () => void
}

function getSetpointStatus(tempF: number | null, targetF: number | null): 'green' | 'amber' | 'red' {
  if (tempF == null || targetF == null) return 'green'
  const diff = targetF - tempF
  if (diff <= 0) return 'red'
  if (diff <= 10) return 'amber'
  return 'green'
}

function getRangeStatus(tempF: number | null, minF: number | null, maxF: number | null): 'green' | 'amber' | 'red' {
  if (tempF == null || minF == null || maxF == null) return 'green'
  if (tempF < minF || tempF > maxF) return 'red'
  if (tempF - minF < 5 || maxF - tempF < 5) return 'amber'
  return 'green'
}

const STATUS_COLORS: Record<string, string> = {
  green: 'var(--leaf)',
  amber: 'var(--honey)',
  red: 'var(--rose)',
}

export const ProbeCard: React.FC<Props> = ({ probe, unit, presets, rangePresets, readings, onConfigChange }) => {
  const config = probe.config
  const mode = config.mode
  const hasConfig = mode !== null
  const isAvailable = probe.available
  const tempF = probe.temp_f

  const [editing, setEditing] = useState(false)
  const [selectedMeat, setSelectedMeat] = useState<string>('')

  const meats = useMemo(() => [...new Set(presets.map(p => p.meat))], [presets])
  const donessOptions = useMemo(
    () => presets.filter(p => p.meat === selectedMeat),
    [presets, selectedMeat],
  )

  const label = config.label || `Probe ${probe.probe}`

  const handleModeChange = async (newMode: string) => {
    try {
      await api.setProbeConfig(probe.probe, {
        mode: newMode,
        label: config.label,
        target_temp_f: newMode === 'setpoint' ? (config.target_temp_f ?? 165) : null,
        min_temp_f: newMode === 'range' ? (config.min_temp_f ?? 225) : null,
        max_temp_f: newMode === 'range' ? (config.max_temp_f ?? 275) : null,
        preset_id: null,
        range_preset_id: null,
      })
      onConfigChange()
    } catch { /* retry on next poll */ }
  }

  const handleSetTarget = async (valDisplay: number) => {
    const valF = toF(valDisplay, unit)
    try {
      await api.setProbeConfig(probe.probe, { target_temp_f: valF })
      onConfigChange()
    } catch { /* */ }
  }

  const handleSetRange = async (field: 'min_temp_f' | 'max_temp_f', valDisplay: number) => {
    const valF = toF(valDisplay, unit)
    try {
      await api.setProbeConfig(probe.probe, { [field]: valF })
      onConfigChange()
    } catch { /* */ }
  }

  const handlePresetSelect = async (presetId: number) => {
    const preset = presets.find(p => p.id === presetId)
    if (!preset) return
    try {
      await api.setProbeConfig(probe.probe, {
        mode: 'setpoint',
        label: `${preset.meat} (${preset.doneness})`,
        target_temp_f: preset.temp_f,
        preset_id: preset.id,
      })
      setEditing(false)
      onConfigChange()
    } catch { /* */ }
  }

  const handleRangePresetSelect = async (rpId: number) => {
    const rp = rangePresets.find(r => r.id === rpId)
    if (!rp) return
    try {
      await api.setProbeConfig(probe.probe, {
        mode: 'range',
        label: rp.name,
        min_temp_f: rp.min_temp_f,
        max_temp_f: rp.max_temp_f,
        range_preset_id: rp.id,
      })
      setEditing(false)
      onConfigChange()
    } catch { /* */ }
  }

  const handleClear = async () => {
    try {
      await api.clearProbeConfig(probe.probe)
      setEditing(false)
      onConfigChange()
    } catch { /* */ }
  }

  const probeReadings = readings.filter(r => r.probe === probe.probe)

  // No config — show live temp with controls to configure
  if (!hasConfig) {
    return (
      <Card style={{ opacity: isAvailable ? 0.55 : 0.35, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)' }}>Probe {probe.probe}</span>
        </div>
        <div className="mono" style={{ fontSize: 32, fontWeight: 700, color: isAvailable ? 'var(--fg-0)' : 'var(--fg-3)' }}>
          {tempF != null ? fmt(toDisplay(tempF, unit)) : '--.-'}&deg;{unit}
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 4, marginBottom: 10 }}>
          {isAvailable ? 'No alarm set' : 'No Probe'}
        </div>
        <Segmented
          options={[
            { value: 'setpoint', label: 'Setpoint' },
            { value: 'range', label: 'Range' },
          ]}
          value=""
          onChange={handleModeChange}
        />
      </Card>
    )
  }

  const status = mode === 'setpoint'
    ? getSetpointStatus(tempF, config.target_temp_f)
    : getRangeStatus(tempF, config.min_temp_f, config.max_temp_f)

  const isCompact = !editing

  return (
    <Card style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: STATUS_COLORS[status],
            boxShadow: `0 0 6px ${STATUS_COLORS[status]}`,
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)' }}>{label}</span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 500 }}>#{probe.probe}</span>
      </div>

      {/* Temperature */}
      <div className="mono" style={{ fontSize: 32, fontWeight: 700, color: 'var(--fg-0)', marginBottom: 4 }}>
        {tempF != null ? `${fmt(toDisplay(tempF, unit))}` : '--.-'}&deg;{unit}
      </div>

      {/* Signal lost label */}
      {!isAvailable && (
        <div style={{
          display: 'inline-block', fontSize: 10, fontWeight: 600, color: 'var(--honey)',
          background: 'var(--honey-soft)', padding: '3px 8px', borderRadius: 6, marginBottom: 8,
        }}>
          Signal Lost
        </div>
      )}

      {/* Compact: just show target/range values */}
      {isCompact && mode === 'setpoint' && config.target_temp_f != null && (
        <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 4 }}>
          Target: <span className="mono" style={{ fontWeight: 600, color: 'var(--fg-1)' }}>{fmt(toDisplay(config.target_temp_f, unit))}&deg;{unit}</span>
        </div>
      )}
      {isCompact && mode === 'range' && config.min_temp_f != null && config.max_temp_f != null && (
        <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 4 }}>
          Range: <span className="mono" style={{ fontWeight: 600, color: 'var(--fg-1)' }}>{fmt(toDisplay(config.min_temp_f, unit))} - {fmt(toDisplay(config.max_temp_f, unit))}&deg;{unit}</span>
        </div>
      )}

      {/* Mini chart */}
      <MiniChart
        readings={probeReadings}
        targetF={mode === 'setpoint' ? config.target_temp_f : undefined}
        minF={mode === 'range' ? config.min_temp_f : undefined}
        maxF={mode === 'range' ? config.max_temp_f : undefined}
        unit={unit}
      />

      {/* Compact: edit button */}
      {isCompact && (
        <button onClick={() => setEditing(true)} className="tap" style={{
          marginTop: 10, width: '100%', height: 30, borderRadius: 10,
          background: 'var(--bg-3)', border: '1px solid var(--line-2)',
          color: 'var(--fg-3)', fontSize: 11, fontWeight: 600,
        }}>
          Edit
        </button>
      )}

      {/* Expanded: full controls */}
      {!isCompact && (
        <>
          {/* Mode toggle */}
          <div style={{ margin: '10px 0' }}>
            <Segmented
              options={[
                { value: 'setpoint', label: 'Setpoint' },
                { value: 'range', label: 'Range' },
              ]}
              value={mode || 'setpoint'}
              onChange={handleModeChange}
            />
          </div>

          {/* Setpoint mode controls */}
          {mode === 'setpoint' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--fg-2)', fontWeight: 500, minWidth: 44 }}>Target</label>
                <input
                  type="number"
                  value={config.target_temp_f != null ? fmt(toDisplay(config.target_temp_f, unit)) : ''}
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v)) handleSetTarget(v)
                  }}
                  style={{ flex: 1, height: 34, fontSize: 13 }}
                />
                <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>&deg;{unit}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={selectedMeat}
                  onChange={e => setSelectedMeat(e.target.value)}
                  style={{
                    flex: 1, height: 34, borderRadius: 10,
                    background: 'var(--bg-3)', border: '1px solid var(--line-2)',
                    color: 'var(--fg-1)', fontSize: 12, padding: '0 8px',
                  }}
                >
                  <option value="">Meat type...</option>
                  {meats.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select
                  value={config.preset_id ?? ''}
                  onChange={e => {
                    const id = parseInt(e.target.value)
                    if (!isNaN(id)) handlePresetSelect(id)
                  }}
                  style={{
                    flex: 1, height: 34, borderRadius: 10,
                    background: 'var(--bg-3)', border: '1px solid var(--line-2)',
                    color: 'var(--fg-1)', fontSize: 12, padding: '0 8px',
                  }}
                >
                  <option value="">Doneness...</option>
                  {donessOptions.map(p => (
                    <option key={p.id} value={p.id}>{p.doneness} ({fmt(toDisplay(p.temp_f, unit))}&deg;)</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Range mode controls */}
          {mode === 'range' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--fg-2)', fontWeight: 500, minWidth: 30 }}>Min</label>
                <input
                  type="number"
                  value={config.min_temp_f != null ? fmt(toDisplay(config.min_temp_f, unit)) : ''}
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v)) handleSetRange('min_temp_f', v)
                  }}
                  style={{ flex: 1, height: 34, fontSize: 13 }}
                />
                <label style={{ fontSize: 11, color: 'var(--fg-2)', fontWeight: 500, minWidth: 30 }}>Max</label>
                <input
                  type="number"
                  value={config.max_temp_f != null ? fmt(toDisplay(config.max_temp_f, unit)) : ''}
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v)) handleSetRange('max_temp_f', v)
                  }}
                  style={{ flex: 1, height: 34, fontSize: 13 }}
                />
                <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>&deg;{unit}</span>
              </div>
              <select
                value={config.range_preset_id ?? ''}
                onChange={e => {
                  const id = parseInt(e.target.value)
                  if (!isNaN(id)) handleRangePresetSelect(id)
                }}
                style={{
                  height: 34, borderRadius: 10,
                  background: 'var(--bg-3)', border: '1px solid var(--line-2)',
                  color: 'var(--fg-1)', fontSize: 12, padding: '0 8px',
                }}
              >
                <option value="">Range preset...</option>
                {rangePresets.map(rp => (
                  <option key={rp.id} value={rp.id}>
                    {rp.name} ({fmt(toDisplay(rp.min_temp_f, unit))}-{fmt(toDisplay(rp.max_temp_f, unit))}&deg;)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Clear / Done buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={handleClear} className="tap" style={{
              flex: 1, height: 32, borderRadius: 10,
              background: 'var(--bg-3)', border: '1px solid var(--line-2)',
              color: 'var(--fg-3)', fontSize: 11, fontWeight: 600,
            }}>
              Clear
            </button>
            <button onClick={() => setEditing(false)} className="tap" style={{
              flex: 1, height: 32, borderRadius: 10,
              background: 'var(--ember)', border: 'none',
              color: 'var(--bg-0)', fontSize: 11, fontWeight: 600,
            }}>
              Done
            </button>
          </div>
        </>
      )}
    </Card>
  )
}
