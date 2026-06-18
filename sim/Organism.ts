import type { Food } from './Food'
import type { GenomeData, OrganismPhenotype, OrganismSnapshot, SimConfig, Species } from './types'
import type { Rng } from './rng'
import { brainForward } from './Brain'

// Result of advancing one organism a tick. A prey always reports killedPreyId
// null; a predator always reports eaten null / energyGained 0.
export interface TickResult {
  eaten: Food | null
  energyGained: number
  died: boolean
  reproduce: boolean
  killedPreyId: number | null
}

const MAX_SPEED = 4.0
const MIN_VISION = 40
const MAX_VISION = 350
const ENERGY_DECAY_SCALE = 360
const MAX_ENERGY = 320
const REPRODUCE_THRESHOLD_RANGE = 58
const EAT_RADIUS_BASE = 6
const MAX_TURN = Math.PI * 0.5
const MAX_NEIGHBOR_NORM = 20
const MAX_AGE_NORM = 2000
const PREDATOR_EAT_RADIUS = 10
// Predators sprint faster than prey so a chase can succeed against a fleeing
// target; evolution still tunes the underlying speed/vision/size. A catch yields
// this fraction of the prey's energy. Tuned for sustained predator-prey cycles.
const PREDATOR_SPEED_BONUS = 1.4
const PREDATION_GAIN = 0.25
const PREDATOR_VISION_GRACE_GENS = 100   // early generations get a wider hunting view
const PREDATOR_VISION_GRACE_MULT = 1.5
const PREDATOR_WANDER_SPEED_MULT = 0.55  // slower search pace when no prey is in sight
const PREDATOR_REPRO_ENERGY_BONUS = 55   // energy over base threshold required to breed
const PREDATOR_MIN_REPRO_AGE = 120       // freshly spawned predators can't breed immediately
const FITNESS_AGE_WEIGHT = 0.4
const FITNESS_OFFSPRING_WEIGHT = 0.6
const FOOD_GAIN_BASE_MULT = 1.35

// Hybrid hunting: the evolved brain MODULATES the pursuit heuristic, it does not
// replace it. Bounds are deliberately small so a random or mutation-wrecked brain
// stays within ~±15% of the heuristic — hunting can never drop below the proven
// baseline (the structural anti-meltdown floor). The brain only refines the chase:
// leading the target, choosing an intercept angle, allocating sprint effort.
const PRED_MOD_TURN = MAX_TURN * 0.15    // extra steering the brain may add (radians)
const PRED_SPEED_MOD = 0.20              // brain's ± scaling authority over sprint speed
const PRED_SPEED_MUL_MIN = 0.85
const PRED_SPEED_MUL_MAX = 1.15
const PRED_MOD_WANDER = 0.25             // search-heading nudge when no prey is in sight

// Hunting-success → reproduction coupling. Each catch bumps a decaying `huntScore`
// (a recent-catch-rate signal); the score shortens the predator's next breeding
// cooldown, capped. A prolific hunter thus breeds in bursts and leaves
// super-linearly more offspring than a mediocre one — so selection for good
// hunting outruns the (now-gentle) brain mutational drift. Pure state, no RNG.
const PRED_HUNT_DECAY = 0.985            // per-tick decay of the recent-catch signal
const PRED_HUNT_BUMP = 1                 // score added per successful catch
const PRED_HUNT_COOLDOWN_PER_SCORE = 0.18 // cooldown fraction cut per unit of score
const PRED_HUNT_MAX_COOLDOWN_CUT = 0.5   // a hot streak shortens cooldown by at most this

// ── Senescence ──────────────────────────────────────────────────────────────
// Without a finite lifespan, abundant food makes organisms effectively immortal:
// the population grows to maxPopulation, the reproduction cap halts all births,
// and with no deaths the genome pool freezes — the "stable equilibrium" lock-up
// (no turnover, no selection, collapsed diversity). Each organism gets a
// randomized max age so cohorts die out of phase, restoring continuous turnover
// and re-enabling selection + the mutation-rescue path (which only fires on birth).
const SENESCENCE_BASE = 2000
const SENESCENCE_SPREAD = 520
const SENESCENCE_MIN = 900
const SENESCENCE_ONSET = 0.6      // fraction of lifespan before decline begins
const SENESCENCE_DRAIN_MULT = 2.6 // peak extra metabolic cost (× base) at end of life

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// Triangular distribution on [-1, 1] (sum of two uniforms, std ≈ 0.41) — NOT a
// standard normal. The narrow spread is deliberate: it desynchronizes cohort
// lifespans (so the population doesn't die in waves) without long tails. With
// SENESCENCE_SPREAD this yields max lifespans in ~[1480, 2520].
function lifespanGaussian(rng: Rng): number {
  return rng() + rng() - 1
}

function phenotypeFromGenome(genome: GenomeData, config: SimConfig): OrganismPhenotype {
  const moveSpeed = clamp(
    MAX_SPEED *
      (0.25 + genome.speed * 0.75) *
      (1 - genome.size * 0.22) *
      (1 - genome.energyEfficiency * 0.08),
    0.25,
    MAX_SPEED,
  )
  const visionRadius = MIN_VISION + genome.vision * (MAX_VISION - MIN_VISION)
  const eatRadius = EAT_RADIUS_BASE + genome.size * 7
  const energyGainMultiplier =
    (0.50 + genome.energyEfficiency * 0.78) *
    (0.70 + genome.size * 0.60)
  const energyCostPerTick = config.energyDecay * ENERGY_DECAY_SCALE *
    (
      1 +
      genome.speed ** 2 * 0.70 +
      genome.size * 0.85 +
      genome.vision * 0.38 +
      genome.reproductionRate * 0.18 +
      genome.energyEfficiency * 0.08
    )
  const reproductionThreshold = clamp(
    config.reproductionBaseThreshold +
      (1 - genome.reproductionRate) * REPRODUCE_THRESHOLD_RANGE +
      genome.size * 24 +
      genome.energyEfficiency * 8,
    Math.max(70, config.reproductionBaseThreshold - 8),
    250,
  )
  const offspringEnergyRatio = clamp(
    0.36 - genome.reproductionRate * 0.08 - genome.energyEfficiency * 0.03 + genome.size * 0.04,
    0.20,
    0.42,
  )
  const minReproductionAge = Math.round(260 - genome.reproductionRate * 60 + genome.size * 40)
  const reproductionCooldown = Math.round(190 - genome.reproductionRate * 45 + genome.size * 55)

  return {
    moveSpeed,
    visionRadius,
    eatRadius,
    energyGainMultiplier,
    energyCostPerTick,
    reproductionThreshold,
    offspringEnergyRatio,
    minReproductionAge,
    reproductionCooldown,
  }
}

export class Organism {
  readonly id: number
  readonly species: Species
  x: number
  y: number
  energy: number
  age: number
  lastReproductionAge: number
  offspring: number
  // Decaying recent-catch signal (predators only); drives the reproduction
  // cooldown discount so good hunters breed in bursts. See PRED_HUNT_* constants.
  huntScore: number
  readonly generation: number
  readonly maxLifespan: number
  genome: GenomeData

  angle: number

  // Shared reference to the World's seeded RNG, used for the predator wander in
  // tick(). Carrying it on the organism keeps tick()'s already-long signature
  // unchanged; determinism holds because organisms tick in a fixed array order.
  private readonly rng: Rng

  constructor(
    id: number,
    x: number,
    y: number,
    genome: GenomeData,
    generation = 0,
    energy = 100,
    species: Species = 'prey',
    rng: Rng,
  ) {
    this.id = id
    this.x = x
    this.y = y
    this.genome = genome
    this.generation = generation
    this.energy = energy
    this.age = 0
    this.lastReproductionAge = -Infinity
    this.offspring = 0
    this.huntScore = 0
    this.species = species
    this.rng = rng
    this.angle = rng() * Math.PI * 2
    this.maxLifespan = Math.max(
      SENESCENCE_MIN,
      Math.round(SENESCENCE_BASE + lifespanGaussian(rng) * SENESCENCE_SPREAD),
    )
  }

  // Extra metabolic cost accrued past the senescence onset age. Ramps
  // quadratically so old organisms weaken and eventually fail even when fed —
  // selecting for genomes that reproduce earlier and feed efficiently.
  private senescenceDrain(baseCost: number): number {
    const onset = this.maxLifespan * SENESCENCE_ONSET
    if (this.age <= onset) return 0
    const t = (this.age - onset) / (this.maxLifespan - onset)
    return baseCost * SENESCENCE_DRAIN_MULT * t * t
  }

  // Vision radius in world units — cheap to compute without the full phenotype,
  // so the caller can size the spatial-grid query to this prey instead of a
  // fixed worst-case radius (far fewer food candidates to scan for low-vision prey).
  visionRadius(): number {
    return MIN_VISION + this.genome.vision * (MAX_VISION - MIN_VISION)
  }

  tick(
    foods: Food[],
    config: SimConfig,
    neighborCount: number,
    nearbyPrey: Organism[],
    nearbyPredators: Organism[] = [],
  ): TickResult {
    this.age++

    const phenotype = this.phenotype(config)

    const weights = this.genome.brainWeights

    let killedPreyId: number | null = null

    if (this.species === 'predator') {
      // Recent-catch signal decays every tick; a catch below bumps it back up.
      this.huntScore *= PRED_HUNT_DECAY

      // Grace-period: 1.5× vision for predators born in first 100 generations
      const effectiveVision = this.generation < PREDATOR_VISION_GRACE_GENS
        ? phenotype.visionRadius * PREDATOR_VISION_GRACE_MULT
        : phenotype.visionRadius

      // Sense nearest prey (squared-distance scan, one sqrt at the end)
      let nearest: Organism | null = null
      let nearestDistSq = effectiveVision * effectiveVision
      for (const prey of nearbyPrey) {
        const dx = prey.x - this.x
        const dy = prey.y - this.y
        const d2 = dx * dx + dy * dy
        if (d2 < nearestDistSq) {
          nearest = prey
          nearestDistSq = d2
        }
      }
      const nearestDist = nearest ? Math.sqrt(nearestDistSq) : Infinity

      // HYBRID hunting: a pursuit heuristic provides the base steering (turn
      // toward and sprint at the nearest visible prey) and the evolved brain
      // MODULATES it with small, bounded turn/speed nudges. Pure brain-evolved
      // hunting was tried first and collapsed to mutational meltdown — each
      // generation's mutated brain hunted slightly worse and lineages starved
      // before selection could lock the skill in. The hybrid fixes this
      // structurally: the heuristic is the floor, so even a wrecked brain still
      // hunts at the proven baseline, while a good brain refines the chase
      // (leading the target, intercept angles, sprint-effort allocation). The
      // PREDATOR-PREY CYCLE stays emergent from population densities, and
      // physical traits (speed/vision/size) still shape the chase too.
      const [turnMod, speedMod] = brainForward(weights, [
        nearest !== null ? Math.min(1, nearestDist / effectiveVision) : 1.0,
        nearest !== null ? angleToTarget(this.angle, nearest.x - this.x, nearest.y - this.y) / Math.PI : 0.0,
        Math.max(0, Math.min(1, this.energy / MAX_ENERGY)),
        Math.min(1, nearbyPrey.length / MAX_NEIGHBOR_NORM),
        Math.min(1, this.age / MAX_AGE_NORM),
      ])
      const speedMul = clamp(1 + speedMod * PRED_SPEED_MOD, PRED_SPEED_MUL_MIN, PRED_SPEED_MUL_MAX)

      let speed: number
      if (nearest !== null) {
        const desired = angleToTarget(this.angle, nearest.x - this.x, nearest.y - this.y)
        this.angle += clamp(desired, -MAX_TURN, MAX_TURN) + turnMod * PRED_MOD_TURN
        speed = phenotype.moveSpeed * PREDATOR_SPEED_BONUS * speedMul
      } else {
        // The wander rng() draw stays exactly here so the RNG stream order (and
        // determinism) is unchanged; the brain only adds a search-heading nudge.
        this.angle += (this.rng() - 0.5) * 0.5 + turnMod * PRED_MOD_WANDER
        speed = phenotype.moveSpeed * PREDATOR_WANDER_SPEED_MULT * PREDATOR_SPEED_BONUS * speedMul
      }

      this.x += Math.cos(this.angle) * speed
      this.y += Math.sin(this.angle) * speed

      if (this.x < 0) { this.x = 0; this.angle = Math.PI - this.angle }
      if (this.x > config.worldWidth) { this.x = config.worldWidth; this.angle = Math.PI - this.angle }
      if (this.y < 0) { this.y = 0; this.angle = -this.angle }
      if (this.y > config.worldHeight) { this.y = config.worldHeight; this.angle = -this.angle }

      this.energy -= phenotype.energyCostPerTick + this.senescenceDrain(phenotype.energyCostPerTick)

      if (nearest !== null && nearestDist <= PREDATOR_EAT_RADIUS + phenotype.eatRadius) {
        const gained = nearest.energy * PREDATION_GAIN
        this.energy = Math.min(MAX_ENERGY, this.energy + gained)
        killedPreyId = nearest.id
        this.huntScore += PRED_HUNT_BUMP
      }

      const died = this.energy <= 0 || this.age >= this.maxLifespan
      // Threshold is well above starting energy (120) so predators must hunt before reproducing.
      // Minimum age 80 prevents immediate reproduction of newly spawned/rescued predators.
      const predatorReproThreshold = phenotype.reproductionThreshold + PREDATOR_REPRO_ENERGY_BONUS
      // Hunting-success coupling: recent catches shorten the breeding cooldown
      // (capped), so prolific hunters breed in bursts and out-reproduce drift.
      const cooldownCut = Math.min(PRED_HUNT_MAX_COOLDOWN_CUT, this.huntScore * PRED_HUNT_COOLDOWN_PER_SCORE)
      const effectiveCooldown = phenotype.reproductionCooldown * (1 - cooldownCut)
      const reproduce = !died && this.age >= PREDATOR_MIN_REPRO_AGE && this.energy >= predatorReproThreshold && this.age - this.lastReproductionAge >= effectiveCooldown
      return { eaten: null, energyGained: 0, died, reproduce, killedPreyId }
    }

    // ── Prey logic ──────────────────────────────────────────────
    // Squared-distance scan (one sqrt at the end, not per candidate) and skip
    // food already eaten this tick — this loop is the simulation's hottest path.
    let nearest: Food | null = null
    let nearestDistSq = phenotype.visionRadius * phenotype.visionRadius
    for (const food of foods) {
      if (food.consumed) continue
      const dx = food.x - this.x
      const dy = food.y - this.y
      const d2 = dx * dx + dy * dy
      if (d2 < nearestDistSq) {
        nearest = food
        nearestDistSq = d2
      }
    }
    const nearestDist = nearest ? Math.sqrt(nearestDistSq) : Infinity

    const distNorm  = nearest ? Math.min(1, nearestDist / phenotype.visionRadius) : 1.0
    const angleNorm = nearest
      ? angleToTarget(this.angle, nearest.x - this.x, nearest.y - this.y) / Math.PI
      : 0.0
    const energyNorm = Math.max(0, Math.min(1, this.energy / MAX_ENERGY))
    const neighNorm  = Math.min(1, neighborCount / MAX_NEIGHBOR_NORM)
    const ageNorm    = Math.min(1, this.age / MAX_AGE_NORM)

    // Flee response overrides foraging — survival first. If a predator is within
    // sight, sprint directly away from the nearest one; otherwise forage with the
    // evolved brain. Fast/aware prey escape and slow/blind prey are caught, so
    // predation selects prey speed & vision and the two species coevolve.
    let nearestPred: Organism | null = null
    let nearestPredSq = phenotype.visionRadius * phenotype.visionRadius
    for (const p of nearbyPredators) {
      const dx = p.x - this.x
      const dy = p.y - this.y
      const d2 = dx * dx + dy * dy
      if (d2 < nearestPredSq) { nearestPred = p; nearestPredSq = d2 }
    }

    let speed: number
    if (nearestPred !== null) {
      const away = angleToTarget(this.angle, this.x - nearestPred.x, this.y - nearestPred.y)
      this.angle += clamp(away, -MAX_TURN, MAX_TURN)
      speed = phenotype.moveSpeed
    } else {
      const [dAngle, speedOut] = brainForward(weights, [distNorm, angleNorm, energyNorm, neighNorm, ageNorm])
      this.angle += dAngle * MAX_TURN
      speed = ((speedOut + 1) / 2) * phenotype.moveSpeed
    }

    this.x += Math.cos(this.angle) * speed
    this.y += Math.sin(this.angle) * speed

    if (this.x < 0) { this.x = 0; this.angle = Math.PI - this.angle }
    if (this.x > config.worldWidth) { this.x = config.worldWidth; this.angle = Math.PI - this.angle }
    if (this.y < 0) { this.y = 0; this.angle = -this.angle }
    if (this.y > config.worldHeight) { this.y = config.worldHeight; this.angle = -this.angle }

    this.energy -= phenotype.energyCostPerTick + this.senescenceDrain(phenotype.energyCostPerTick)

    let eaten: Food | null = null
    let energyGained = 0
    if (nearest !== null && nearestDist <= phenotype.eatRadius + nearest.radius) {
      eaten = nearest
      energyGained = foodGainFor(nearest, this.genome, phenotype)
      this.energy = Math.min(MAX_ENERGY, this.energy + energyGained)
    }

    const died = this.energy <= 0 || this.age >= this.maxLifespan
    const reproduce = !died &&
      this.age >= phenotype.minReproductionAge &&
      this.age - this.lastReproductionAge >= phenotype.reproductionCooldown &&
      this.energy >= phenotype.reproductionThreshold
    return { eaten, energyGained, died, reproduce, killedPreyId: null }
  }

  // Genome is immutable after birth and config is constant for a World's
  // lifetime, so the phenotype is computed once and cached — it used to be
  // recomputed (pow + clamps + allocation) for every organism every tick.
  private cachedPhenotype: OrganismPhenotype | null = null
  phenotype(config: SimConfig): OrganismPhenotype {
    return (this.cachedPhenotype ??= phenotypeFromGenome(this.genome, config))
  }

  get accumulatedFitness(): number {
    return this.age * FITNESS_AGE_WEIGHT + this.offspring * FITNESS_OFFSPRING_WEIGHT
  }

  snapshot(config: SimConfig): OrganismSnapshot {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      angle: this.angle,
      species: this.species,
      energy: this.energy,
      maxEnergy: MAX_ENERGY,
      // Genome is immutable after birth (mutate() builds a fresh object for each
      // child; a parent's is never edited in place), so the snapshot shares the
      // reference instead of deep-cloning it every organism every frame.
      genome: this.genome,
      phenotype: this.phenotype(config),
      generation: this.generation,
      age: this.age,
      lastReproductionAge: this.lastReproductionAge,
      offspring: this.offspring,
      accumulatedFitness: this.accumulatedFitness,
    }
  }
}

function angleToTarget(heading: number, dx: number, dy: number): number {
  let diff = Math.atan2(dy, dx) - heading
  while (diff >  Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return diff
}

function foodGainFor(food: Food, genome: GenomeData, phenotype: OrganismPhenotype): number {
  const baseGain = food.energy * phenotype.energyGainMultiplier * FOOD_GAIN_BASE_MULT

  if (food.kind === 'dense') {
    const denseAccess = clamp((phenotype.eatRadius - 7) / 6, 0.35, 1.15)
    return baseGain * denseAccess
  }

  if (food.kind === 'lean') {
    return baseGain * (0.72 + genome.energyEfficiency * 0.68)
  }

  if (food.kind === 'rich') {
    return baseGain * (0.90 + genome.vision * 0.12 + genome.speed * 0.08)
  }

  return baseGain * (0.92 + genome.reproductionRate * 0.10)
}
