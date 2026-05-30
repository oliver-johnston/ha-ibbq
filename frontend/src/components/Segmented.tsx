import React from 'react'

interface Props {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}

export const Segmented: React.FC<Props> = ({ options, value, onChange }) => (
  <div style={{
    display: 'inline-flex', padding: 3, background: 'var(--bg-3)',
    borderRadius: 999, border: '1px solid var(--line-1)', gap: 2,
  }}>
    {options.map(o => {
      const active = o.value === value
      return (
        <button key={o.value} onClick={() => onChange(o.value)} className="tap" style={{
          padding: '7px 14px',
          borderRadius: 999,
          background: active ? 'var(--bg-4)' : 'transparent',
          color: active ? 'var(--fg-0)' : 'var(--fg-2)',
          border: 'none', fontSize: 12, fontWeight: 600,
          letterSpacing: '-0.005em',
          transition: 'all 140ms ease',
          boxShadow: active ? '0 1px 0 rgba(255,255,255,0.04), 0 2px 6px rgba(0,0,0,0.3)' : 'none',
        }}>
          {o.label}
        </button>
      )
    })}
  </div>
)
