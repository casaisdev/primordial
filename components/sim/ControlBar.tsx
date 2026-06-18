'use client'

import type { SimState, Speed } from '@/hooks/useSimulation'

const SPEEDS: { label: string; value: Speed }[] = [
  { label: '0.25x', value: 0.25 },
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '4x', value: 4 },
  { label: 'MAX', value: 0 },
]

const PRIMARY_LABEL: Record<SimState, string> = {
  idle: 'START',
  running: 'PAUSE',
  paused: 'RESUME',
}

const STATUS_LABEL: Record<SimState, string> = {
  idle: 'IDLE',
  running: 'RUNNING',
  paused: 'PAUSED',
}

interface Props {
  simState: SimState
  speed: Speed
  gen: number
  elapsed: number
  pop: number
  telemetryState: string
  ecosystemState: string
  onPrimary: () => void
  onReset: () => void
  onSpeedChange: (s: Speed) => void
}

export default function ControlBar({
  simState,
  speed,
  gen,
  elapsed,
  pop,
  telemetryState,
  ecosystemState,
  onPrimary,
  onReset,
  onSpeedChange,
}: Props) {
  const isRunning = simState === 'running'
  // After full extinction the sim keeps running but RESUME makes no sense — show RESET
  const isExtinct = simState === 'paused' && ecosystemState === 'ecosystem collapsed'
  const primaryLabel = isExtinct ? 'RESET' : PRIMARY_LABEL[simState]
  const primaryAction = isExtinct ? onReset : onPrimary

  const telemetryTone =
    telemetryState === 'GROWTH PHASE' || telemetryState === 'MUTATION RESCUE'
      ? 'text-life'
      : telemetryState === 'DIE-OFF' || telemetryState === 'EXTINCTION RISK' || telemetryState === 'EXTINCTION'
        ? 'text-fire'
        : 'text-dim'

  const telemetryGlow =
    telemetryTone === 'text-life' ? 'glow-life' :
    telemetryTone === 'text-fire' ? 'glow-fire' :
    ''

  return (
    <footer
      className="col-span-full flex h-full items-stretch overflow-hidden border-t border-wire bg-void max-[860px]:fixed max-[860px]:inset-x-0 max-[860px]:bottom-0 max-[860px]:z-40 max-[860px]:h-auto max-[860px]:flex-wrap max-[860px]:pb-[env(safe-area-inset-bottom)] max-[860px]:shadow-[0_-8px_26px_rgba(0,0,0,0.6)]"
      style={{ animation: 'reveal 0.25s ease 0.14s both' }}
    >
      {/* ── PRIMARY ACTION ── */}
      <button
        type="button"
        onClick={primaryAction}
        aria-label={isExtinct ? 'Reset simulation' : `${PRIMARY_LABEL[simState]} simulation`}
        className={`lbl flex shrink-0 items-center justify-center border-r border-wire px-6 text-[13px] transition-colors max-[860px]:h-12 max-[860px]:flex-1 ${
          isExtinct
            ? 'bg-fire/10 text-fire hover:bg-fire/[0.18] glow-fire'
            : `bg-life/[0.07] text-life hover:bg-life/[0.12] ${isRunning ? 'glow-life' : 'glow-soft'}`
        }`}
        style={{
          boxShadow: isRunning && !isExtinct ? 'inset 0 0 22px rgba(0,255,136,0.055)' : undefined,
        }}
      >
        {primaryLabel}
      </button>

      {/* ── STATUS ── */}
      <div className="flex shrink-0 items-center gap-2 border-r border-wire px-4">
        <span
          className={`inline-block size-[5px] shrink-0 ${isRunning ? 'animate-pulse-cell bg-life' : 'bg-ink/25'}`}
          style={isRunning ? { boxShadow: '0 0 6px color-mix(in srgb, var(--life) 85%, transparent)' } : undefined}
        />
        <span className="lbl text-[11px] text-dim">
          {STATUS_LABEL[simState]}
        </span>
      </div>

      {/* ── RESET (conditional) ── */}
      {simState !== 'idle' && (
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset simulation"
          className="lbl flex shrink-0 items-center border-r border-wire px-4 text-[11px] text-dim transition-colors hover:text-fire"
        >
          RESET
        </button>
      )}

      {/* ── SPEED ── (drops onto its own full-width tier on narrow screens) */}
      <div role="group" aria-label="Simulation speed" className="flex shrink-0 items-stretch border-r border-wire max-[860px]:h-12 max-[860px]:basis-full max-[860px]:border-r-0 max-[860px]:border-t max-[860px]:border-t-wire">
        <div className="flex items-center border-r border-wire px-4">
          <span className="lbl text-[10px] text-ghost">SPEED</span>
        </div>
        {SPEEDS.map((entry) => {
          const active = entry.value === speed
          return (
            <button
              key={entry.label}
              type="button"
              onClick={() => onSpeedChange(entry.value)}
              aria-pressed={active}
              aria-label={entry.value === 0 ? 'Max speed' : `Speed ${entry.label}`}
              className={`flex w-11 items-center justify-center border-r border-wire text-[12px] tracking-[0.06em] tabular-nums transition-all last:border-r-0 max-[860px]:w-auto max-[860px]:flex-1 ${
                active
                  ? 'bg-life/[0.10] text-life glow-life'
                  : 'text-dim hover:bg-fill-2 hover:text-ink'
              }`}
              style={active ? {
                boxShadow: 'inset 0 -2px 0 color-mix(in srgb, var(--life) 55%, transparent)',
              } : undefined}
            >
              {entry.label}
            </button>
          )
        })}
      </div>

      {/* ── ECO STATE ── (hidden on mobile — same readout sits on the canvas + panel) */}
      <div className="flex min-w-0 flex-1 items-center gap-3 border-r border-wire px-5 max-[860px]:hidden">
        <span className="lbl shrink-0 text-[10px] text-ghost">ECO</span>
        <span className={`lbl shrink-0 whitespace-nowrap text-[12px] ${telemetryTone} ${telemetryGlow}`}>
          {telemetryState}
        </span>
        <span className="select-none text-ghost/40">╴</span>
        <span className="min-w-0 truncate text-[11px] tracking-[0.02em] text-dim">
          {ecosystemState}
        </span>
      </div>

      {/* ── TELEMETRY READOUTS ── (hidden on mobile — duplicated in the stats panel) */}
      <div className="flex items-stretch max-[860px]:hidden">
        <Readout label="GEN" value={String(gen).padStart(4, '0')} />
        <Readout label="T" value={elapsed.toFixed(3)} unit="s" />
        <Readout label="POP" value={String(pop)} hi={isRunning} />
      </div>
    </footer>
  )
}

function Readout({
  label,
  value,
  unit,
  hi,
}: {
  label: string
  value: string
  unit?: string
  hi?: boolean
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-l border-wire px-4">
      <span className="lbl text-[10px] text-ghost">{label}</span>
      <span className={`text-[15px] tabular-nums ${hi ? 'text-life glow-soft' : 'text-ink'}`}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] text-ghost">{unit}</span>}
      </span>
    </div>
  )
}
