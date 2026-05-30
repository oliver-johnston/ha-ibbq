import React, { useState, useEffect, useRef } from 'react'
import { Session, api } from '../api/client'

interface Props {
  session: Session | null
  onRefresh: () => void
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const SessionBar: React.FC<Props> = ({ session, onRefresh }) => {
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (session && !session.end_ts) {
      const update = () => {
        const now = Date.now() / 1000
        setElapsed(Math.max(0, now - session.start_ts))
      }
      update()
      timerRef.current = setInterval(update, 1000)
    } else {
      setElapsed(0)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [session])

  const handleStart = async () => {
    try {
      await api.startSession()
      onRefresh()
    } catch { /* */ }
  }

  const handleEnd = async () => {
    try {
      await api.endSession()
      onRefresh()
    } catch { /* */ }
  }

  const isActive = session && !session.end_ts

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', background: 'var(--bg-2)',
      borderRadius: 'var(--r-md)', marginBottom: 12,
    }}>
      {isActive ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: 'var(--ember)',
              boxShadow: '0 0 8px var(--ember)',
              animation: 'fadeIn 1s ease infinite alternate',
            }} />
            <span className="mono" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>
              {formatElapsed(elapsed)}
            </span>
          </div>
          <button onClick={handleEnd} className="tap" style={{
            height: 34, padding: '0 16px', borderRadius: 10,
            background: 'var(--rose-soft)', border: '1px solid var(--rose-line)',
            color: 'var(--rose)', fontSize: 12, fontWeight: 600,
          }}>
            End Cook
          </button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 13, color: 'var(--fg-2)', fontWeight: 500 }}>No active cook</span>
          <button onClick={handleStart} className="tap" style={{
            height: 34, padding: '0 16px', borderRadius: 10,
            background: 'linear-gradient(180deg, var(--ember), var(--ember-deep))',
            border: 'none', color: '#fff', fontSize: 12, fontWeight: 600,
            boxShadow: '0 4px 12px -4px rgba(255,122,58,0.5)',
          }}>
            Start Cook
          </button>
        </>
      )}
    </div>
  )
}
