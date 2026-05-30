import React, { useState, useMemo, useCallback, useRef } from 'react'
import { Reading } from '../api/client'

const W = 340
const H = 120
const PAD = { l: 36, r: 12, t: 12, b: 24 }

interface Props {
  readings: Reading[]
  targetF?: number | null
  minF?: number | null
  maxF?: number | null
  unit: string
}

const toDisplay = (f: number, unit: string) => unit === 'C' ? (f - 32) * 5 / 9 : f
const fmt = (n: number) => n.toFixed(1)

function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  const norm = rough / pow
  if (norm <= 1.5) return pow
  if (norm <= 3.5) return 2 * pow
  if (norm <= 7.5) return 5 * pow
  return 10 * pow
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

export const MiniChart: React.FC<Props> = ({ readings, targetF, minF, maxF, unit }) => {
  if (readings.length < 2) return null

  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<{ idx: number; clientX: number; clientY: number } | null>(null)

  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const displayReadings = useMemo(
    () => readings.map(r => ({ ts: r.timestamp, val: toDisplay(r.temp_f, unit) })),
    [readings, unit],
  )

  const refLines = useMemo(() => {
    const lines: number[] = []
    if (targetF != null) lines.push(toDisplay(targetF, unit))
    if (minF != null) lines.push(toDisplay(minF, unit))
    if (maxF != null) lines.push(toDisplay(maxF, unit))
    return lines
  }, [targetF, minF, maxF, unit])

  const temps = displayReadings.map(r => r.val)
  const allVals = [...temps, ...refLines]
  let yLo = Math.min(...allVals)
  let yHi = Math.max(...allVals)
  if (yHi - yLo < 10) {
    const mid = (yHi + yLo) / 2
    yLo = mid - 5
    yHi = mid + 5
  }
  const yMargin = (yHi - yLo) * 0.1
  yLo -= yMargin
  yHi += yMargin

  const tMin = displayReadings[0].ts
  const tMax = displayReadings[displayReadings.length - 1].ts
  const tSpan = Math.max(tMax - tMin, 60)

  const x = (t: number) => PAD.l + ((t - tMin) / tSpan) * innerW
  const y = (v: number) => PAD.t + (1 - (v - yLo) / (yHi - yLo)) * innerH

  const linePath = displayReadings
    .map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(r.ts).toFixed(1)} ${y(r.val).toFixed(1)}`)
    .join(' ')

  // Y-axis ticks
  const yStep = niceStep(yHi - yLo, 4)
  const yTicks: number[] = []
  for (let v = Math.ceil(yLo / yStep) * yStep; v <= yHi; v += yStep) {
    yTicks.push(Math.round(v * 10) / 10)
  }

  // X-axis ticks
  const spanMin = tSpan / 60
  const xInterval = spanMin <= 5 ? 60 : spanMin <= 15 ? 120 : spanMin <= 30 ? 300 : 600
  const xTicks: { t: number; l: string }[] = []
  const firstTick = Math.ceil(tMin / xInterval) * xInterval
  for (let t = firstTick; t <= tMax; t += xInterval) {
    xTicks.push({ t, l: formatTime(t) })
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || displayReadings.length === 0) return
    const rect = svg.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const t = tMin + ((svgX - PAD.l) / innerW) * tSpan

    let closest = 0
    let closestDist = Infinity
    for (let i = 0; i < displayReadings.length; i++) {
      const dist = Math.abs(displayReadings[i].ts - t)
      if (dist < closestDist) {
        closestDist = dist
        closest = i
      }
    }
    setHover({ idx: closest, clientX: e.clientX, clientY: e.clientY })
  }, [displayReadings, tMin, tSpan, innerW])

  const handleMouseLeave = useCallback(() => setHover(null), [])

  const hoverPt = hover != null ? displayReadings[hover.idx] : null

  return (
    <div style={{ position: 'relative', marginTop: 8 }}>
      <svg
        ref={svgRef}
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', overflow: 'visible' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Y grid + labels */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)}
              stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(v) + 3.5} fontSize="9" fill="var(--fg-3)"
              textAnchor="end" fontFamily="var(--font-mono)">{Math.round(v)}</text>
          </g>
        ))}

        {/* X labels */}
        {xTicks.map(tk => (
          <text key={tk.t} x={x(tk.t)} y={H - 6} fontSize="9" fill="var(--fg-3)"
            textAnchor="middle" fontFamily="var(--font-mono)">{tk.l}</text>
        ))}

        {/* Reference lines */}
        {targetF != null && (
          <line x1={PAD.l} x2={W - PAD.r}
            y1={y(toDisplay(targetF, unit))} y2={y(toDisplay(targetF, unit))}
            stroke="var(--rose)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
        )}
        {minF != null && (
          <line x1={PAD.l} x2={W - PAD.r}
            y1={y(toDisplay(minF, unit))} y2={y(toDisplay(minF, unit))}
            stroke="var(--honey)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
        )}
        {maxF != null && (
          <line x1={PAD.l} x2={W - PAD.r}
            y1={y(toDisplay(maxF, unit))} y2={y(toDisplay(maxF, unit))}
            stroke="var(--honey)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
        )}

        {/* Temperature line */}
        <path d={linePath} fill="none" stroke="var(--ember)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Hover crosshair + dot */}
        {hoverPt && (
          <g>
            <line x1={x(hoverPt.ts)} x2={x(hoverPt.ts)} y1={PAD.t} y2={H - PAD.b}
              stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="2 3" />
            <circle cx={x(hoverPt.ts)} cy={y(hoverPt.val)} r="3.5" fill="var(--ember)" />
            <circle cx={x(hoverPt.ts)} cy={y(hoverPt.val)} r="6" fill="var(--ember)" opacity="0.18" />
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {hoverPt && (
        <div style={{
          position: 'absolute',
          left: `${(x(hoverPt.ts) / W) * 100}%`,
          top: -4,
          transform: 'translate(-50%, -100%)',
          background: 'var(--bg-4)',
          border: '1px solid var(--line-2)',
          borderRadius: 8,
          padding: '4px 8px',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--fg-0)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          {fmt(hoverPt.val)}&deg;{unit}
          <span style={{ color: 'var(--fg-3)', marginLeft: 6 }}>
            {formatTime(hoverPt.ts)}
          </span>
        </div>
      )}
    </div>
  )
}
