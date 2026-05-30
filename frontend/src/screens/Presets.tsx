import React, { useState } from 'react'
import { Preset, RangePreset, api } from '../api/client'
import { Card } from '../components/Card'
import { BottomSheet } from '../components/BottomSheet'

const toDisplay = (f: number, unit: string) => unit === 'C' ? (f - 32) * 5 / 9 : f
const toF = (v: number, unit: string) => unit === 'C' ? v * 9 / 5 + 32 : v
const fmt = (n: number) => n.toFixed(1)

interface Props {
  presets: Preset[] | null
  rangePresets: RangePreset[] | null
  unit: string
  onRefresh: () => void
}

// Shared button styles
const actionBtn = (color: string, bg: string, border: string): React.CSSProperties => ({
  height: 28, padding: '0 10px', borderRadius: 8,
  background: bg, border: `1px solid ${border}`,
  color, fontSize: 11, fontWeight: 600, cursor: 'pointer',
})

const saveBtn: React.CSSProperties = {
  width: '100%', height: 44, borderRadius: 12, marginTop: 16,
  background: 'linear-gradient(180deg, var(--ember), var(--ember-deep))',
  border: 'none', color: '#fff', fontSize: 14, fontWeight: 600,
  boxShadow: '0 4px 12px -4px rgba(255,122,58,0.5)',
  cursor: 'pointer',
}

const fieldLabel: React.CSSProperties = {
  fontSize: 12, color: 'var(--fg-2)', fontWeight: 500, marginBottom: 4,
}

export const PresetsScreen: React.FC<Props> = ({ presets, rangePresets, unit, onRefresh }) => {
  // Meat preset sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null)
  const [meat, setMeat] = useState('')
  const [doneness, setDoneness] = useState('')
  const [tempVal, setTempVal] = useState('')

  // Range preset sheet state
  const [rangeSheetOpen, setRangeSheetOpen] = useState(false)
  const [editingRange, setEditingRange] = useState<RangePreset | null>(null)
  const [rangeName, setRangeName] = useState('')
  const [rangeMin, setRangeMin] = useState('')
  const [rangeMax, setRangeMax] = useState('')

  const openAddPreset = () => {
    setEditingPreset(null)
    setMeat('')
    setDoneness('')
    setTempVal('')
    setSheetOpen(true)
  }

  const openEditPreset = (p: Preset) => {
    setEditingPreset(p)
    setMeat(p.meat)
    setDoneness(p.doneness)
    setTempVal(fmt(toDisplay(p.temp_f, unit)))
    setSheetOpen(true)
  }

  const handleSavePreset = async () => {
    const tempF = toF(parseFloat(tempVal) || 0, unit)
    try {
      if (editingPreset) {
        await api.updatePreset(editingPreset.id, { meat, doneness, temp_f: tempF })
      } else {
        await api.addPreset({ meat, doneness, temp_f: tempF })
      }
      setSheetOpen(false)
      onRefresh()
    } catch { /* */ }
  }

  const handleDeletePreset = async (id: number) => {
    try {
      await api.deletePreset(id)
      onRefresh()
    } catch { /* */ }
  }

  const openAddRange = () => {
    setEditingRange(null)
    setRangeName('')
    setRangeMin('')
    setRangeMax('')
    setRangeSheetOpen(true)
  }

  const openEditRange = (rp: RangePreset) => {
    setEditingRange(rp)
    setRangeName(rp.name)
    setRangeMin(fmt(toDisplay(rp.min_temp_f, unit)))
    setRangeMax(fmt(toDisplay(rp.max_temp_f, unit)))
    setRangeSheetOpen(true)
  }

  const handleSaveRange = async () => {
    const minF = toF(parseFloat(rangeMin) || 0, unit)
    const maxF = toF(parseFloat(rangeMax) || 0, unit)
    try {
      if (editingRange) {
        await api.updateRangePreset(editingRange.id, { name: rangeName, min_temp_f: minF, max_temp_f: maxF })
      } else {
        await api.addRangePreset({ name: rangeName, min_temp_f: minF, max_temp_f: maxF })
      }
      setRangeSheetOpen(false)
      onRefresh()
    } catch { /* */ }
  }

  const handleDeleteRange = async (id: number) => {
    try {
      await api.deleteRangePreset(id)
      onRefresh()
    } catch { /* */ }
  }

  if (!presets || !rangePresets) {
    return (
      <div style={{ padding: '80px 16px', textAlign: 'center', color: 'var(--fg-3)', fontSize: 13 }}>
        Loading&hellip;
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em' }}>Presets</h1>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fg-2)' }}>
        Manage temperature targets and ranges.
      </p>

      {/* Meat & Doneness Presets */}
      <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 10, color: 'var(--fg-1)' }}>
        Meat &amp; Doneness
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {presets.map(p => (
          <Card key={p.id} style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-0)' }}>{p.meat}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>
                  {p.doneness} &mdash; {fmt(toDisplay(p.temp_f, unit))}&deg;{unit}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="tap" onClick={() => openEditPreset(p)}
                  style={actionBtn('var(--ice)', 'var(--ice-soft)', 'var(--ice-line)')}>
                  Edit
                </button>
                <button className="tap" onClick={() => handleDeletePreset(p.id)}
                  style={actionBtn('var(--rose)', 'var(--rose-soft)', 'var(--rose-line)')}>
                  Delete
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <button className="tap" onClick={openAddPreset} style={{
        width: '100%', height: 40, borderRadius: 12,
        background: 'var(--bg-3)', border: '1px solid var(--line-2)',
        color: 'var(--fg-1)', fontSize: 13, fontWeight: 600, marginBottom: 28,
      }}>
        + Add Preset
      </button>

      {/* Range Presets */}
      <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 10, color: 'var(--fg-1)' }}>
        Range Presets
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {rangePresets.map(rp => (
          <Card key={rp.id} style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-0)' }}>{rp.name}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-2)', marginTop: 2 }}>
                  {fmt(toDisplay(rp.min_temp_f, unit))} &ndash; {fmt(toDisplay(rp.max_temp_f, unit))}&deg;{unit}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="tap" onClick={() => openEditRange(rp)}
                  style={actionBtn('var(--ice)', 'var(--ice-soft)', 'var(--ice-line)')}>
                  Edit
                </button>
                <button className="tap" onClick={() => handleDeleteRange(rp.id)}
                  style={actionBtn('var(--rose)', 'var(--rose-soft)', 'var(--rose-line)')}>
                  Delete
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <button className="tap" onClick={openAddRange} style={{
        width: '100%', height: 40, borderRadius: 12,
        background: 'var(--bg-3)', border: '1px solid var(--line-2)',
        color: 'var(--fg-1)', fontSize: 13, fontWeight: 600,
      }}>
        + Add Range Preset
      </button>

      <div style={{ height: 110 }} />

      {/* Meat Preset Bottom Sheet */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editingPreset ? 'Edit Preset' : 'Add Preset'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={fieldLabel}>Meat type</div>
            <input type="text" value={meat} onChange={e => setMeat(e.target.value)} placeholder="e.g. Brisket" />
          </div>
          <div>
            <div style={fieldLabel}>Doneness</div>
            <input type="text" value={doneness} onChange={e => setDoneness(e.target.value)} placeholder="e.g. Medium" />
          </div>
          <div>
            <div style={fieldLabel}>Target temp (&deg;{unit})</div>
            <input type="number" value={tempVal} onChange={e => setTempVal(e.target.value)} placeholder="165" />
          </div>
          <button className="tap" onClick={handleSavePreset} style={saveBtn}>
            {editingPreset ? 'Save Changes' : 'Add Preset'}
          </button>
        </div>
      </BottomSheet>

      {/* Range Preset Bottom Sheet */}
      <BottomSheet open={rangeSheetOpen} onClose={() => setRangeSheetOpen(false)} title={editingRange ? 'Edit Range' : 'Add Range Preset'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={fieldLabel}>Name</div>
            <input type="text" value={rangeName} onChange={e => setRangeName(e.target.value)} placeholder="e.g. Low and Slow" />
          </div>
          <div>
            <div style={fieldLabel}>Min temp (&deg;{unit})</div>
            <input type="number" value={rangeMin} onChange={e => setRangeMin(e.target.value)} placeholder="225" />
          </div>
          <div>
            <div style={fieldLabel}>Max temp (&deg;{unit})</div>
            <input type="number" value={rangeMax} onChange={e => setRangeMax(e.target.value)} placeholder="275" />
          </div>
          <button className="tap" onClick={handleSaveRange} style={saveBtn}>
            {editingRange ? 'Save Changes' : 'Add Range Preset'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
