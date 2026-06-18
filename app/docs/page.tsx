import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Docs',
  description:
    'How to read the Primordial simulation: genome traits, how organisms are drawn, food kinds, mouse and keyboard controls, the lab parameters, every readout in the stats panel, and the telemetry states.',
  alternates: { canonical: '/docs' },
}

const TRAITS: [string, string][] = [
  ['SPEED', 'Faster movement, higher metabolic cost.'],
  ['SIZE', 'Bigger eat radius and food access, slower and costlier.'],
  ['VISION', 'Sees food and predators from farther away.'],
  ['EFFICIENCY', 'Extracts more energy per meal.'],
  ['FERTILITY', 'Reproduces sooner and more often.'],
]

// Mirrors the canvas legend: each trait reads twice — by hue and by halo style —
// so the dominant trait survives without color vision.
const ENCODING: [string, string][] = [
  ['hue', 'Five maximally-separated colors, one per trait. The color mutes toward grey as an organism gets less specialized.'],
  ['halo style', 'Solid, dotted, dashed, double, or thick border — a second, non-chromatic cue for the same dominant trait.'],
  ['size', 'Drawn radius tracks the SIZE trait; predators read larger and warmer than prey.'],
]

const FOODS: [string, string][] = [
  ['small', 'Common, low energy.'],
  ['lean', 'Rewards energy-efficient genomes.'],
  ['rich', 'High energy, rewards vision/speed.'],
  ['dense', 'Highest energy, needs a large eat radius.'],
]

const MOUSE: [string, string][] = [
  ['drag', 'Pan the view.'],
  ['scroll', 'Zoom toward the cursor.'],
  ['click', 'Select an organism to inspect its genome and brain.'],
  ['speed bar', '0.25×–4× run rate, or MAX to fast-forward under a frame budget.'],
]

const KEYS: [string, string][] = [
  ['↑ ↓ ← →', 'Pan the viewport.'],
  ['+ / −', 'Zoom in and out.'],
  ['N / P', 'Cycle to the next / previous organism, centering on it.'],
  ['Esc', 'Clear the current selection.'],
]

const LAB: [string, string][] = [
  ['populations', 'Initial and max prey, starting predators — the carrying capacity the cycle settles under.'],
  ['food', 'Initial amount, cap, spawn rate, and per-kind weight / energy / radius profiles.'],
  ['mutation', 'Per-gene mutation rate driving how fast lineages drift.'],
  ['energy', 'Starting energy, decay per tick, and the base reproduction threshold.'],
  ['allow extinct', 'Removes the anti-extinction floors so a population can actually collapse. Toggle, then APPLY + RESTART.'],
  ['seed', 'Fix it for a bit-for-bit reproducible run, or leave it AUTO for a fresh world.'],
]

// ── Stats panel readouts, grouped by the panel's own sections ──

const STATS_CHART: [string, string][] = [
  ['NOW / AVG / PEAK', 'Current, windowed-average, and all-time-peak population, in the cards above the scope.'],
  ['scope tabs', 'Plot one metric over the last 32 samples — POP, PRD (predators), FIT, NRG, AGE, MAX. Any underlined readout below also graphs itself when clicked.'],
  ['MIN / MAX / Δ', 'Range of the plotted window and the latest change: RISING, FALLING, or STABLE.'],
  ['BIRTHS / DEATHS', 'Births vs deaths in the recent window, with the net.'],
  ['ECO STATE', 'The current telemetry phrase plus a one-line ecosystem description (see Telemetry states).'],
]

const STATS_SIM: [string, string][] = [
  ['CURRENT POP', 'Living prey right now.'],
  ['PEAK POP', 'Highest prey population reached this run.'],
  ['GENERATION', 'Deepest ancestral generation reached — offspring increment their parent’s.'],
  ['ELAPSED', 'Simulation time in seconds (sim time, not wall-clock — it scales with speed).'],
  ['BIRTHS / DEATHS', 'Cumulative totals since the run started.'],
  ['AVG FITNESS', '“Fitness” here is an observation, not an input — the mean of each prey’s accumulated energy/survival over its life. Nothing breeds the top scorer; it just tracks how the population is doing.'],
  ['AVG / MAX AGE', 'Mean and oldest current age, in ticks.'],
  ['AVG ENERGY', 'Mean energy reserve of living prey.'],
  ['MUTATIONS', 'Cumulative mutation events applied at birth.'],
]

const STATS_PRED: [string, string][] = [
  ['PREDATORS', 'Living predators right now.'],
  ['PRED PEAK', 'Highest predator population this run.'],
  ['PRED BIRTHS / DEATHS', 'Cumulative predator totals.'],
  ['PRED NET', 'Recent predator births minus deaths.'],
  ['PRED FITNESS', 'Mean accumulated fitness across predators — same observational caveat as prey.'],
  ['PREDATIONS', 'Cumulative successful hunts.'],
  ['PRED RECENT', 'Hunts in the recent window.'],
]

const STATS_GENOME: [string, string][] = [
  ['POPULATION BIAS', 'The dominant trait profile of the prey gene pool (e.g. speed-leaning vs balanced/mixed).'],
  ['BIAS SHIFT', 'Whether that bias is holding or drifting, given current diversity.'],
  ['SPECIALIZATION', 'How specialized vs mixed the dominant profile is.'],
  ['VARIANTS', 'Count of distinct prey genomes alive.'],
  ['DIVERSITY', 'Genetic spread — RMS standard deviation of traits across the prey population. 0 means clones.'],
  ['AVG SPD…SIZ', 'Population mean of each genome trait (speed, vision, efficiency, reproduction, size), each in [0,1].'],
]

const STATS_ECO: [string, string][] = [
  ['CURRENT STATE', 'The ecosystem descriptor, e.g. “stable equilibrium” or “ecosystem collapsed”.'],
  ['RECENT NET', 'Births minus deaths in the recent window — the short-term population trend.'],
  ['CRITICAL ENERGY', 'Prey currently starving (below a quarter of their max energy).'],
  ['RESOURCE PRESSURE', 'Composite scarcity index, 0–100%: blends the share of starving prey with how empty the food field is.'],
  ['FOOD COVERAGE', 'Current food as a fraction of the food cap.'],
]

const STATS_RESOURCE: [string, string][] = [
  ['LIVE', 'Uneaten food of this kind on the map.'],
  ['RCNT', 'Eaten in the recent window.'],
  ['EATEN', 'Cumulative eaten this run.'],
  ['NRG', 'Cumulative energy delivered by this kind.'],
]

const STATES: [string, string][] = [
  ['GROWTH PHASE', 'Births clearly outpacing deaths.'],
  ['STABILITY', 'Births and deaths roughly balanced.'],
  ['DIE-OFF', 'Deaths outpacing births.'],
  ['MUTATION RESCUE', 'Low diversity triggering a mutation-rate boost.'],
  ['EXTINCTION RISK', 'Resource pressure critically high.'],
  ['EXTINCTION', 'No organisms remain.'],
]

export default function DocsPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between border-b border-wire pb-4">
        <span className="glow-soft text-[15px] font-semibold lowercase tracking-[0.08em] text-ink">primordial</span>
        <Link href="/" className="lbl text-[11px] text-dim no-underline hover:text-ink">← back to sim</Link>
      </header>

      <article className="flex flex-col gap-8 text-[13px] leading-relaxed text-ghost">
        <div className="flex flex-col gap-3">
          <h1 className="text-[20px] font-semibold text-ink">How to read the simulation</h1>
          <p>
            Nothing here is scripted. You&rsquo;re watching energy, age, and selection act on a
            population of genomes — this page is just the legend for what&rsquo;s on screen and the
            dials you can turn while it runs.
          </p>
        </div>

        <Section title="Genome traits">
          {TRAITS.map(([k, v]) => <Row key={k} k={k} v={v} />)}
        </Section>

        <Section title="Reading an organism">
          {ENCODING.map(([k, v]) => <Row key={k} k={k} v={v} />)}
        </Section>

        <Section title="Food kinds">
          {FOODS.map(([k, v]) => <Row key={k} k={k} v={v} />)}
        </Section>

        <Section title="Controls — mouse">
          {MOUSE.map(([k, v]) => <Row key={k} k={k} v={v} />)}
        </Section>

        <Section title="Controls — keyboard">
          {KEYS.map(([k, v]) => <Row key={k} k={k} v={v} mono />)}
        </Section>

        <Section title="Lab parameters">
          {LAB.map(([k, v]) => <Row key={k} k={k} v={v} />)}
        </Section>

        <div className="flex flex-col gap-3 border-t border-wire pt-8">
          <h2 className="text-[15px] font-semibold text-ink">Reading the stats panel</h2>
          <p>
            The panel on the right is the instrument readout — every number is measured off the live
            world, not configured. Click a metric tab or any underlined row to plot it on the scope.
          </p>
        </div>

        <Section title="Population / time">
          {STATS_CHART.map(([k, v]) => <Row key={k} k={k} v={v} wide />)}
        </Section>

        <Section title="Simulation">
          {STATS_SIM.map(([k, v]) => <Row key={k} k={k} v={v} wide />)}
        </Section>

        <Section title="Predators">
          {STATS_PRED.map(([k, v]) => <Row key={k} k={k} v={v} wide />)}
        </Section>

        <Section title="Genome pool">
          {STATS_GENOME.map(([k, v]) => <Row key={k} k={k} v={v} wide />)}
        </Section>

        <Section title="Ecosystem">
          {STATS_ECO.map(([k, v]) => <Row key={k} k={k} v={v} wide />)}
        </Section>

        <Section title="Resource types" intro="A per-food-kind table — one row each for small, lean, rich, dense:">
          {STATS_RESOURCE.map(([k, v]) => <Row key={k} k={k} v={v} wide />)}
        </Section>

        <Section
          title="Environment"
          intro="A read-only echo of the config the current run started with — SEED, WORLD size, MUT RATE, INIT POP, INIT / MAX FOOD, E DECAY, INIT ENERGY, REPRO BASE, and TEMP. Change any of them in Lab parameters, then APPLY + RESTART to start a new run with them."
        />

        <Section title="Telemetry states">
          {STATES.map(([k, v]) => <Row key={k} k={k} v={v} wide />)}
        </Section>

        <Link href="/about" className="lbl text-[12px] text-dim no-underline hover:text-ink">
          → about the evolutionary mechanics
        </Link>
      </article>
    </main>
  )
}

function Section({ title, intro, children }: { title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="lbl text-[12px] text-life">{title}</h2>
      {intro && <p className="text-ghost">{intro}</p>}
      {children && <dl className="flex flex-col gap-1.5">{children}</dl>}
    </section>
  )
}

function Row({ k, v, mono, wide }: { k: string; v: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt
        className={`shrink-0 text-[11px] text-ink ${wide ? 'w-36' : 'w-24'} ${mono ? 'tabular-nums tracking-[0.04em]' : 'lbl'}`}
      >
        {k}
      </dt>
      <dd className="min-w-0 text-ghost">{v}</dd>
    </div>
  )
}
