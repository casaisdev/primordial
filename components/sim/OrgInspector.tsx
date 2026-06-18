'use client'

import type { OrganismSnapshot, GenomeData } from '@/sim/types'

const TRAITS = [
  { key: 'speed', label: 'SPD', fullLabel: 'SPEED', color: '#00FF88' },
  { key: 'vision', label: 'VIS', fullLabel: 'VISION', color: '#0082FF' },
  { key: 'energyEfficiency', label: 'EFF', fullLabel: 'EFFICIENCY', color: '#FF8C14' },
  { key: 'reproductionRate', label: 'REP', fullLabel: 'REPRODUCTION', color: '#AA32FF' },
  { key: 'size', label: 'SIZ', fullLabel: 'SIZE', color: '#C8D4DA' },
] as const satisfies { key: keyof GenomeData; label: string; fullLabel: string; color: string }[]

type Trait = (typeof TRAITS)[number]

type Props =
  | {
      org: OrganismSnapshot | null
      mode: 'tooltip'
      position: { x: number; y: number } | null
    }
  | {
      org: OrganismSnapshot | null
      mode: 'panel'
      onClear: () => void
    }

export default function OrgInspector(props: Props) {
  const { org } = props
  if (!org) return null

  const ranked = rankTraits(org.genome)
  const dominant = ranked[0]
  const second = ranked[1]
  const energyPct = Math.max(0, Math.min(1, org.energy / org.maxEnergy))
  const energyColor =
    energyPct > 0.6 ? '#00FF88' :
    energyPct > 0.3 ? '#FFCC00' :
      '#FF3D00'

  if (props.mode === 'tooltip') {
    if (!props.position) return null

    return (
      <div
        className="pointer-events-none fixed z-50 border border-wire-hi bg-void/85 px-2.5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-[3px]"
        style={{
          left: props.position.x + 14,
          top: props.position.y + 14,
          animation: 'reveal 0.08s ease both',
        }}
      >
        <div className="lbl flex items-center justify-between gap-5 text-[10px] text-ghost">
          <span className="flex items-center gap-2">
            ORG <span className="text-life tabular-nums">#{String(org.id).padStart(4, '0')}</span>
            {org.species === 'predator' && (
              <span className="text-[9px] text-pred">PRED</span>
            )}
          </span>
          <span style={{ color: dominant.trait.color }}>{dominant.trait.label}</span>
        </div>
        <div className="mt-1.5 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-[9px] tracking-[0.08em]">
          <span className="lbl text-ghost text-[9px]">ENERGY</span>
          <span className="text-right tabular-nums" style={{ color: energyColor }}>{Math.round(org.energy)}</span>
          <span className="lbl text-ghost text-[9px]">TOP GENES</span>
          <span className="text-right tabular-nums text-ink">
            <span style={{ color: dominant.trait.color }}>{dominant.trait.label} {dominant.value.toFixed(2)}</span>
            {second && <span className="text-ghost"> / <span style={{ color: second.trait.color }}>{second.trait.label} {second.value.toFixed(2)}</span></span>}
          </span>
        </div>
      </div>
    )
  }

  return (
    <section className="border-b border-wire px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="lbl flex items-center gap-2 text-[10px] text-ghost">
          ORGANISM INSPECTOR <span className="text-life tabular-nums">#{String(org.id).padStart(4, '0')}</span>
          {org.species === 'predator' && (
            <span className="text-[9px] text-pred">[PREDATOR]</span>
          )}
        </span>
        <button
          type="button"
          onClick={props.onClear}
          className="lbl border border-wire px-1.5 py-[2px] text-[9px] text-ghost transition-colors hover:border-wire-hi hover:text-life"
        >
          CLEAR
        </button>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-px border border-wire bg-wire">
        <MetricCard label="GEN" value={String(org.generation).padStart(3, '0')} />
        <MetricCard label="AGE" value={org.age.toLocaleString()} />
        <MetricCard label="FIT" value={org.accumulatedFitness.toFixed(1)} hi />
        <MetricCard label="OFF" value={String(org.offspring)} />
      </div>

      <div className="mt-3 border border-wire bg-fill-1 px-3 py-2.5">
        <div className="lbl mb-2 text-[9px] text-ghost">GENES [0-1]</div>
        <div className="space-y-1.5">
          {TRAITS.map((trait) => (
            <GeneBar
              key={trait.key}
              trait={trait}
              value={org.genome[trait.key]}
              dominant={trait.key === dominant.trait.key}
            />
          ))}
        </div>
      </div>

      <div className="mt-2 border border-wire bg-fill-1 px-3 py-2.5">
        <div className="lbl mb-2 text-[9px] text-ghost">PHENOTYPE</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Stat label="MOVE" value={`${org.phenotype.moveSpeed.toFixed(2)} px/t`} />
          <Stat label="VISION" value={`${Math.round(org.phenotype.visionRadius)} px`} />
          <Stat label="EAT" value={`${org.phenotype.eatRadius.toFixed(1)} px`} />
          <Stat label="GAIN" value={`${org.phenotype.energyGainMultiplier.toFixed(2)}x`} hi />
          <Stat label="COST" value={org.phenotype.energyCostPerTick.toFixed(3)} />
          <Stat label="REPRO" value={Math.round(org.phenotype.reproductionThreshold).toString()} />
          <Stat label="CHILD" value={`${Math.round(org.phenotype.offspringEnergyRatio * 100)}%`} />
        </div>
      </div>

      <div className="mt-2 border border-wire bg-fill-1 px-3 py-2.5">
        <div className="mb-2 flex items-center gap-2">
          <span className="lbl w-12 shrink-0 text-[9px] text-ghost">ENERGY</span>
          <div className="relative h-[7px] flex-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="absolute inset-y-0 left-0"
              style={{ width: `${energyPct * 100}%`, background: energyColor }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-ink">
            {Math.round(org.energy)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Stat label="DOMINANT" value={dominant.trait.fullLabel} hi />
          <Stat label="SECOND" value={second ? second.trait.fullLabel : '-'} />
        </div>
      </div>
    </section>
  )
}

function rankTraits(genome: GenomeData): Array<{ trait: Trait; value: number }> {
  return TRAITS
    .map((trait) => ({ trait, value: genome[trait.key] }))
    .sort((a, b) => b.value - a.value)
}

function GeneBar({ trait, value, dominant }: { trait: Trait; value: number; dominant: boolean }) {
  const intensity = 0.24 + value * 0.66
  const glow = 0.10 + value * 0.28

  return (
    <div className="flex items-center gap-2">
      <span
        className="relative w-7 shrink-0 text-[8px] tracking-[0.12em]"
        style={{ color: dominant ? trait.color : `color-mix(in srgb, ${trait.color} 72%, rgba(255,255,255,0.38))` }}
      >
        {dominant && (
          <span
            className="absolute -left-2 top-1/2 size-[3px] -translate-y-1/2"
            style={{ background: trait.color, boxShadow: `0 0 6px ${trait.color}88` }}
          />
        )}
        {trait.label}
      </span>
      <div className="relative h-[6px] flex-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${value * 100}%`,
            background: trait.color,
            opacity: intensity,
            boxShadow: `0 0 10px ${trait.color}${Math.round(glow * 255).toString(16).padStart(2, '0')}`,
          }}
        />
      </div>
      <span
        className="w-8 shrink-0 text-right text-[9px] tabular-nums"
        style={{ color: `color-mix(in srgb, ${trait.color} ${Math.round(48 + value * 42)}%, rgba(255,255,255,0.42))` }}
      >
        {value.toFixed(2)}
      </span>
    </div>
  )
}

function MetricCard({ label, value, hi }: { label: string; value: string; hi?: boolean }) {
  return (
    <div className="bg-surface px-2 py-2">
      <div className="lbl text-[8px] text-ghost">{label}</div>
      <div className={`mt-1 text-[11px] tabular-nums ${hi ? 'text-life' : 'text-ink'}`}>{value}</div>
    </div>
  )
}

function Stat({ label, value, hi }: { label: string; value: string; hi?: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2">
      <span className="lbl shrink-0 text-[8px] text-ghost">{label}</span>
      <span className={`min-w-0 truncate text-right text-[10px] tabular-nums ${hi ? 'text-life' : 'text-ink'}`}>{value}</span>
    </div>
  )
}
