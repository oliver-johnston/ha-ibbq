import React from 'react'

interface Props {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
  onClick?: () => void
}

export const Card: React.FC<Props> = ({ children, style = {}, className = '', onClick }) => (
  <div onClick={onClick} className={className} style={{
    background: 'var(--bg-2)', border: '1px solid var(--line-1)',
    borderRadius: 'var(--r-lg)', overflow: 'hidden',
    ...style,
  }}>{children}</div>
)
