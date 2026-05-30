import React from 'react'
import { Reading } from '../api/client'

const W = 280
const H = 60
const PAD = { t: 4, b: 4, l: 0, r: 0 }

interface Props {
  readings: Reading[]
  targetF?: number | null
  minF?: number | null
  maxF?: number | null
  unit: string
}

const toDisplay = (f: number, unit: string) => unit === 'C' ? (f - 32) * 5 / 9 : f

export const MiniChart: React.FC<Props> = ({ readings, targetF, minF, maxF, unit }) => {
  if (readings.length < 2) return null

  const temps = readings.map(r => toDisplay(r.temp_f, unit))
  const refLines: number[] = []
  if (targetF != null) refLines.push(toDisplay(targetF, unit))
  if (minF != null) refLines.push(toDisplay(minF, unit))
  if (maxF != null) refLines.push(toDisplay(maxF, unit))

  const allVals = [...temps, ...refLines]
  let yMin = Math.min(...allVals)
  let yMax = Math.max(...allVals)
  if (yMax - yMin < 5) {
    const mid = (yMax + yMin) / 2
    yMin = mid - 5
    yMax = mid + 5
  }
  const margin = (yMax - yMin) * 0.1
  yMin -= margin
  yMax += margin

  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b

  const toX = (i: number) => PAD.l + (i / (temps.length - 1)) * plotW
  const toY = (v: number) => PAD.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH

  const points = temps.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')

  const refY = (v: number) => {
    const y = toY(v)
    return Math.max(PAD.t, Math.min(PAD.t + plotH, y))
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 48, display: 'block', marginTop: 8 }}>
      {targetF != null && (
        <line
          x1={PAD.l} x2={W - PAD.r}
          y1={refY(toDisplay(targetF, unit))} y2={refY(toDisplay(targetF, unit))}
          stroke="var(--rose)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6"
        />
      )}
      {minF != null && (
        <line
          x1={PAD.l} x2={W - PAD.r}
          y1={refY(toDisplay(minF, unit))} y2={refY(toDisplay(minF, unit))}
          stroke="var(--honey)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6"
        />
      )}
      {maxF != null && (
        <line
          x1={PAD.l} x2={W - PAD.r}
          y1={refY(toDisplay(maxF, unit))} y2={refY(toDisplay(maxF, unit))}
          stroke="var(--honey)" strokeWidth="1" strokeDasharray="4 3" opacity="0.6"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke="var(--ember)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
