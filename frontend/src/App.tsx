import React, { useState } from 'react'

type TabId = 'dashboard' | 'presets' | 'settings'

export const App: React.FC = () => {
  const [tab, setTab] = useState<TabId>('dashboard')

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg-0)', color: 'var(--fg-0)',
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {tab === 'dashboard' && <p>Dashboard placeholder</p>}
        {tab === 'presets' && <p>Presets placeholder</p>}
        {tab === 'settings' && <p>Settings placeholder</p>}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-around', padding: '12px 0',
        background: 'var(--bg-1)', borderTop: '1px solid var(--line-1)',
      }}>
        {(['dashboard', 'presets', 'settings'] as TabId[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', color: tab === t ? 'var(--ember)' : 'var(--fg-3)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 12px',
          }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
    </div>
  )
}
