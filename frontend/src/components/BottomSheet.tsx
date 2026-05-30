import React, { useEffect } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export const BottomSheet: React.FC<Props> = ({ open, onClose, title, children }) => {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 100, animation: 'fadeIn 150ms ease',
      }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-1)', borderRadius: '20px 20px 0 0',
        padding: '20px 16px', paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        zIndex: 101, maxHeight: '85vh', overflowY: 'auto',
        animation: 'slideUp 200ms ease',
      }}>
        <div style={{
          width: 36, height: 4, borderRadius: 2, background: 'var(--line-2)',
          margin: '0 auto 16px',
        }} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20,
        }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</h3>
          <button onClick={onClose} className="tap" style={{
            width: 30, height: 30, borderRadius: 99, background: 'var(--bg-3)',
            border: '1px solid var(--line-1)', color: 'var(--fg-2)',
            fontSize: 16, display: 'grid', placeItems: 'center',
          }}>&times;</button>
        </div>
        {children}
      </div>
    </>
  )
}
