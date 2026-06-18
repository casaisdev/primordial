'use client'

import { useState } from 'react'
import type { FoodKind, SimConfig } from '@/sim/types'

const FOOD_KINDS: FoodKind[] = ['small', 'lean', 'rich', 'dense']

interface Props {
  draftConfig: SimConfig
  appliedConfig: SimConfig
  onChange: (config: SimConfig) => void
  onApplyRestart: () => void
  onRestoreDefaults: () => void
}

export default function LabParameters({
  draftConfig,
  appliedConfig,
  onChange,
  onApplyRestart,
  onRestoreDefaults,
}: Props) {
  const [open, setOpen] = useState(false)
  const dirty = JSON.stringify(draftConfig) !== JSON.stringify(appliedConfig)

  function update<K extends keyof SimConfig>(key: K, value: SimConfig[K]) {
    onChange({ ...draftConfig, [key]: value })
  }

  function updateSeed(value: string) {
    update('seed', value.trim() === '' ? undefined : Number(value))
  }

  function updateFood(kind: FoodKind, key: 'weight' | 'energy' | 'radius', value: number) {
    onChange({
      ...draftConfig,
      foodProfiles: {
        ...draftConfig.foodProfiles,
        [kind]: {
          ...draftConfig.foodProfiles[kind],
          [key]: value,
        },
      },
    })
  }

  return (
    <section className="border-b border-wire">
      {/* The one editable module in a panel of read-only telemetry — given a
          life-accent rail, a rotating caret and a brighter label so it reads as
          "tune here", not another data row. */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="lab-parameters-panel"
        className="flex w-full items-center justify-between gap-3 border-l-2 border-life/55 bg-life/[0.05] px-4 py-3 text-left transition-colors hover:bg-life/[0.09]"
      >
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`text-[10px] text-life transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          >
            ▸
          </span>
          <span className="lbl glow-soft text-[11px] text-life">LAB PARAMETERS</span>
        </span>
        <span
          className={`lbl text-[9px] ${
            dirty ? 'text-amber glow-amber' : open ? 'text-life/75' : 'text-dim'
          }`}
        >
          {dirty ? 'UNAPPLIED' : open ? 'EDITING' : 'TUNE'}
        </span>
      </button>

      {open && (
        <div id="lab-parameters-panel" className="space-y-3 px-4 pb-4 pt-3">
          <p className="text-[10px] leading-relaxed text-dim">
            Adjust the world, then <span className="text-life">APPLY + RESTART</span> to begin a fresh run.
          </p>

          <div className="grid grid-cols-1 gap-2">
            <SeedInput value={draftConfig.seed} onChange={updateSeed} />
            <ParamSlider label="MAX POP" ariaLabel="Maximum population" value={draftConfig.maxPopulation} min={100} max={800} step={25} onChange={(value) => update('maxPopulation', value)} />
            <ParamSlider label="INITIAL POP" ariaLabel="Initial population"  value={draftConfig.initialPop}       min={10}  max={800} step={10} onChange={(value) => update('initialPop', value)} />
            <ParamSlider label="INIT PREDATORS" ariaLabel="Initial predators" value={draftConfig.initialPredators ?? 0} min={0} max={80} step={2} onChange={(value) => update('initialPredators', value)} />
            <ParamSlider label="INITIAL FOOD" ariaLabel="Initial food" value={draftConfig.initialFood} min={0} max={1800} step={25} onChange={(value) => update('initialFood', value)} />
            <ParamSlider label="MAX FOOD" ariaLabel="Maximum food" value={draftConfig.foodCap} min={500} max={3500} step={50} onChange={(value) => update('foodCap', value)} />
            <ParamSlider label="FOOD SPAWN" ariaLabel="Food spawn rate" value={draftConfig.foodSpawnRate} min={0} max={60} step={1} onChange={(value) => update('foodSpawnRate', value)} />
            <ParamSlider label="MUTATION" ariaLabel="Mutation rate" value={draftConfig.mutationRate} min={0} max={0.08} step={0.001} precision={3} onChange={(value) => update('mutationRate', value)} />
            <ParamSlider label="E DECAY" ariaLabel="Energy decay" value={draftConfig.energyDecay} min={0.00005} max={0.003} step={0.00005} precision={5} onChange={(value) => update('energyDecay', value)} />
            <ParamSlider label="INITIAL ENERGY" ariaLabel="Initial energy" value={draftConfig.initialEnergy} min={120} max={320} step={10} onChange={(value) => update('initialEnergy', value)} />
            <ParamSlider label="REPRO BASE" ariaLabel="Reproduction base threshold" value={draftConfig.reproductionBaseThreshold} min={70} max={180} step={5} onChange={(value) => update('reproductionBaseThreshold', value)} />
            <Toggle
              label="ALLOW EXTINCT"
              ariaLabel="Allow extinction"
              value={draftConfig.allowExtinction ?? false}
              onChange={(value) => update('allowExtinction', value)}
            />
          </div>

          <div className="border border-wire bg-fill-1 px-3 py-2.5">
            <div className="lbl mb-2 text-[9px] text-ghost">FOOD PROFILES</div>
            <div className="grid grid-cols-[54px_1fr_1fr_1fr] gap-x-2 gap-y-1.5">
              <span />
              <ColumnLabel>WGT</ColumnLabel>
              <ColumnLabel>ENG</ColumnLabel>
              <ColumnLabel>RAD</ColumnLabel>
              {FOOD_KINDS.map((kind) => {
                const profile = draftConfig.foodProfiles[kind]
                return (
                  <FoodRow
                    key={kind}
                    kind={kind}
                    weight={profile.weight}
                    energy={profile.energy}
                    radius={profile.radius}
                    onWeight={(value) => updateFood(kind, 'weight', value)}
                    onEnergy={(value) => updateFood(kind, 'energy', value)}
                    onRadius={(value) => updateFood(kind, 'radius', value)}
                  />
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onApplyRestart}
              className="lbl border border-life/50 bg-life/[0.08] px-2 py-2 text-[9px] text-life transition-colors hover:bg-life/[0.14]"
            >
              APPLY + RESTART
            </button>
            <button
              type="button"
              onClick={onRestoreDefaults}
              className="lbl border border-wire bg-fill-1 px-2 py-2 text-[9px] text-ghost transition-colors hover:border-wire-hi hover:text-ink"
            >
              RESTORE DEFAULTS
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function SeedInput({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (value: string) => void
}) {
  return (
    <label className="grid grid-cols-[92px_minmax(0,1fr)_54px] items-center gap-2 border border-wire bg-fill-1 px-2 py-1.5">
      <span className="lbl text-[9px] text-dim">SEED</span>
      <input
        type="number"
        min={0}
        max={0xffffffff}
        step={1}
        value={value ?? ''}
        placeholder="AUTO"
        aria-label="Seed"
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 border border-wire bg-void/60 px-2 py-0.5 text-[10px] tabular-nums text-ink outline-none transition-colors placeholder:text-ghost/60 focus:border-life/50"
      />
      <span className="lbl text-right text-[9px] text-ghost">
        {value === undefined ? 'AUTO' : 'FIXED'}
      </span>
    </label>
  )
}

function Toggle({
  label,
  ariaLabel,
  value,
  onChange,
}: {
  label: string
  ariaLabel?: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)_54px] items-center gap-2 border border-wire bg-fill-1 px-2 py-1.5">
      <span className="lbl text-[9px] text-dim">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={ariaLabel ?? label}
        onClick={() => onChange(!value)}
        className={`relative h-4 w-8 shrink-0 justify-self-start border transition-colors ${
          value ? 'border-fire/60 bg-fire/[0.18]' : 'border-wire bg-void/60'
        }`}
      >
        <span
          className={`absolute top-[1px] size-[12px] transition-all ${
            value ? 'left-[15px] bg-fire' : 'left-[1px] bg-ghost'
          }`}
          style={value ? { boxShadow: '0 0 6px color-mix(in srgb, var(--fire) 70%, transparent)' } : undefined}
        />
      </button>
      <span className={`lbl text-right text-[9px] ${value ? 'text-fire glow-fire' : 'text-ghost'}`}>
        {value ? 'ON' : 'OFF'}
      </span>
    </div>
  )
}

function ParamSlider({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  precision = 0,
  onChange,
}: {
  label: string
  ariaLabel?: string
  value: number
  min: number
  max: number
  step: number
  precision?: number
  onChange: (value: number) => void
}) {
  const name = ariaLabel ?? label
  const displayValue = precision > 0 ? value.toFixed(precision) : String(value)
  return (
    <label className="grid grid-cols-[92px_minmax(0,1fr)_54px] items-center gap-2 border border-wire bg-fill-1 px-2 py-1.5">
      <span className="lbl text-[9px] text-dim">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={name}
        aria-valuetext={displayValue}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 accent-[var(--life)]"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={precision > 0 ? value.toFixed(precision) : value}
        aria-label={name}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full border border-wire bg-void/60 px-1 py-0.5 text-right text-[10px] tabular-nums text-ink outline-none transition-colors focus:border-life/50"
      />
    </label>
  )
}

function FoodRow({
  kind,
  weight,
  energy,
  radius,
  onWeight,
  onEnergy,
  onRadius,
}: {
  kind: FoodKind
  weight: number
  energy: number
  radius: number
  onWeight: (value: number) => void
  onEnergy: (value: number) => void
  onRadius: (value: number) => void
}) {
  return (
    <>
      <span className="lbl self-center text-[9px] text-dim">{kind.toUpperCase()}</span>
      <TinyNumber value={weight} min={0} max={1} step={0.01} precision={2} ariaLabel={`${kind} weight`} onChange={onWeight} />
      <TinyNumber value={energy} min={1} max={120} step={1} ariaLabel={`${kind} energy`} onChange={onEnergy} />
      <TinyNumber value={radius} min={0.5} max={8} step={0.1} precision={1} ariaLabel={`${kind} radius`} onChange={onRadius} />
    </>
  )
}

function TinyNumber({
  value,
  min,
  max,
  step,
  precision = 0,
  ariaLabel,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  precision?: number
  ariaLabel?: string
  onChange: (value: number) => void
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={precision > 0 ? value.toFixed(precision) : value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(Number(event.target.value))}
      className="min-w-0 border border-wire bg-void/60 px-1 py-0.5 text-right text-[10px] tabular-nums text-ink outline-none transition-colors focus:border-life/50"
    />
  )
}

function ColumnLabel({ children }: { children: string }) {
  return <span className="lbl text-center text-[8px] text-ghost">{children}</span>
}
