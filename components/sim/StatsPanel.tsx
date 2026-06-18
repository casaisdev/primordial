'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import type { FoodKind, SimConfig, SimStats } from '@/sim/types'

/* ── Metric registry ── */

type MetricKey = 'population' | 'predators' | 'avgFitness' | 'avgEnergy' | 'avgAge' | 'maxAge'

const METRICS: Record<MetricKey, {
  label: string
  short: string
  color: string
  format: (v: number) => string
}> = {
  population: { label: 'POPULATION',  short: 'POP', color: '#00FF88', format: (v) => String(Math.round(v)) },
  predators:  { label: 'PREDATORS',   short: 'PRD', color: '#DC5028', format: (v) => String(Math.round(v)) },
  avgFitness: { label: 'AVG FITNESS', short: 'FIT', color: '#00CFFF', format: (v) => v.toFixed(2) },
  avgEnergy:  { label: 'AVG ENERGY',  short: 'NRG', color: '#FFB020', format: (v) => v.toFixed(1) },
  avgAge:     { label: 'AVG AGE',     short: 'AGE', color: '#C878FF', format: (v) => v.toFixed(0) },
  maxAge:     { label: 'MAX AGE',     short: 'MAX', color: '#FFCC44', format: (v) => v.toFixed(0) },
}

const METRIC_KEYS = Object.keys(METRICS) as MetricKey[]
const MAX_HIST = 32

/* ── Types ── */

interface Props {
  stats: SimStats | null
  popHistory: number[]
  predatorPopHistory: number[]
  organismInspector?: ReactNode
  labParameters?: ReactNode
  config: SimConfig
  activeSeed: number | null
}

type Row = {
  label: string
  value: string
  unit?: string
  hi?: boolean
  tone?: 'life' | 'fire' | 'ghost'
  onSelect?: () => void
  selected?: boolean
}

const FOOD_KINDS: FoodKind[] = ['small', 'lean', 'rich', 'dense']

/* ── Main component ── */

export default function StatsPanel({ stats, popHistory, predatorPopHistory, organismInspector, labParameters, config, activeSeed }: Props) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>('population')

  // State (not ref) so the chart re-renders when histories update
  const [localHist, setLocalHist] = useState<Record<Exclude<MetricKey, 'population' | 'predators'>, number[]>>({
    avgFitness: [],
    avgEnergy: [],
    avgAge: [],
    maxAge: [],
  })
  const prevElapsed = useRef(0)  // only read inside effect, not during render

  // Sample one history point per simulation tick. We depend on the primitive
  // stat VALUES, not the `stats` object: the worker emits a fresh `stats` object
  // on every rendered frame (including pure re-renders from hover/zoom that don't
  // advance the sim), so keying on its identity would re-fire this setState
  // effect in a render loop. The numbers only change when the sim actually steps.
  const hasStats = !!stats
  const elapsed = stats?.elapsed ?? 0
  const avgFitness = stats?.avgFitness ?? 0
  const avgEnergy = stats?.avgEnergy ?? 0
  const avgAge = stats?.avgAge ?? 0
  const maxAge = stats?.maxAge ?? 0
  useEffect(() => {
    if (!hasStats) return
    const isReset = elapsed < prevElapsed.current - 0.5
    prevElapsed.current = elapsed

    setLocalHist((prev) => {
      const base = isReset
        ? { avgFitness: [], avgEnergy: [], avgAge: [], maxAge: [] }
        : prev
      const append = (arr: number[], val: number): number[] => {
        const next = [...arr, val]
        return next.length > MAX_HIST ? next.slice(next.length - MAX_HIST) : next
      }
      return {
        avgFitness: append(base.avgFitness, avgFitness),
        avgEnergy:  append(base.avgEnergy,  avgEnergy),
        avgAge:     append(base.avgAge,      avgAge),
        maxAge:     append(base.maxAge,      maxAge),
      }
    })
  }, [hasStats, elapsed, avgFitness, avgEnergy, avgAge, maxAge])

  const rawChartHist = activeMetric === 'population'
    ? popHistory
    : activeMetric === 'predators'
      ? predatorPopHistory
      : localHist[activeMetric]
  const chartHist = rawChartHist.length > 0 ? rawChartHist : [0]

  // Population summary (always shown in top cards)
  const history    = popHistory.length > 0 ? popHistory : [0]
  const maxPop     = Math.max(stats?.peakPopulation ?? 0, ...history, 1)
  const latestPop  = history[history.length - 1] ?? 0
  const avgPop     = history.reduce((s, v) => s + v, 0) / history.length
  const netRecent  = stats?.netRecent ?? 0
  const predNet    = (stats?.predatorBirthsRecent ?? 0) - (stats?.predatorDeathsRecent ?? 0)
  const pressurePct = `${Math.round((stats?.resourcePressure ?? 0) * 100)}%`
  const foodPct     = `${Math.round((stats?.foodDensity ?? 0) * 100)}%`

  // Chart-specific trend (derived from whichever metric is active)
  const chartLatest = chartHist[chartHist.length - 1] ?? 0
  const chartPrev   = chartHist.length > 1 ? (chartHist[chartHist.length - 2] ?? chartLatest) : chartLatest
  const chartDelta  = chartLatest - chartPrev
  const chartTrendLabel = chartDelta === 0 ? 'STABLE' : chartDelta > 0 ? 'RISING' : 'FALLING'
  const chartTrendTone  = chartDelta === 0 ? 'text-ghost/40' : chartDelta > 0 ? 'text-life' : 'text-fire'

  const activeMeta = METRICS[activeMetric]

  // Rows — some are clickable to switch chart metric
  const simRows: Row[] = [
    { label: 'CURRENT POP',  value: String(stats?.organisms ?? 0),           hi: true, onSelect: () => setActiveMetric('population'), selected: activeMetric === 'population' },
    { label: 'PEAK POP',     value: String(stats?.peakPopulation ?? 0) },
    { label: 'GENERATION',   value: String(stats?.generation ?? 0) },
    { label: 'ELAPSED',      value: (stats?.elapsed ?? 0).toFixed(3),         unit: 's' },
    { label: 'BIRTHS',       value: String(stats?.births ?? 0),               tone: 'life' },
    { label: 'DEATHS',       value: String(stats?.deaths ?? 0),               tone: 'fire' },
    { label: 'AVG FITNESS',  value: stats ? stats.avgFitness.toFixed(3) : '-', onSelect: () => setActiveMetric('avgFitness'), selected: activeMetric === 'avgFitness' },
    { label: 'AVG AGE',      value: stats ? stats.avgAge.toFixed(1) : '-',    onSelect: () => setActiveMetric('avgAge'),     selected: activeMetric === 'avgAge' },
    { label: 'MAX AGE',      value: String(stats?.maxAge ?? 0),               onSelect: () => setActiveMetric('maxAge'),     selected: activeMetric === 'maxAge' },
    { label: 'AVG ENERGY',   value: stats ? stats.avgEnergy.toFixed(1) : '-', onSelect: () => setActiveMetric('avgEnergy'),  selected: activeMetric === 'avgEnergy' },
    { label: 'MUTATIONS',    value: String(stats?.mutations ?? 0) },
  ]

  const predatorRows: Row[] = [
    { label: 'PREDATORS',    value: String(stats?.predators ?? 0),          hi: true,      onSelect: () => setActiveMetric('predators'), selected: activeMetric === 'predators' },
    { label: 'PRED PEAK',    value: String(stats?.predatorPeakPop ?? 0) },
    { label: 'PRED BIRTHS',  value: String(stats?.predatorBirths ?? 0),     tone: 'life' },
    { label: 'PRED DEATHS',  value: String(stats?.predatorDeaths ?? 0),     tone: 'fire' },
    { label: 'PRED NET',     value: `${predNet > 0 ? '+' : ''}${predNet}`,  tone: predNet > 0 ? 'life' : predNet < 0 ? 'fire' : 'ghost' },
    { label: 'PRED FITNESS', value: stats ? stats.avgPredatorFitness.toFixed(3) : '-' },
    { label: 'PREDATIONS',   value: String(stats?.predationEvents ?? 0),    tone: (stats?.predationRecent ?? 0) > 0 ? 'fire' : 'ghost' },
    { label: 'PRED RECENT',  value: String(stats?.predationRecent ?? 0),    tone: (stats?.predationRecent ?? 0) > 0 ? 'fire' : 'ghost' },
  ]

  const genomeRows: Row[] = [
    { label: 'POPULATION BIAS',  value: stats?.dominantLabel ?? '-' },
    { label: 'BIAS SHIFT',       value: stats?.dominantDrift ?? '-' },
    { label: 'SPECIALIZATION',   value: stats?.specialization ?? '-' },
    { label: 'VARIANTS',         value: String(stats?.variants ?? 0) },
    { label: 'DIVERSITY',        value: stats ? stats.diversity.toFixed(3) : '-' },
    { label: 'AVG SPD',          value: stats ? stats.avgGenome.speed.toFixed(3) : '-' },
    { label: 'AVG VIS',          value: stats ? stats.avgGenome.vision.toFixed(3) : '-' },
    { label: 'AVG EFF',          value: stats ? stats.avgGenome.energyEfficiency.toFixed(3) : '-' },
    { label: 'AVG REP',          value: stats ? stats.avgGenome.reproductionRate.toFixed(3) : '-' },
    { label: 'AVG SIZ',          value: stats ? stats.avgGenome.size.toFixed(3) : '-' },
  ]

  const ecosystemRows: Row[] = [
    { label: 'CURRENT STATE',     value: stats?.ecosystemState ?? '-' },
    { label: 'RECENT NET',        value: `${netRecent > 0 ? '+' : ''}${netRecent}`, tone: netRecent > 0 ? 'life' : netRecent < 0 ? 'fire' : 'ghost' },
    { label: 'CRITICAL ENERGY',   value: String(stats?.criticalOrganisms ?? 0), tone: (stats?.criticalOrganisms ?? 0) > 0 ? 'fire' : 'ghost' },
    { label: 'RESOURCE PRESSURE', value: pressurePct },
    { label: 'FOOD COVERAGE',     value: foodPct },
  ]

  const envRows: Row[] = [
    { label: 'SEED',        value: activeSeed !== null ? String(activeSeed) : '-' },
    { label: 'WORLD',       value: `${config.worldWidth} x ${config.worldHeight}` },
    { label: 'MUT RATE',    value: config.mutationRate.toFixed(3) },
    { label: 'INIT POP',    value: String(config.initialPop) },
    { label: 'INIT FOOD',   value: String(config.initialFood) },
    { label: 'MAX FOOD',    value: String(config.foodCap) },
    { label: 'E DECAY',     value: config.energyDecay.toFixed(4) },
    { label: 'INIT ENERGY', value: String(config.initialEnergy) },
    { label: 'REPRO BASE',  value: String(config.reproductionBaseThreshold) },
    { label: 'TEMP',        value: config.temperature.toFixed(3) },
  ]

  return (
    <aside
      className="flex flex-col overflow-y-auto border-l border-wire bg-surface/90 backdrop-blur-[2px]"
      style={{ animation: 'reveal 0.25s ease 0.1s both' }}
    >
      {/* ── POPULATION / TIME ── */}
      <section className="border-b border-wire px-4 pt-3 pb-4">
        <PanelLabel>POPULATION / TIME</PanelLabel>

        {/* Summary cards */}
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <MetricCard
            label="NOW"
            value={String(latestPop)}
            hi
            active={activeMetric === 'population'}
            onClick={() => setActiveMetric('population')}
          />
          <MetricCard label="AVG" value={avgPop.toFixed(1)} />
          <MetricCard label="PEAK" value={String(maxPop)} />
        </div>

        {/* Oscilloscope chart */}
        <div className="mt-3 border border-wire bg-fill-0">
          {/* Metric selector row */}
          <div className="flex items-center justify-between border-b border-wire-lo px-3 py-1.5">
            <div className="flex items-center gap-0">
              {METRIC_KEYS.map((key) => {
                const m = METRICS[key]
                const isActive = activeMetric === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveMetric(key)}
                    className={`lbl px-2 py-0.5 text-[10px] transition-colors ${
                      isActive ? '' : 'text-ghost hover:text-dim'
                    }`}
                    style={isActive ? { color: m.color, textShadow: `0 0 8px ${m.color}55` } : undefined}
                  >
                    {m.short}
                  </button>
                )
              })}
            </div>
            <span className="text-[10px] tabular-nums tracking-[0.1em] text-ghost">
              {activeMeta.format(chartLatest)}
            </span>
          </div>

          <OscilloscopeChart history={chartHist} metric={activeMeta} />

          {/* Chart footer */}
          <div className="flex items-center justify-between border-t border-wire-lo px-3 py-1.5 text-[10px] tracking-[0.1em]">
            <span className="text-ghost tabular-nums">
              MIN {activeMeta.format(Math.min(...chartHist))}
            </span>
            <span
              className={`tabular-nums ${chartTrendTone}`}
              style={chartDelta !== 0 ? { textShadow: '0 0 6px currentColor' } : undefined}
            >
              {chartDelta > 0 ? '+' : ''}{activeMeta.format(chartDelta)} {chartTrendLabel}
            </span>
            <span className="text-ghost tabular-nums">
              MAX {activeMeta.format(Math.max(...chartHist))}
            </span>
          </div>
        </div>

        {/* Signal cards */}
        <div className="mt-3 grid grid-cols-2 gap-2" style={{ gridAutoRows: '72px' }}>
          <SignalCard
            label="BIRTHS / DEATHS"
            value={`${stats?.birthsRecent ?? 0} / ${stats?.deathsRecent ?? 0}`}
            note={`net ${netRecent > 0 ? '+' : ''}${netRecent}`}
            tone={netRecent > 0 ? 'life' : netRecent < 0 ? 'fire' : 'ghost'}
          />
          <SignalCard
            label="ECO STATE"
            value={stats?.telemetryState ?? 'STABILITY'}
            note={stats?.ecosystemState ?? 'stable equilibrium'}
            tone={(stats?.resourcePressure ?? 0) > 0.72 ? 'fire' : 'life'}
          />
        </div>
      </section>

      {/* Editing the world sits directly under the hero readout — input next to
          output — so tuning is the first thing reached, above the data dump. */}
      {labParameters}

      {organismInspector}

      <DataSection label="SIMULATION"     rows={simRows} activeMetric={activeMetric} />
      <DataSection label="PREDATORS"      rows={predatorRows} activeMetric={activeMetric} />
      <DataSection label="GENOME POOL"    rows={genomeRows} />
      <DataSection label="ECOSYSTEM"      rows={ecosystemRows} />
      <ResourceSection stats={stats} />
      <DataSection label="ENVIRONMENT"    rows={envRows} dim />
    </aside>
  )
}

/* ── Oscilloscope chart ── */

function OscilloscopeChart({
  history,
  metric,
}: {
  history: number[]
  metric: { label: string; short: string; color: string; format: (v: number) => string }
}) {
  const W = 320
  const H = 128
  const PL = 36   // left — Y-axis label space
  const PR = 8
  const PT = 8
  const PB = 8

  const data = history.length > 0 ? history : [0]
  const dMax = Math.max(...data)
  const dMin = Math.min(...data)
  const span = dMax === dMin ? Math.max(Math.abs(dMax) * 0.2, 1) : dMax - dMin

  // Y domain: pad slightly so line doesn't touch edges
  const yTop = dMax + span * 0.10
  const yBot = dMin - span * 0.05

  const iW = W - PL - PR
  const iH = H - PT - PB

  const px = (i: number) => PL + (i / Math.max(data.length - 1, 1)) * iW
  const py = (v: number) => PT + (1 - (v - yBot) / (yTop - yBot)) * iH

  const pts = data.map((v, i) => [px(i), py(v)] as [number, number])
  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const lastPt = pts[pts.length - 1] ?? [PL, PT + iH / 2]
  const areaPath = pts.length > 1
    ? `${linePath} L${lastPt[0].toFixed(1)},${(PT + iH).toFixed(1)} L${PL.toFixed(1)},${(PT + iH).toFixed(1)} Z`
    : ''

  // Y-axis: 5 tick levels
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map((r) => ({
    y: PT + (1 - r) * iH,
    v: yBot + r * (yTop - yBot),
  }))

  // X-axis: 3 vertical guides
  const xGuides = [0.25, 0.5, 0.75].map((r) => PL + r * iW)

  // Parse hex to rgb components
  const hex = metric.color.replace('#', '')
  const cr = parseInt(hex.slice(0, 2), 16)
  const cg = parseInt(hex.slice(2, 4), 16)
  const cb = parseInt(hex.slice(4, 6), 16)
  const rgb = `${cr},${cg},${cb}`

  const gradId = `og-${metric.short}`
  const filtId = `of-${metric.short}`

  // Corner bracket points
  const brackets: [number, number][][] = [
    [[PL, PT + 7], [PL, PT], [PL + 7, PT]],
    [[W - PR - 7, PT], [W - PR, PT], [W - PR, PT + 7]],
    [[PL, PT + iH - 7], [PL, PT + iH], [PL + 7, PT + iH]],
    [[W - PR - 7, PT + iH], [W - PR, PT + iH], [W - PR, PT + iH - 7]],
  ]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: H }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={`rgba(${rgb},0.58)`} />
          <stop offset="50%"  stopColor={`rgba(${rgb},0.12)`} />
          <stop offset="100%" stopColor={`rgba(${rgb},0.00)`} />
        </linearGradient>
        <filter id={filtId} x="-4%" y="-12%" width="108%" height="135%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Recessed chart background */}
      <rect x={PL} y={PT} width={iW} height={iH} fill="rgba(0,0,0,0.38)" />

      {/* Horizontal grid lines + Y-axis ticks + labels */}
      {yTicks.map(({ y, v }) => (
        <g key={y}>
          <line x1={PL} x2={PL + iW} y1={y} y2={y}
            stroke="rgba(255,255,255,0.055)" strokeDasharray="3 7" />
          <line x1={PL - 3} x2={PL} y1={y} y2={y}
            stroke="rgba(255,255,255,0.24)" strokeWidth="0.75" />
          <text
            x={PL - 5} y={y + 2.6}
            textAnchor="end" fontSize="8.5" fill="rgba(255,255,255,0.46)"
            fontFamily="'JetBrains Mono','Courier New',monospace"
          >
            {metric.format(v)}
          </text>
        </g>
      ))}

      {/* Vertical time guides */}
      {xGuides.map((x) => (
        <line key={x} x1={x} x2={x} y1={PT} y2={PT + iH}
          stroke="rgba(255,255,255,0.035)" strokeDasharray="2 8" />
      ))}

      {/* Axis borders */}
      <line x1={PL} x2={PL} y1={PT} y2={PT + iH}
        stroke="rgba(255,255,255,0.18)" strokeWidth="0.75" />
      <line x1={PL} x2={PL + iW} y1={PT + iH} y2={PT + iH}
        stroke="rgba(255,255,255,0.18)" strokeWidth="0.75" />

      {/* Area fill */}
      {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}

      {/* Signal line */}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke={metric.color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          filter={`url(#${filtId})`}
          opacity="0.95"
        />
      )}

      {/* Latest-value indicator: halo + ring + inner dot */}
      <circle cx={lastPt[0]} cy={lastPt[1]} r="8" fill={`rgba(${rgb},0.10)`} />
      <circle cx={lastPt[0]} cy={lastPt[1]} r="4"
        fill="rgba(0,0,0,0.80)" stroke={metric.color} strokeWidth="1" />
      <circle cx={lastPt[0]} cy={lastPt[1]} r="2" fill={metric.color} />

      {/* Corner brackets — oscilloscope frame */}
      {brackets.map((pts2, idx) => (
        <polyline
          key={idx}
          points={pts2.map(([x, y]) => `${x},${y}`).join(' ')}
          stroke={`rgba(${rgb},0.28)`}
          strokeWidth="1"
          fill="none"
        />
      ))}
    </svg>
  )
}

/* ── Sub-components ── */

function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-px w-2 shrink-0 bg-life/55" />
      <span className="shrink-0 text-[10px] font-medium tracking-[0.28em] text-dim uppercase">{children}</span>
      <div className="h-px flex-1 bg-wire" />
    </div>
  )
}

function MetricCard({
  label,
  value,
  hi,
  active,
  onClick,
}: {
  label: string
  value: string
  hi?: boolean
  active?: boolean
  onClick?: () => void
}) {
  if (!onClick) {
    return (
      <div
        className={`border bg-fill-1 px-3 py-2 transition-colors ${active ? 'border-life/35' : 'border-wire'}`}
        style={active ? { boxShadow: 'inset 0 0 14px rgba(0,255,136,0.05)' } : undefined}
      >
        <div className="lbl text-[10px] text-ghost">{label}</div>
        <div className={`mt-0.5 text-[17px] tabular-nums font-medium ${hi || active ? 'text-life glow-soft' : 'text-ink'}`}>
          {value}
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      className={`block w-full text-left border bg-fill-1 px-3 py-2 transition-colors ${
        active
          ? 'border-life/35 cursor-pointer'
          : 'border-wire cursor-pointer hover:border-wire-hi'
      }`}
      style={active ? { boxShadow: 'inset 0 0 14px rgba(0,255,136,0.05)' } : undefined}
      onClick={onClick}
    >
      <div className="lbl text-[10px] text-ghost">{label}</div>
      <div className={`mt-0.5 text-[17px] tabular-nums font-medium ${hi || active ? 'text-life glow-soft' : 'text-ink'}`}>
        {value}
      </div>
    </button>
  )
}

function SignalCard({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note: string
  tone: 'life' | 'fire' | 'ghost'
}) {
  const toneClass = tone === 'life' ? 'text-life' : tone === 'fire' ? 'text-fire' : 'text-ghost'
  const glowClass = tone === 'life' ? 'glow-life' : tone === 'fire' ? 'glow-fire' : ''
  const accentColor =
    tone === 'life' ? 'color-mix(in srgb, var(--life) 40%, transparent)' :
    tone === 'fire' ? 'color-mix(in srgb, var(--fire) 40%, transparent)' :
    'var(--wire)'
  return (
    <div
      className="overflow-hidden border-t border-r border-b border-wire bg-fill-1 px-3 py-2"
      style={{ borderLeft: `2px solid ${accentColor}` }}
    >
      <div className="lbl truncate text-[10px] text-ghost">{label}</div>
      <div className={`mt-0.5 truncate whitespace-nowrap text-[13px] tracking-[0.04em] ${toneClass} ${glowClass}`}>
        {value}
      </div>
      <div className="mt-0.5 truncate text-[10px] tracking-[0.02em] text-dim">{note}</div>
    </div>
  )
}

function DataSection({ label, rows, dim = false, activeMetric }: { label: string; rows: Row[]; dim?: boolean; activeMetric?: MetricKey }) {
  return (
    <section className="border-b border-wire px-4 py-3 last:border-b-0">
      <PanelLabel>{label}</PanelLabel>
      <div className="mt-2.5 grid grid-cols-1 gap-px">
        {rows.map((row) => {
          const isLife    = row.hi || row.tone === 'life'
          const isFire    = row.tone === 'fire'
          const isClickable = !!row.onSelect
          const isSelected  = row.selected

          const valueColor =
            row.hi          ? 'text-life' :
            row.tone === 'life' ? 'text-life' :
            row.tone === 'fire' ? 'text-fire' :
            dim             ? 'text-ghost/50' : 'text-ink'

          const glowClass =
            isSelected ? 'glow-life' :
            isLife     ? 'glow-soft' :
            isFire     ? 'glow-fire' :
            ''

          // Selected rows get a left accent colored by the active metric
          const selColor = isSelected && activeMetric
            ? (METRICS[activeMetric]?.color ?? '#00FF88')
            : undefined

          const borderStyle = isSelected
            ? { borderLeft: `2px solid ${selColor}`, borderTop: '1px solid transparent', borderRight: '1px solid transparent', borderBottom: '1px solid transparent' }
            : isLife ? { border: '1px solid color-mix(in srgb, var(--life) 14%, transparent)' }
            : isFire ? { border: '1px solid color-mix(in srgb, var(--fire) 14%, transparent)' }
            : { border: '1px solid var(--wire)' }

          return (
            <div
              key={row.label}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 bg-fill-1 px-3 py-[5px] ${isClickable ? 'cursor-pointer hover:bg-fill-2' : ''}`}
              style={borderStyle}
              onClick={row.onSelect}
              role={isClickable ? 'button' : undefined}
              tabIndex={isClickable ? 0 : undefined}
              aria-pressed={isClickable ? !!isSelected : undefined}
              onKeyDown={isClickable ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  row.onSelect?.()
                }
              } : undefined}
              title={isClickable ? `Graph ${row.label}` : undefined}
            >
              <span
                className={`lbl flex min-w-0 items-center gap-1.5 text-[10px] ${dim ? 'text-ghost' : 'text-dim'}`}
                style={isSelected && selColor ? { color: selColor, opacity: 0.75 } : undefined}
              >
                {isSelected && (
                  <span
                    className="inline-block size-[4px] shrink-0"
                    style={{ background: selColor, boxShadow: `0 0 5px ${selColor}` }}
                  />
                )}
                {row.label}
              </span>
              <span className={`min-w-0 text-right text-[15px] tabular-nums tracking-[-0.01em] ${valueColor} ${glowClass}`}>
                <span className="truncate">
                  {row.value}
                  {row.unit && <span className="ml-1 text-[10px] text-ghost">{row.unit}</span>}
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ── Resource types — a compact telemetry table (the composite per-kind data is
   too wide for the generic label/value row, so it gets its own grid) ── */

function ResourceSection({ stats }: { stats: SimStats | null }) {
  return (
    <section className="border-b border-wire px-4 py-3 last:border-b-0">
      <PanelLabel>RESOURCE TYPES</PanelLabel>
      <div className="mt-2.5 border border-wire bg-fill-1">
        {/* Column header */}
        <div className="grid grid-cols-[46px_repeat(4,minmax(0,1fr))] items-center gap-x-2 border-b border-wire-lo px-3 py-1.5">
          <span />
          <ResHead>LIVE</ResHead>
          <ResHead>RCNT</ResHead>
          <ResHead>EATEN</ResHead>
          <ResHead>NRG</ResHead>
        </div>
        {FOOD_KINDS.map((kind, i) => {
          const live   = stats?.foodByKind[kind] ?? 0
          const recent = stats?.eatenRecentByKind[kind] ?? 0
          const eaten  = stats?.eatenByKind[kind] ?? 0
          const energy = stats ? Math.round(stats.energyEatenByKind[kind]) : 0
          return (
            <div
              key={kind}
              className={`grid grid-cols-[46px_repeat(4,minmax(0,1fr))] items-center gap-x-2 px-3 py-[5px] ${i > 0 ? 'border-t border-wire-lo' : ''}`}
            >
              <span className="lbl text-[9px] text-dim">{kind.toUpperCase()}</span>
              <ResCell value={live} />
              <ResCell value={recent} tone={recent > 0 ? 'life' : 'ghost'} />
              <ResCell value={eaten} tone="dim" />
              <ResCell value={energy} tone="amber" unit="e" />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ResHead({ children }: { children: string }) {
  return <span className="lbl text-right text-[8px] text-ghost">{children}</span>
}

function ResCell({
  value,
  tone = 'ink',
  unit,
}: {
  value: number
  tone?: 'ink' | 'dim' | 'ghost' | 'life' | 'amber'
  unit?: string
}) {
  const color =
    tone === 'life'  ? 'text-life' :
    tone === 'amber' ? 'text-amber' :
    tone === 'dim'   ? 'text-dim' :
    tone === 'ghost' ? 'text-ghost' :
    'text-ink'
  return (
    <span className={`min-w-0 truncate text-right text-[11px] tabular-nums ${color}`}>
      {value.toLocaleString()}
      {unit && <span className="ml-px text-[8px] text-ghost">{unit}</span>}
    </span>
  )
}
