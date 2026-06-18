import type {
  SimConfig,
  WorldSnapshot,
  GenomeData,
  PhysicalTraits,
  FoodKind,
  FoodKindCounts,
  RecentEventSnapshot,
} from './types'
import { DEFAULT_CONFIG, TRAIT_KEYS, FOOD_KINDS } from './types'
import { randomGenome, mutate, genomeKey } from './Genome'
import { Organism } from './Organism'
import { Food } from './Food'
import { mulberry32, type Rng } from './rng'
import { SpatialGrid } from './SpatialGrid'
import { buildDensityField } from './density'
import {
  analyzeGeneticSignal,
  describeDominantDrift,
  describeEcosystemState,
  describeTelemetryState,
  DIVERSITY_THRESHOLD,
} from './telemetry'

const POP_HISTORY_LEN = 32
const NEIGHBOR_RADIUS = 100
const NEIGHBOR_RADIUS_SQ = NEIGHBOR_RADIUS * NEIGHBOR_RADIUS
const EVENT_WINDOW_TICKS = 80
const EVENT_CAP = 96
const ADAPTIVE_MUT_MULTIPLIER = 4
const SPATIAL_CELL_SIZE = 128
const PREY_QUERY_RADIUS = 540
// Food is dense (nearest is typically ~50u away), so there's no behavioural gain
// from a high-vision prey scanning a huge radius — cap the food query to keep the
// hot path cheap. Prey still flee predators across their full vision range.
const FOOD_QUERY_CAP = 170
const ECO_GRACE_TICKS = 600          // early food-spawn boost so prey can establish
const PREDATOR_INTRO_TICKS = 1200
// The predator rescue kickstarts a re-bloom ONLY when prey are abundant but
// predators have crashed low — so after a deep trough predators reliably recover
// instead of fading out (which would leave prey pinned at the cap). It stays
// silent during prey troughs (prey < threshold), so it can't lock the cycle's
// low phase. Together with the prey floor this turns a divergent oscillation
// into a sustained limit cycle that never goes extinct.
const PREDATOR_PREY_THRESHOLD = 250
const PREDATOR_RESCUE_FLOOR = 8
const PREDATOR_PREY_RATIO = 0.28
// Prey anti-extinction floor: a handful of immigrant prey appear if the
// population is crashing toward zero. This bounds the predator-prey cycle's
// downside so a deep crash can't terminate the ecosystem — the cycle restarts
// instead. Mirrors the predator rescue floor; keeps both species ever-present.
const PREY_RESCUE_FLOOR = 18
const PREDATOR_INTRO_INTERVAL = 200
const OFFSPRING_SPAWN_RADIUS = 28
// A predator starts (and is rescued) below its reproduction threshold so it must
// hunt before breeding: initialEnergy * this ratio (≈120 at the default 280).
const PREDATOR_START_ENERGY_RATIO = 0.6
// Energy a parent spends per birth = child energy × (base + reproductionRate·scale).
const REPRO_PARENT_COST_BASE = 1.08
const REPRO_PARENT_COST_REPRO_SCALE = 0.24
const TICK_SECONDS = 0.01   // simulated seconds per tick, for the elapsed readout
// Predator brain weights mutate FAR gentler than prey (default 8): hunting is a
// predator's only food source, so a high churn rate shreds a good hunter before
// selection can preserve it (mutational meltdown). The draw count is unchanged,
// so determinism holds — only the perturbation magnitude shrinks.
const PREDATOR_BRAIN_MUTATION_SCALE = 2

export class World {
  private organisms: Organism[] = []
  private foods: Food[] = []
  private config: SimConfig

  // Spatial hashes are allocated once and rebuilt in place each tick (rebuild
  // empties and refills the same buckets) instead of allocating three fresh
  // Maps + bucket arrays per tick.
  private readonly preyGrid = new SpatialGrid<Organism>(SPATIAL_CELL_SIZE)
  private readonly foodGrid = new SpatialGrid<Food>(SPATIAL_CELL_SIZE)
  private readonly predGrid = new SpatialGrid<Organism>(SPATIAL_CELL_SIZE)

  // Seeded PRNG: every random draw in the sim flows through this so a run is fully
  // reproducible from `seed`. When config.seed is omitted we derive a random seed
  // once (the only Math.random in the core) so default runs still differ.
  private readonly seed: number
  private rng: Rng

  // Per-World id counters. They live on the instance (not module globals) so two
  // Worlds with the same seed assign identical organism/food ids — making whole
  // snapshots bit-identical, not just the derived stats. Reset in init().
  private nextOrganismId = 0
  private nextFoodId = 0

  private tickCount = 0
  // Lifetime tally counters grouped into one struct (reset together in init(), so
  // they can't drift) rather than ~10 loose fields.
  private metrics: SimMetrics = emptyMetrics()
  private popHistory: number[] = new Array(POP_HISTORY_LEN).fill(0)
  private predatorPopHistory: number[] = new Array(POP_HISTORY_LEN).fill(0)
  private lastDiversity = 1.0
  private recentEvents: RecentEventSnapshot[] = []
  private recentFoodEvents: Array<{ kind: FoodKind; energy: number; tick: number }> = []
  private eatenByKind: FoodKindCounts = emptyFoodCounts()
  private energyEatenByKind: FoodKindCounts = emptyFoodCounts()
  private nextEventId = 0
  private lastDominantLabel = 'NONE'

  constructor(config: SimConfig = DEFAULT_CONFIG) {
    this.config = config
    this.seed = config.seed ?? ((Math.random() * 0x100000000) >>> 0)
    this.rng = mulberry32(this.seed)
    this.init()
  }

  private init() {
    this.organisms = []
    this.foods = []
    this.nextOrganismId = 0
    this.nextFoodId = 0

    const initialPrey = Math.min(this.config.initialPop, this.config.maxPopulation)
    for (let i = 0; i < initialPrey; i++) {
      const spawn = randomWorldPosition(this.config, this.rng)
      this.organisms.push(
        new Organism(
          this.nextOrganismId++,
          spawn.x,
          spawn.y,
          randomGenome(this.rng),
          0,
          this.config.initialEnergy,
          'prey',
          this.rng,
        ),
      )
    }

    const initialPredators = Math.min(this.config.initialPredators ?? 0, Math.max(0, this.config.maxPopulation - initialPrey))
    for (let i = 0; i < initialPredators; i++) {
      const spawn = randomWorldPosition(this.config, this.rng)
      this.organisms.push(
        new Organism(
          this.nextOrganismId++,
          spawn.x,
          spawn.y,
          newPredatorGenome(this.rng),
          0,
          Math.round(this.config.initialEnergy * PREDATOR_START_ENERGY_RATIO),  // below repro threshold, must hunt first
          'predator',
          this.rng,
        ),
      )
    }

    const seedFood = Math.min(this.config.foodCap, Math.max(0, Math.floor(this.config.initialFood)))
    for (let i = 0; i < seedFood; i++) {
      this.foods.push(Food.spawn(this.nextFoodId++, this.config, this.rng))
    }

    // init() is the SINGLE source of truth for every derived counter — covering
    // both construction and reset() — so the two paths can't drift (a counter
    // added to only one used to silently break replay).
    this.tickCount = 0
    this.metrics.deaths = 0
    this.metrics.mutations = 0
    this.metrics.generation = 0
    this.lastDiversity = 1.0
    this.metrics.births = initialPrey
    this.metrics.nextGenBirthMark = Math.max(1, initialPrey * 2)
    this.metrics.peakPopulation = initialPrey
    this.metrics.predatorBirths = 0
    this.metrics.predatorDeaths = 0
    this.metrics.predationCount = 0
    this.metrics.predatorPeakPop = initialPredators
    this.popHistory = new Array(POP_HISTORY_LEN).fill(initialPrey)
    this.predatorPopHistory = new Array(POP_HISTORY_LEN).fill(initialPredators)
    this.recentEvents = []
    this.recentFoodEvents = []
    this.eatenByKind = emptyFoodCounts()
    this.energyEatenByKind = emptyFoodCounts()
    this.nextEventId = 0
    this.lastDominantLabel = 'NONE'
  }

  reset() {
    // Restart the same PRNG stream and rebuild from scratch. init() resets all
    // derived state, so reset() reproduces the original run bit-for-bit.
    this.rng = mulberry32(this.seed)
    this.init()
  }

  tick(): WorldSnapshot {
    this.step()
    return this.buildSnapshot()
  }

  // Advance the simulation one tick WITHOUT building a snapshot. Used by the
  // render loop to run many ticks per frame (2x/4x/MAX) while paying the cost
  // of buildSnapshot() only once, for the frame that actually gets displayed.
  step(): void {
    this.tickCount++

    // Split by species for targeted interactions
    const preyList = this.organisms.filter(o => o.species === 'prey')
    const predList = this.organisms.filter(o => o.species === 'predator')
    const preyGrid = this.preyGrid.rebuild(preyList)
    const foodGrid = this.foodGrid.rebuild(this.foods)
    const predGrid = this.predGrid.rebuild(predList)

    // Prey neighbor counts: only count other prey in radius
    const preyNeighborCounts = new Map<number, number>()
    for (const a of preyList) {
      let count = 0
      for (const b of preyGrid.query(a.x, a.y, NEIGHBOR_RADIUS)) {
        if (a.id === b.id) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        if (dx * dx + dy * dy < NEIGHBOR_RADIUS_SQ) count++
      }
      preyNeighborCounts.set(a.id, count)
    }

    const dead = new Set<number>()    // organism ids starved
    const killed = new Set<number>()  // prey ids caught by predators
    const toReproduce: Organism[] = []
    let hasPredatorRepro = false

    // ── Tick prey ──────────────────────────────────────────────
    for (const org of preyList) {
      // Query only as far as this prey can see. predGrid is tiny (a few dozen
      // predators) so the flee query is cheap; food/predator query results are
      // distinct reused scratch arrays, consumed within tick() before the next
      // iteration. tick() skips already-consumed food via a flag (no filter array).
      const vis = org.visionRadius()
      const nearbyPredators = predGrid.query(org.x, org.y, vis)
      const available = foodGrid.query(org.x, org.y, Math.min(vis, FOOD_QUERY_CAP))
      const result = org.tick(available, this.config, preyNeighborCounts.get(org.id) ?? 0, [], nearbyPredators)

      if (result.eaten) {
        result.eaten.consumed = true
        this.eatenByKind[result.eaten.kind]++
        this.energyEatenByKind[result.eaten.kind] += result.energyGained
        this.recentFoodEvents.push({ kind: result.eaten.kind, energy: result.energyGained, tick: this.tickCount })
      }

      if (result.died) {
        dead.add(org.id)
        this.metrics.deaths++
        this.pushEvent('death', org.x, org.y, 'prey')
      } else if (result.reproduce) {
        toReproduce.push(org)
      }
    }


    // ── Tick predators ─────────────────────────────────────────
    // No hunting handicap: predators must be able to establish a sustained
    // population for the cycle to exist. Prey get their head start from the
    // early food-spawn multiplier (graceMultiplier) instead.
    for (const org of predList) {
      const nearbyPrey = preyGrid.query(org.x, org.y, PREY_QUERY_RADIUS).filter(p => !dead.has(p.id) && !killed.has(p.id))
      const result = org.tick([], this.config, 0, nearbyPrey)

      if (result.killedPreyId !== null && !killed.has(result.killedPreyId)) {
        killed.add(result.killedPreyId)
        this.metrics.predationCount++
        this.pushEvent('predation', org.x, org.y)
      }

      if (result.died) {
        dead.add(org.id)
        this.metrics.predatorDeaths++
        this.pushEvent('death', org.x, org.y, 'predator')
      } else if (result.reproduce) {
        toReproduce.push(org)
        hasPredatorRepro = true
      }
    }


    // Remove dead (starved) and killed (eaten) organisms
    this.organisms = this.organisms.filter(org => !dead.has(org.id) && !killed.has(org.id))
    this.foods = this.foods.filter(food => !food.consumed)

    const effectiveMutRate = this.lastDiversity < DIVERSITY_THRESHOLD
      ? this.config.mutationRate * ADAPTIVE_MUT_MULTIPLIER
      : this.config.mutationRate

    // ── Reproduction (species inherited from parent) ───────────
    // The population is regulated by ECOLOGY, not a hard ceiling. Prey
    // reproduction tapers smoothly as numbers rise (density-dependent birth
    // rate), so prey settle/oscillate BELOW maxPopulation instead of pinning to
    // it. Predator births are gated by their own energy — they must keep
    // catching prey to breed — plus a proportional cap. Together with senescence
    // this yields Lotka-Volterra-style coupled cycles rather than a flat cap.
    const maxPop = this.config.maxPopulation
    let liveTotal = this.organisms.length
    let preyLive = 0
    let predLive = 0
    for (const o of this.organisms) {
      if (o.species === 'prey') preyLive++
      else predLive++
    }

    // Predators reproduce FIRST. Otherwise prey crowding the population cap
    // exhaust the birth budget and the `break` below fires before predators —
    // listed last — ever breed, so predators can never crop prey and the cycle
    // dies. Predators are few and ratio-capped, so this can't starve prey. The
    // sort only matters when a predator is actually breeding this tick.
    if (hasPredatorRepro) {
      toReproduce.sort((a, b) =>
        (a.species === 'predator' ? 0 : 1) - (b.species === 'predator' ? 0 : 1))
    }

    for (const parent of toReproduce) {
      if (liveTotal >= maxPop) break
      if (dead.has(parent.id) || killed.has(parent.id)) continue

      if (parent.species === 'prey') {
        // Soft logistic taper: permissive until crowded, then falls to 0 at cap.
        const crowd = preyLive / maxPop
        const birthProb = 1 - crowd * crowd * crowd
        if (birthProb <= 0 || this.rng() > birthProb) continue
      } else if (predLive >= preyLive * PREDATOR_PREY_RATIO) {
        // Predators may not exceed a fixed fraction of the prey population.
        continue
      }

      parent.lastReproductionAge = parent.age
      parent.offspring++
      const parentPhenotype = parent.phenotype(this.config)
      const childEnergy = parent.energy * parentPhenotype.offspringEnergyRatio
      const parentCost = childEnergy * (REPRO_PARENT_COST_BASE + parent.genome.reproductionRate * REPRO_PARENT_COST_REPRO_SCALE)
      parent.energy = Math.max(0, parent.energy - parentCost)
      const childGenome = parent.species === 'predator'
        ? mutate(parent.genome, effectiveMutRate, this.config.temperature, this.rng, PREDATOR_BRAIN_MUTATION_SCALE)
        : mutate(parent.genome, effectiveMutRate, this.config.temperature, this.rng)
      const childSpawn = spawnNearParent(parent.x, parent.y, this.config, this.rng)
      this.organisms.push(
        new Organism(
          this.nextOrganismId++,
          childSpawn.x,
          childSpawn.y,
          childGenome,
          this.metrics.generation,
          childEnergy,
          parent.species,
          this.rng,
        ),
      )
      this.pushEvent('birth', parent.x, parent.y, parent.species)
      liveTotal++

      if (parent.species === 'prey') {
        preyLive++
        this.metrics.births++
        this.metrics.mutations++
        if (this.metrics.births >= this.metrics.nextGenBirthMark) {
          this.metrics.generation++
          this.metrics.nextGenBirthMark += Math.max(1, this.config.initialPop)
        }
      } else {
        predLive++
        this.metrics.predatorBirths++
      }
    }

    const graceMultiplier = this.tickCount <= ECO_GRACE_TICKS ? 2 : 1
    const foodNeeded = Math.min(
      this.config.foodSpawnRate * graceMultiplier,
      this.config.foodCap - this.foods.length,
    )
    for (let i = 0; i < foodNeeded; i++) {
      this.foods.push(Food.spawn(this.nextFoodId++, this.config, this.rng))
    }

    // preyLive/predLive were kept in sync through the reproduction loop and
    // nothing has touched this.organisms since, so they already equal the live
    // counts — re-filtering the whole population twice here was pure waste.
    let preyCount = preyLive
    const predCount = predLive

    // ── Prey anti-extinction floor ─────────────────────────────
    // If predators drive prey toward zero, a few prey are spawned so the
    // population can't be wiped out — the deep crash becomes a trough the cycle
    // recovers from. They are CLONES of the fittest survivor (light mutation),
    // not fresh random genomes, so the floor preserves rather than resets the
    // selection that heavy predation just applied at the bottleneck — mirroring
    // the predator rescue net. Disabled entirely when allowExtinction is set.
    const allowExtinction = this.config.allowExtinction ?? false
    if (!allowExtinction && preyCount > 0 && preyCount < PREY_RESCUE_FLOOR) {
      const donor = this.organisms.reduce<Organism | null>(
        (best, o) => (o.species === 'prey' && (!best || o.accumulatedFitness > best.accumulatedFitness) ? o : best),
        null,
      )
      for (let i = preyCount; i < PREY_RESCUE_FLOOR; i++) {
        if (this.organisms.length >= this.config.maxPopulation) break
        const spawn = randomWorldPosition(this.config, this.rng)
        const genome = donor
          ? mutate(donor.genome, effectiveMutRate, this.config.temperature, this.rng)
          : randomGenome(this.rng)
        this.organisms.push(new Organism(this.nextOrganismId++, spawn.x, spawn.y, genome, this.metrics.generation, this.config.initialEnergy, 'prey', this.rng))
        this.metrics.births++
      }
      preyCount = PREY_RESCUE_FLOOR
    }

    this.metrics.peakPopulation = Math.max(this.metrics.peakPopulation, preyCount)
    this.metrics.predatorPeakPop = Math.max(this.metrics.predatorPeakPop, predCount)
    // Fixed-length ring shifted in place (buildSnapshot copies it before handing
    // it out), so updating the population history allocates nothing per tick.
    this.popHistory.shift()
    this.popHistory.push(preyCount)
    this.predatorPopHistory.shift()
    this.predatorPopHistory.push(predCount)

    // ── Predator anti-extinction net ───────────────────────────
    // Intervenes ONLY when predators are nearly gone, to prevent stochastic
    // extinction during a deep trough. It does not prop the population up to a
    // target, so the evolved, self-sustaining predators drive the dynamics.
    // New predators inherit the best surviving hunter's brain (lightly
    // perturbed) or, if none remain, the innate seed brain — never a random one.
    if (
      !allowExtinction &&
      this.tickCount >= PREDATOR_INTRO_TICKS &&
      this.tickCount % PREDATOR_INTRO_INTERVAL === 0 &&
      predCount < PREDATOR_RESCUE_FLOOR &&
      preyCount >= PREDATOR_PREY_THRESHOLD &&
      (this.config.initialPredators ?? 0) > 0
    ) {
      const bestHunter = this.organisms
        .filter(o => o.species === 'predator')
        .sort((a, b) => b.accumulatedFitness - a.accumulatedFitness)[0]
      for (let i = predCount; i < PREDATOR_RESCUE_FLOOR; i++) {
        if (this.organisms.length >= this.config.maxPopulation) break
        const spawn = randomWorldPosition(this.config, this.rng)
        this.organisms.push(new Organism(
          this.nextOrganismId++,
          spawn.x,
          spawn.y,
          newPredatorGenome(this.rng, bestHunter?.genome, this.config),
          this.metrics.generation,
          Math.round(this.config.initialEnergy * PREDATOR_START_ENERGY_RATIO),
          'predator',
          this.rng,
        ))
        this.metrics.predatorBirths++
        this.pushEvent('birth', spawn.x, spawn.y, 'predator')
      }
    }
  }

  getSeed(): number {
    return this.seed
  }

  buildInitialSnapshot(): WorldSnapshot {
    return this.buildSnapshot()
  }

  buildSnapshot(): WorldSnapshot {
    const allSnaps = this.organisms.map(org => org.snapshot(this.config))
    // Partition once instead of filtering the whole snapshot array twice.
    const preySnaps: typeof allSnaps = []
    const predSnaps: typeof allSnaps = []
    for (const snap of allSnaps) {
      if (snap.species === 'prey') preySnaps.push(snap)
      else predSnaps.push(snap)
    }
    const foodSnaps  = this.foods.map(food => food.snapshot())

    const recentEvents = this.recentEvents.filter(e => this.tickCount - e.tick <= EVENT_WINDOW_TICKS)
    const recentFoodEvents = this.recentFoodEvents.filter(e => this.tickCount - e.tick <= EVENT_WINDOW_TICKS)
    this.recentEvents = recentEvents
    this.recentFoodEvents = recentFoodEvents

    // ── Prey stats ─────────────────────────────────────────────
    let avgFitness = 0
    let avgAge = 0
    let maxAge = 0
    let avgEnergy = 0
    let criticalOrganisms = 0
    const keys: Record<string, number> = {}
    const traitAverages: PhysicalTraits = {
      speed: 0, size: 0, vision: 0, energyEfficiency: 0, reproductionRate: 0,
    }

    if (preySnaps.length > 0) {
      let fitnessSum = 0, ageSum = 0, energySum = 0
      for (const org of preySnaps) {
        fitnessSum += org.accumulatedFitness
        ageSum += org.age
        energySum += org.energy
        maxAge = Math.max(maxAge, org.age)
        const key = genomeKey(org.genome)
        keys[key] = (keys[key] ?? 0) + 1
        for (const trait of TRAIT_KEYS) traitAverages[trait] += org.genome[trait]
        if (org.energy / org.maxEnergy < 0.25) criticalOrganisms++
      }
      avgFitness = fitnessSum / preySnaps.length
      avgAge = ageSum / preySnaps.length
      avgEnergy = energySum / preySnaps.length
      for (const trait of TRAIT_KEYS) traitAverages[trait] /= preySnaps.length
    }

    // ── Predator stats ─────────────────────────────────────────
    let avgPredatorFitness = 0
    if (predSnaps.length > 0) {
      avgPredatorFitness = predSnaps.reduce((s, o) => s + o.accumulatedFitness, 0) / predSnaps.length
    }

    const variantEntries = Object.entries(keys).sort((a, b) => b[1] - a[1])
    const variants = variantEntries.length
    const dominant = variants > 0 ? variantEntries[0][0] : '-'
    const geneticSignal = analyzeGeneticSignal(traitAverages)
    const dominantLabel = geneticSignal.label

    let diversity = 0
    if (preySnaps.length > 1) {
      let totalVar = 0
      for (const trait of TRAIT_KEYS) {
        const values = preySnaps.map(org => org.genome[trait])
        const mean = values.reduce((s, v) => s + v, 0) / values.length
        totalVar += values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
      }
      diversity = Math.sqrt(totalVar / TRAIT_KEYS.length)
    }

    const birthsRecent   = recentEvents.filter(e => e.type === 'birth' ).length
    const deathsRecent   = recentEvents.filter(e => e.type === 'death'  ).length
    const predationRecent = recentEvents.filter(e => e.type === 'predation').length

    // Exact per-species recent births/deaths — events are tagged with the
    // organism's species at pushEvent time (no more population-ratio estimate).
    const predatorBirthsRecent = recentEvents.filter(e => e.type === 'birth' && e.species === 'predator').length
    const predatorDeathsRecent = recentEvents.filter(e => e.type === 'death' && e.species === 'predator').length

    const foodByKind = countFoodByKind(foodSnaps)
    const eatenRecentByKind = emptyFoodCounts()
    for (const event of recentFoodEvents) eatenRecentByKind[event.kind]++

    const netRecent = birthsRecent - deathsRecent
    const foodDensity = this.config.foodCap > 0 ? foodSnaps.length / this.config.foodCap : 0
    const criticalRatio = preySnaps.length > 0 ? criticalOrganisms / preySnaps.length : 0
    const resourcePressure = clamp01(criticalRatio * 0.6 + (1 - foodDensity) * 0.4)
    const dominantDrift = describeDominantDrift(this.lastDominantLabel, dominantLabel, diversity)
    // Include predation kills in total deaths so expansion/stability labels reflect full prey mortality
    const totalDeathsRecent = deathsRecent + predationRecent
    const ecosystemState = describeEcosystemState({ organisms: preySnaps.length, birthsRecent, deathsRecent: totalDeathsRecent, diversity, resourcePressure, criticalRatio, predators: predSnaps.length })
    const telemetryState = describeTelemetryState({ organisms: preySnaps.length, birthsRecent, deathsRecent: totalDeathsRecent, diversity, resourcePressure, criticalRatio, predators: predSnaps.length })

    this.lastDiversity = diversity
    this.lastDominantLabel = dominantLabel

    return {
      organisms: allSnaps,
      foods: foodSnaps,
      recentEvents,
      resourceDensity: buildDensityField(foodSnaps.map(f => ({ x: f.x, y: f.y })), this.config.worldWidth, this.config.worldHeight),
      organismDensity: buildDensityField(allSnaps.map(o => ({ x: o.x, y: o.y })),  this.config.worldWidth, this.config.worldHeight),
      stats: {
        organisms: preySnaps.length,
        peakPopulation: this.metrics.peakPopulation,
        generation: this.metrics.generation,
        elapsed: this.tickCount * TICK_SECONDS,
        births: this.metrics.births,
        deaths: this.metrics.deaths,
        birthsRecent,
        deathsRecent,
        criticalOrganisms,
        netRecent,
        avgFitness,
        avgAge,
        maxAge,
        avgEnergy,
        mutations: this.metrics.mutations,
        dominant,
        dominantLabel,
        dominantDrift,
        specialization: geneticSignal.specialization,
        variants,
        avgGenome: { ...traitAverages },
        diversity,
        foodDensity,
        resourcePressure,
        foodByKind,
        eatenByKind: { ...this.eatenByKind },
        eatenRecentByKind,
        energyEatenByKind: { ...this.energyEatenByKind },
        ecosystemState,
        telemetryState,
        popHistory: [...this.popHistory],
        predators: predSnaps.length,
        predatorPeakPop: this.metrics.predatorPeakPop,
        predatorBirths: this.metrics.predatorBirths,
        predatorDeaths: this.metrics.predatorDeaths,
        predatorBirthsRecent,
        predatorDeathsRecent,
        avgPredatorFitness,
        predatorPopHistory: [...this.predatorPopHistory],
        predationEvents: this.metrics.predationCount,
        predationRecent,
      },
      tick: this.tickCount,
    }
  }

  private pushEvent(type: 'birth' | 'death' | 'predation', x: number, y: number, species?: 'prey' | 'predator') {
    this.recentEvents.push({ id: this.nextEventId++, type, x, y, tick: this.tickCount, species })
    if (this.recentEvents.length > EVENT_CAP) {
      this.recentEvents = this.recentEvents.slice(-EVENT_CAP)
    }
  }
}

interface SimMetrics {
  births: number
  deaths: number
  mutations: number
  generation: number
  nextGenBirthMark: number
  peakPopulation: number
  predatorBirths: number
  predatorDeaths: number
  predatorPeakPop: number
  predationCount: number
}

function emptyMetrics(): SimMetrics {
  return {
    births: 0, deaths: 0, mutations: 0, generation: 0, nextGenBirthMark: 0,
    peakPopulation: 0, predatorBirths: 0, predatorDeaths: 0, predatorPeakPop: 0, predationCount: 0,
  }
}

function emptyFoodCounts(): FoodKindCounts {
  return FOOD_KINDS.reduce((counts, kind) => {
    counts[kind] = 0
    return counts
  }, {} as FoodKindCounts)
}

function countFoodByKind(foods: Array<{ kind: FoodKind }>): FoodKindCounts {
  const counts = emptyFoodCounts()
  for (const food of foods) counts[food.kind]++
  return counts
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function clampToWorld(value: number, max: number): number {
  return Math.max(0, Math.min(max, value))
}

function randomWorldPosition(config: SimConfig, rng: Rng): { x: number; y: number } {
  return {
    x: rng() * config.worldWidth,
    y: rng() * config.worldHeight,
  }
}

function spawnNearParent(x: number, y: number, config: SimConfig, rng: Rng): { x: number; y: number } {
  const angle = rng() * Math.PI * 2
  const distance = rng() * OFFSPRING_SPAWN_RADIUS
  return {
    x: clampToWorld(x + Math.cos(angle) * distance, config.worldWidth),
    y: clampToWorld(y + Math.sin(angle) * distance, config.worldHeight),
  }
}

// A new predator for the anti-extinction net. Hunting is a heuristic, so what
// matters is the physical genome (speed/vision/size). When a donor (the best
// surviving hunter) is given, inherit its evolved traits lightly mutated so the
// rescued predators can actually hunt; otherwise fall back to random traits.
function newPredatorGenome(rng: Rng, donor?: GenomeData, config?: SimConfig): GenomeData {
  if (donor) return mutate(donor, config?.mutationRate ?? 0.01, config?.temperature ?? 1, rng, PREDATOR_BRAIN_MUTATION_SCALE)
  // No donor → the INNATE SEED brain: physical traits are random, but the brain
  // weights are zeroed so brainForward outputs 0 (tanh(0)) → no modulation → the
  // predator starts at EXACTLY the pursuit heuristic (the proven floor). Evolution
  // then explores outward from there, and selection keeps only the deviations that
  // catch more prey, so hunting can only improve on the baseline, never start below
  // it on injected random noise. The randomGenome() call is kept (its RNG draws are
  // unchanged) and only the brain is overwritten, so determinism is preserved.
  const genome = randomGenome(rng)
  genome.brainWeights.fill(0)
  return genome
}
