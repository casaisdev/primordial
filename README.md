# Primordial

A Darwinian artificial-life sim that runs in your browser. Digital organisms are born, eat, flee, hunt, breed, and die — in real time, with no script and no win state. There's a genome, an environment, and selection. Everything else (population cycles, trait drift, specialization, collapse) is emergent. I didn't write any of those behaviors; they fall out of the rules.


https://github.com/user-attachments/assets/bc520f92-00b8-4abd-b69d-7bfcc4886053


<p align="center">
  <a href="https://primordial.martincasais.com"><b>▶ Live (the real thing, not a recording) → primordial.martincasais.com</b></a>
</p>

---

## What you can do

It's a living ecosystem you can watch and poke at, not a recording:

- **Watch it run.** Prey and predators forage, flee, hunt, breed and die on a canvas that paints entirely off the main thread — at 0.25×–4×, or a wall-clock-budgeted MAX fast-forward.
- **Tune it live.** Mutation rate, food supply and per-kind profiles, energy decay, population caps and an *allow-extinction* switch all take hold on the next run, straight from the LAB panel.
- **Inspect any organism.** Click one to open its genome and the phenotype it derives — the actual move speed, vision, eat radius and energy economy those traits buy it.
- **Read the population.** ~40 telemetry readouts — population and predator cycles, genetic diversity, trait drift, resource pressure, per-food consumption — over an oscilloscope you can aim at any metric.
- **Replay it exactly.** Fix the seed and the whole run is bit-for-bit reproducible; leave it on AUTO for a fresh world each time.
- **Drive it however.** Mouse or full keyboard control on desktop; on a phone it still runs, with the controls pinned in reach.

New here? The in-app **[docs](https://primordial.martincasais.com/docs)** are the legend for every trait, control and readout, and **[about](https://primordial.martincasais.com/about)** is the honest account of the mechanics.

## Contents

[The one idea](#the-one-idea) · [Inside an organism](#whats-actually-in-an-organism) · [The hunting brain](#the-hunting-brain-and-the-bug-that-defined-the-design) · [The tuning war](#the-tuning-war-or-how-i-spent-most-of-my-time) · [Determinism](#determinism-which-im-a-little-proud-of) · [Performance](#performance-it-all-runs-off-the-main-thread) · [Reading the world](#reading-the-world) · [The browser stuff](#the-browser-stuff-done-properly) · [Architecture](#architecture) · [Tests](#tests) · [Tech stack](#tech-stack) · [Getting started](#getting-started) · [Scripts](#scripts) · [Configuration](#configuration) · [Deploy](#deploy)

---

## The one idea

There is **no fitness function**. Nothing in the code scores an organism and breeds the winners. Organisms that happen to gather enough energy cross a reproduction threshold and spawn a mutated child; organisms that run out of energy or hit their lifespan die. That's it. "Fitness" is just whatever survives long enough to reproduce — an *observation*, not an input.

This sounds like a small distinction. It's the whole project. The moment you add a fitness function you're doing optimization with extra steps. Take it away and you have to make an actual ecology balance on its own, which turns out to be a much harder and more interesting engineering problem (see [the tuning war](#the-tuning-war-or-how-i-spent-most-of-my-time) below).

## What's actually in an organism

Each one carries:

- **Five physical traits**, each a dial in `[0,1]`: `speed`, `size`, `vision`, `energyEfficiency`, `reproductionRate`. These aren't free — they're spent against a budget (`Genome.ts`), so an organism can't max everything. Fast *and* big *and* far-seeing means it burns energy and starves. Selection has to find tradeoffs, not a global maximum.
- **A 50-weight neural network**: 5→6→2, fully connected, `tanh` activations (`Brain.ts`). Inputs are normalized perceptions (distance/angle to nearest food, own energy, local crowding, age); outputs are turn and speed. The whole genome — traits *and* all 50 weights — mutates and is inherited.

Traits map to a **phenotype** (`Organism.ts`) via a pile of hand-tuned relationships: speed costs energy quadratically, size buys eat-radius but slows you down, vision widens your query radius but costs upkeep, and so on. Phenotype is computed once and cached — it's immutable after birth, so recomputing it every tick was pure waste.

## The hunting brain, and the bug that defined the design

Two species share the world. Prey forage; predators hunt prey. This is where I lost the most time and learned the most.

**First attempt:** give predators the same deal as prey — a neural net, pure brain-evolved hunting, let selection sort it out. It collapsed every time. The failure mode has a name: **mutational meltdown**. Hunting is a predator's *only* food source, so a slightly-worse mutated brain means a slightly-worse hunter means starvation — before selection can lock in the good brains. Each generation hunted marginally worse than the last and the lineage died. The predator population just faded out, leaving prey pinned at the population cap. No cycle, no coevolution, nothing.

**The fix is structural, not numerical.** Hunting is now **hybrid** (`Organism.ts`): a hard-coded pursuit heuristic (turn toward and sprint at the nearest visible prey) is the *floor*, and the evolved brain only **modulates** it — bounded to roughly ±15% on turn and ±20% on sprint speed. So even a brain wrecked by mutation still hunts at the proven baseline; a *good* brain refines the chase (leading the target, intercept angles, sprint-effort allocation). Hunting can only ever improve on the floor, never start below it on injected noise.

Two more knobs came out of this:

- Predator brain weights mutate **4× gentler** than prey (`PREDATOR_BRAIN_MUTATION_SCALE = 2` vs the prey default `8`). Same number of RNG draws — only the perturbation magnitude shrinks — so determinism is untouched.
- A rescued/seeded predator with no good ancestor gets a **zeroed brain**, which means `tanh(0) = 0` modulation, which means it starts at *exactly* the heuristic. The proven floor, by construction.

Prey got the inverse problem solved the easy way: a hard-coded flee override. If a predator is in sight, drop foraging and sprint directly away. Fast/aware prey escape, slow/blind prey get eaten — so predation directly selects prey speed and vision, and the two species coevolve.

## The tuning war (or: how I spent most of my time)

A predator-prey system with no fitness function and hard population caps wants to do one of two boring things: **prey pin to the cap forever**, or **everything goes extinct**. Getting a *sustained limit cycle* — the classic Lotka-Volterra boom/bust that recovers instead of diverging — took a stack of mechanisms that all have to cooperate (`World.ts`):

- **Density-dependent births, not a hard ceiling.** Prey birth probability tapers as `1 − crowd³`, so the population settles *below* `maxPopulation` and oscillates instead of slamming into the cap and freezing.
- **Senescence.** Without a finite lifespan, abundant food makes organisms immortal, the genome pool freezes, and you get a dead "stable equilibrium" with no turnover and no selection. Every organism gets a randomized max age (triangular spread, so cohorts die *out of phase* rather than in waves), which keeps selection running.
- **Predators breed first, gated by their own energy.** They must keep catching prey to reproduce, plus a hard ratio cap (predators ≤ 28% of prey). Reproduction order matters: if prey at the cap exhaust the per-tick birth budget first, predators never breed and the cycle dies.
- **Hunting→reproduction coupling.** A decaying recent-catch signal (`huntScore`) shortens a predator's breeding cooldown, so a prolific hunter breeds in *bursts* and out-reproduces drift. This is what lets selection for good hunting actually win against the (gentle) brain mutation.
- **Anti-extinction floors.** If either species crashes toward zero, a handful of immigrants appear — but they're **lightly-mutated clones of the fittest survivor**, not fresh random genomes, so a deep crash becomes a *trough the cycle recovers from* without throwing away the selection that the bottleneck just applied. Toggle **allow extinction** in the UI to disable the floors and watch it genuinely collapse.

None of these numbers are documented anywhere except in the comments next to them, because every one of them is the result of watching a run fail and adjusting. That's the honest state of it.

## Determinism, which I'm a little proud of

Seed the PRNG and the **entire run replays bit-for-bit** — not just the stats, the whole snapshot. Things that had to be true for that to hold:

- Every random draw in the core flows through one seeded `mulberry32` stream. The only `Math.random` is the one that *picks* a seed when you don't supply one.
- ID counters live on the `World` instance, not module globals, so two worlds with the same seed assign identical organism/food IDs.
- `init()` is the single source of truth for every derived counter, covering both construction and `reset()` — so the two paths can't drift (a counter reset in only one place silently broke replay once; now they can't).
- Refactors that change perturbation *magnitude* (like the gentler predator brain) keep the *number* of draws identical, so they don't desync the stream.

There's a dedicated reproducibility test suite that runs two seeded worlds in lockstep and asserts the snapshots match.

## Performance: it all runs off the main thread

The simulation and the renderer live entirely in a **Web Worker** painting a transferred **`OffscreenCanvas`** (`sim.worker.ts`). The main thread only forwards input events and receives a slim `ViewState` for the React HUD — the per-frame organism/food/density arrays never cross the worker boundary. The hook probes for `OffscreenCanvas`/`Worker` support and shows a clear message instead of a dead black canvas on browsers that lack it.

The hot path (hundreds of organisms × thousands of food, every tick) is allocation-obsessed:

- **Uniform-grid spatial hash** for neighbor/food/predator lookups (`SpatialGrid.ts`), rebuilt *in place* every tick — integer cell keys (string keys were allocating ~40k short-lived strings per tick) and a single reused scratch array per query.
- **Squared-distance everywhere**, one `sqrt` at the end of a scan instead of per-candidate.
- **Vision-sized queries**: a low-vision prey scans a small radius, not a fixed worst-case. Food queries are additionally capped, since food is dense enough that a huge scan buys no behavioral gain.
- **Cached phenotypes**, **reused brain scratch buffer**, **ring-buffer population history** shifted in place — the steady-state tick allocates almost nothing.
- **MAX speed** fast-forwards under a wall-clock budget: run many ticks per frame, pay the snapshot+repaint cost once.

The renderer also has level-of-detail backoff — when organisms would overlap into "soup," detail drops so the frame stays cheap.

## Reading the world

A pure **telemetry layer** (`telemetry.ts`) turns aggregate population numbers into the phrases the UI shows — `GROWTH PHASE`, `DIE-OFF`, `MUTATION RESCUE`, `EXTINCTION RISK`, etc. It holds no simulation state, so each function is unit-testable in isolation without stepping a `World`. The same diversity threshold that drives the `MUTATION RESCUE` label also triggers the adaptive mutation-rate boost in the sim — shared constant, so the label and the behavior can't disagree.

On the canvas, an organism's **dominant trait is encoded twice**: by hue (five maximally-separated colors) *and* by halo border style (solid/dotted/dashed/double/thick), so the trait survives without color vision. The hue mutes toward neutral grey as the organism's specialization weakens.

That data drives three surfaces you actually operate. The **stats panel** stacks the ~40 readouts into labelled groups — simulation, predators, genome pool, ecosystem, resource types, environment — over a live oscilloscope you can point at population, fitness, age or energy. The **LAB panel** is where you edit the world and restart it. And clicking a creature opens the **organism inspector** — its genome and the phenotype it derives, traits ranked by dominance. The full legend is in the in-app [docs](https://primordial.martincasais.com/docs).

## The browser stuff, done properly

A toy in spirit, not in build quality:

- **Responsive, with an honest heads-up.** The instrument is laid out for a desktop viewport. On a phone it still runs, the control bar pins to the bottom so START and the speed selector stay in thumb reach, and a dismissible notice says so up front instead of pretending.
- **Keyboard-drivable and screen-reader-aware.** The canvas is a focusable ARIA application — arrows pan, `+`/`−` zoom, `N`/`P` cycle organisms, `Esc` clears the selection. Every control is labelled, a polite live region narrates the ecosystem state, focus rings show only for keyboard users, and `prefers-reduced-motion` stills the ambient drift.
- **SEO and PWA, prerendered.** Per-route metadata with canonical URLs, a generated Open Graph image, sitemap, robots and a web manifest — all static.
- **Hardened headers.** A tailored CSP plus HSTS, `X-Frame-Options`, `Referrer-Policy` and the rest, on every route (`next.config.ts`).
- **Green on every push.** CI runs lint → typecheck → unit tests → build → e2e smoke.

## Architecture

The sim core is **framework-free, deterministic TypeScript** with zero UI or React dependencies. That's what makes it both unit-testable and reproducible — the whole point of the split.

```
sim/                 Simulation core (no framework, deterministic)
  World.ts           Tick loop, selection, spawning, cycle-stabilizing floors
  Organism.ts        Energy, movement, hybrid hunting, senescence, reproduction
  Genome.ts          Traits + 50 brain weights, budget rebalancing, mutation
  Brain.ts           5→6→2 tanh forward pass (allocation-free)
  Food.ts            Food kinds, spawning, energy profiles
  SpatialGrid.ts     Uniform-grid spatial hash, rebuilt in place per tick
  density.ts         Resource/organism density fields
  types.ts           Shared types + DEFAULT_CONFIG / CONFIG_BOUNDS (single source)
  telemetry.ts       Pure number → label layer (independently testable)
  stepCadence.ts     Pure speed→ticks-per-frame accumulator (testable)
  render.ts          Canvas painting + LOD (runs against OffscreenCanvas)
  sim.worker.ts      Owns the World, camera, hit-testing, render loop
  protocol.ts        Worker ↔ main-thread message types
  __tests__/         Vitest suites — see below

hooks/
  useSimulation.ts   React bridge: sends commands, reads per-frame ViewState

components/sim/       UI — SimShell, SimCanvas, StatsPanel, ControlBar,
                     LabParameters, OrgInspector, Header, MobileNotice
app/                 App Router pages (sim · /docs · /about) + SEO/PWA
                     (sitemap, robots, manifest, OG image, canonical)
e2e/                 Playwright smoke suite (production build, headless Chromium)
```

## Tests

61 tests across 13 files. The interesting ones aren't "does add() add" — they're properties that have to hold for the whole thing to be trustworthy:

- **`world.reproducibility`** — two seeded worlds stay bit-identical across many ticks.
- **`world.no-extinction`** — with the floors on, the ecosystem survives long runs; with `allowExtinction`, it's allowed to die.
- **`world.predator-cycle`** — predators establish and sustain a population (the thing that took the whole hunting redesign to achieve).
- **`world.invariants`** — energy/population/ID invariants never violated mid-run.
- Plus focused units for genome budgeting, brain forward pass, spatial grid, telemetry labels, the cadence accumulator, and RNG.

On top of the Vitest sim suites, a small **Playwright smoke suite** (`e2e/`, 6 checks) drives the production build in headless Chromium — the App Router pages render, the worker-backed sim boots and starts, `/docs` and `/about` navigate, the LAB *allow-extinction* toggle works, and the mobile desktop-notice shows, dismisses and stays dismissed. It covers the UI/worker layers the node-environment unit tests can't reach.

CI (`.github/workflows/ci.yml`) runs lint → typecheck → unit tests → build → e2e smoke on every push and PR.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack) + [React 19](https://react.dev)
- TypeScript, strict
- [Tailwind CSS v4](https://tailwindcss.com)
- [Vitest](https://vitest.dev) for the sim suites, [Playwright](https://playwright.dev) for the e2e smoke
- Web Worker + `OffscreenCanvas` for off-main-thread sim & render

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Hit **Start**, then tune the lab parameters while it runs — mutation rate, food supply, energy decay, population caps, and the *allow extinction* switch are all live.

## Scripts

| Command                 | What it does               |
| ----------------------- | -------------------------- |
| `npm run dev`           | Dev server                 |
| `npm run build`         | Production build           |
| `npm run start`         | Serve the production build |
| `npm run lint`          | ESLint                     |
| `npm run typecheck`     | `tsc --noEmit`             |
| `npm test`              | Vitest sim suites          |
| `npm run test:coverage` | Unit tests with coverage   |
| `npm run test:e2e`      | Playwright smoke (Chromium)|

## Configuration

- `NEXT_PUBLIC_SITE_URL` overrides the canonical base URL used for metadata, sitemap, and Open Graph tags. Defaults to the production URL.
- Security headers (CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) are set in `next.config.ts` and apply to every route.
- Sim defaults and the user-tunable bounds live in `sim/types.ts` (`DEFAULT_CONFIG`, `CONFIG_BOUNDS`) — the lab UI and config validation read from the same place so they can't drift.

## Deploy

Standard Next.js app, output is fully static (all routes prerendered), so it runs anywhere. [Vercel](https://vercel.com/new) is the path of least resistance.

---

Built in the open. If you watch a run do something I didn't describe here, that's the point — file it, I want to know.
