interface Props {
  generation: number
  elapsed: number
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'EXTINCT'
  seedLabel: string
}

export default function Header({ generation, elapsed, status, seedLabel }: Props) {
  const gen = String(generation).padStart(4, '0')
  const time = elapsed.toFixed(3)

  return (
    <header
      className="col-span-full flex items-stretch border-b border-wire"
      style={{ animation: 'reveal 0.25s ease forwards' }}
    >
      {/* ── Logo ── */}
      <div className="flex items-center gap-2.5 px-5 border-r border-wire">
        <div
          className="animate-pulse-cell size-[7px] bg-life shrink-0"
          style={{ boxShadow: '0 0 8px rgba(0,255,136,0.7), 0 0 2px rgba(0,255,136,1)' }}
        />
        <span className="glow-soft text-ink text-[14px] tracking-[0.08em] font-semibold lowercase">
          primordial
        </span>
      </div>

      {/* ── Simulation path ── */}
      {/* The flex-1 container stays as a spacer so the nav holds the right edge;
          its segments collapse on narrow screens where they'd overflow (the same
          readouts live in the control bar and stats panel). */}
      <div className="flex flex-1 items-center px-5 gap-0">
        <div className="flex items-center gap-0 max-[860px]:hidden">
          <BreadSegment label="SIM" value="001" />
          <Sep />
          <BreadSegment label="GEN" value={gen} />
          <Sep />
          <BreadSegment label="T" value={time} unit="s" />
          <Sep />
          <BreadSegment label="SEED" value={seedLabel} />
          <Sep />
          <StatusChip state={status} />
        </div>
      </div>

      {/* ── Navigation ── */}
      <div className="flex items-stretch border-l border-wire">
        <NavLink href="/docs">DOCS</NavLink>
        <NavLink href="/about" last>ABOUT</NavLink>
      </div>
    </header>
  )
}

/* ── Sub-components ── */

function Sep() {
  return (
    <span className="text-foreground/10 mx-2.5 text-[11px] select-none">
      /
    </span>
  )
}

function BreadSegment({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit?: string
}) {
  return (
    <span className="flex items-baseline gap-1.5 text-[12px]">
      <span className="lbl text-ghost text-[10px]">{label}</span>
      <span className="text-ink tracking-[0.04em] tabular-nums">
        {value}
        {unit && <span className="text-ghost ml-px">{unit}</span>}
      </span>
    </span>
  )
}

function StatusChip({ state }: { state: 'IDLE' | 'RUNNING' | 'PAUSED' | 'EXTINCT' }) {
  const dot =
    state === 'RUNNING' ? 'bg-life' :
    state === 'EXTINCT' ? 'bg-fire' :
    'bg-ghost'

  const text =
    state === 'RUNNING' ? 'text-life' :
    state === 'EXTINCT' ? 'text-fire' :
    'text-dim'

  const animated = state === 'RUNNING' ? 'animate-pulse-cell' : state === 'IDLE' ? 'animate-blink' : ''

  const glow =
    state === 'RUNNING' ? 'glow-life' :
    state === 'EXTINCT' ? 'glow-fire' :
    ''

  const dotGlow =
    state === 'RUNNING' ? '0 0 6px color-mix(in srgb, var(--life) 90%, transparent)' :
    state === 'EXTINCT' ? '0 0 6px color-mix(in srgb, var(--fire) 80%, transparent)' :
    undefined

  return (
    <span className={`lbl flex items-center gap-1.5 text-[11px] ${text} ${glow}`}>
      <span
        className={`${animated} inline-block size-[5px] ${dot}`}
        style={dotGlow ? { boxShadow: dotGlow } : undefined}
      />
      {state}
    </span>
  )
}

function NavLink({ href, children, last }: { href: string; children: React.ReactNode; last?: boolean }) {
  return (
    <a
      href={href}
      className={`lbl flex items-center px-4 text-[11px] text-dim hover:text-ink hover:bg-fill-2 transition-colors duration-100 no-underline border-r border-wire ${last ? 'border-r-0' : ''}`}
    >
      {children}
    </a>
  )
}
