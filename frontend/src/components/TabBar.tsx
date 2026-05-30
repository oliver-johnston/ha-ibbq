import React from 'react'

export type TabId = 'dashboard' | 'presets' | 'settings'

const FlameIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2c.5 3.5 4 6.5 4 10a4 4 0 0 1-8 0c0-3.5 3.5-6.5 4-10z" />
  </svg>
)

const ListIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
)

const GearIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const TABS: { id: TabId; label: string; Icon: React.FC<{ color: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: FlameIcon },
  { id: 'presets',   label: 'Presets',   Icon: ListIcon },
  { id: 'settings',  label: 'Settings',  Icon: GearIcon },
]

interface Props {
  active: TabId
  onChange: (tab: TabId) => void
}

export const TabBar: React.FC<Props> = ({ active, onChange }) => (
  <div style={{
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
    padding: '8px 14px 26px',
    background: 'linear-gradient(180deg, rgba(14,14,16,0) 0%, rgba(14,14,16,0.85) 30%, rgba(14,14,16,1) 60%)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  }}>
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${TABS.length}, 1fr)`, gap: 2,
      background: 'var(--bg-2)', border: '1px solid var(--line-2)',
      borderRadius: 22, padding: 6,
    }}>
      {TABS.map(t => {
        const isActive = t.id === active
        return (
          <button key={t.id} onClick={() => onChange(t.id)} className="tap" style={{
            padding: '8px 4px 6px', borderRadius: 16,
            background: isActive ? 'var(--bg-4)' : 'transparent',
            border: 'none', color: isActive ? 'var(--ember)' : 'var(--fg-2)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            transition: 'all 140ms ease',
          }}>
            <t.Icon color={isActive ? 'var(--ember)' : 'var(--fg-2)'} />
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '-0.005em' }}>{t.label}</span>
          </button>
        )
      })}
    </div>
  </div>
)
