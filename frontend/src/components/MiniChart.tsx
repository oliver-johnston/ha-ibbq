import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Reading, api } from '../api/client'

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

function xTickInterval(spanMin: number): number {
  if (spanMin <= 5) return 60
  if (spanMin <= 15) return 120
  if (spanMin <= 30) return 300
  if (spanMin <= 120) return 900
  if (spanMin <= 360) return 1800
  return 3600
}

// ── Core chart SVG ──────────────────────────────────────

interface ChartSVGProps {
  readings: { ts: number; val: number }[]
  targetF?: number | null
  minF?: number | null
  maxF?: number | null
  unit: string
  w: number
  h: number
  pad: { l: number; r: number; t: number; b: number }
  yTickCount?: number
}

const ChartSVG: React.FC<ChartSVGProps> = ({ readings, targetF, minF, maxF, unit, w, h, pad, yTickCount = 4 }) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const innerW = w - pad.l - pad.r
  const innerH = h - pad.t - pad.b

  const refLineVals = useMemo(() => {
    const lines: number[] = []
    if (targetF != null) lines.push(toDisplay(targetF, unit))
    if (minF != null) lines.push(toDisplay(minF, unit))
    if (maxF != null) lines.push(toDisplay(maxF, unit))
    return lines
  }, [targetF, minF, maxF, unit])

  const temps = readings.map(r => r.val)
  const allVals = [...temps, ...refLineVals]
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

  const tMin = readings[0].ts
  const tMax = readings[readings.length - 1].ts
  const tSpan = Math.max(tMax - tMin, 60)

  const x = (t: number) => pad.l + ((t - tMin) / tSpan) * innerW
  const y = (v: number) => pad.t + (1 - (v - yLo) / (yHi - yLo)) * innerH

  const linePath = readings
    .map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(r.ts).toFixed(1)} ${y(r.val).toFixed(1)}`)
    .join(' ')

  const yStep = niceStep(yHi - yLo, yTickCount)
  const yTicks: number[] = []
  for (let v = Math.ceil(yLo / yStep) * yStep; v <= yHi; v += yStep) {
    yTicks.push(Math.round(v * 10) / 10)
  }

  const spanMin = tSpan / 60
  const xInt = xTickInterval(spanMin)
  const xTicks: { t: number; l: string }[] = []
  const firstTick = Math.ceil(tMin / xInt) * xInt
  for (let t = firstTick; t <= tMax; t += xInt) {
    xTicks.push({ t, l: formatTime(t) })
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || readings.length === 0) return
    const rect = svg.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * w
    const t = tMin + ((svgX - pad.l) / innerW) * tSpan

    let closest = 0
    let closestDist = Infinity
    for (let i = 0; i < readings.length; i++) {
      const dist = Math.abs(readings[i].ts - t)
      if (dist < closestDist) {
        closestDist = dist
        closest = i
      }
    }
    setHoverIdx(closest)
  }, [readings, tMin, tSpan, innerW, w, pad.l])

  const handleMouseLeave = useCallback(() => setHoverIdx(null), [])

  const hoverPt = hoverIdx != null ? readings[hoverIdx] : null

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ display: 'block', overflow: 'visible' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {yTicks.map(v => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)}
              stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(v) + 3.5} fontSize="9" fill="var(--fg-3)"
              textAnchor="end" fontFamily="var(--font-mono)">{Math.round(v)}</text>
          </g>
        ))}

        {xTicks.map(tk => (
          <text key={tk.t} x={x(tk.t)} y={h - 6} fontSize="9" fill="var(--fg-3)"
            textAnchor="middle" fontFamily="var(--font-mono)">{tk.l}</text>
        ))}

        {targetF != null && (
          <line x1={pad.l} x2={w - pad.r}
            y1={y(toDisplay(targetF, unit))} y2={y(toDisplay(targetF, unit))}
            stroke="var(--rose)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
        )}
        {minF != null && (
          <line x1={pad.l} x2={w - pad.r}
            y1={y(toDisplay(minF, unit))} y2={y(toDisplay(minF, unit))}
            stroke="var(--honey)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
        )}
        {maxF != null && (
          <line x1={pad.l} x2={w - pad.r}
            y1={y(toDisplay(maxF, unit))} y2={y(toDisplay(maxF, unit))}
            stroke="var(--honey)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
        )}

        <path d={linePath} fill="none" stroke="var(--ember)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />

        {hoverPt && (
          <g>
            <line x1={x(hoverPt.ts)} x2={x(hoverPt.ts)} y1={pad.t} y2={h - pad.b}
              stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="2 3" />
            <circle cx={x(hoverPt.ts)} cy={y(hoverPt.val)} r="3.5" fill="var(--ember)" />
            <circle cx={x(hoverPt.ts)} cy={y(hoverPt.val)} r="6" fill="var(--ember)" opacity="0.18" />
          </g>
        )}
      </svg>

      {hoverPt && (
        <div style={{
          position: 'absolute',
          left: `${(x(hoverPt.ts) / w) * 100}%`,
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
          <span style={{ color: 'var(--fg-3)', marginLeft: 6 }}>{formatTime(hoverPt.ts)}</span>
        </div>
      )}
    </div>
  )
}

// ── Full-screen chart modal ─────────────────────────────

interface ModalProps {
  probe: number
  label: string
  targetF?: number | null
  minF?: number | null
  maxF?: number | null
  unit: string
  onClose: () => void
}

const ChartModal: React.FC<ModalProps> = ({ probe, label, targetF, minF, maxF, unit, onClose }) => {
  const [allReadings, setAllReadings] = useState<{ ts: number; val: number }[] | null>(null)

  useEffect(() => {
    api.getSessionReadings().then(readings => {
      const probeReadings = readings
        .filter(r => r.probe === probe)
        .map(r => ({ ts: r.timestamp, val: toDisplay(r.temp_f, unit) }))
      setAllReadings(probeReadings)
    }).catch(() => setAllReadings([]))
  }, [probe, unit])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--line-2)',
          borderRadius: 16,
          padding: 20,
          width: '100%',
          maxWidth: 700,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-0)' }}>{label}</span>
          <button
            onClick={onClose}
            className="tap"
            style={{
              background: 'var(--bg-3)', border: '1px solid var(--line-2)',
              borderRadius: 8, color: 'var(--fg-2)', fontSize: 11, fontWeight: 600,
              padding: '4px 12px',
            }}
          >
            Close
          </button>
        </div>

        {allReadings === null && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--fg-3)', fontSize: 12 }}>
            Loading...
          </div>
        )}

        {allReadings != null && allReadings.length < 2 && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--fg-3)', fontSize: 12 }}>
            Not enough data yet
          </div>
        )}

        {allReadings != null && allReadings.length >= 2 && (
          <ChartSVG
            readings={allReadings}
            targetF={targetF}
            minF={minF}
            maxF={maxF}
            unit={unit}
            w={660}
            h={280}
            pad={{ l: 42, r: 16, t: 16, b: 28 }}
            yTickCount={6}
          />
        )}
      </div>
    </div>
  )
}

// ── Public MiniChart component ──────────────────────────

interface Props {
  probe: number
  label: string
  readings: Reading[]
  targetF?: number | null
  minF?: number | null
  maxF?: number | null
  unit: string
}

export const MiniChart: React.FC<Props> = ({ probe, label, readings, targetF, minF, maxF, unit }) => {
  const [expanded, setExpanded] = useState(false)

  const displayReadings = useMemo(
    () => readings.map(r => ({ ts: r.timestamp, val: toDisplay(r.temp_f, unit) })),
    [readings, unit],
  )

  if (displayReadings.length < 2) return null

  return (
    <>
      <div
        onClick={() => setExpanded(true)}
        style={{ cursor: 'pointer', marginTop: 8 }}
      >
        <ChartSVG
          readings={displayReadings}
          targetF={targetF}
          minF={minF}
          maxF={maxF}
          unit={unit}
          w={340}
          h={120}
          pad={{ l: 36, r: 12, t: 12, b: 24 }}
        />
      </div>

      {expanded && (
        <ChartModal
          probe={probe}
          label={label}
          targetF={targetF}
          minF={minF}
          maxF={maxF}
          unit={unit}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  )
}
