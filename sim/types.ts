export interface Vec2 { x: number; y: number }

export type PhysicalTraitKey = 'speed' | 'size' | 'vision' | 'energyEfficiency' | 'reproductionRate'

// Canonical trait order for the sim core. The on-canvas legend uses its own
// display order (see sim/render.ts), kept separate on purpose.
export const TRAIT_KEYS = ['speed', 'size', 'vision', 'energyEfficiency', 'reproductionRate'] as const satisfies readonly PhysicalTraitKey[]

// Physical traits only — the [0,1] genome dials, without the brain.
export interface PhysicalTraits {
  speed: number
  size: number
  vision: number
  energyEfficiency: number
  reproductionRate: number
}

export interface GenomeData extends PhysicalTraits {
  // Always present: randomGenome/mutate populate it for every organism, so
  // consumers never need to guard for a missing brain.
  brainWeights: number[]
}

export interface OrganismPhenotype {
  moveSpeed: number
  visionRadius: number
  eatRadius: number
  energyGainMultiplier: number
  energyCostPerTick: number
  reproductionThreshold: number
  offspringEnergyRatio: number
  minReproductionAge: number
  reproductionCooldown: number
}

export interface OrganismSnapshot {
  id: number
  x: number
  y: number
  angle: number
  species: Species
  energy: number
  maxEnergy: number
  genome: GenomeData
  phenotype: OrganismPhenotype
  generation: number
  age: number
  lastReproductionAge: number
  offspring: number
  accumulatedFitness: number
}

export type FoodKind = 'small' | 'dense' | 'rich' | 'lean'

// Canonical food-kind order, single source of truth for iteration/counting.
export const FOOD_KINDS = ['small', 'lean', 'rich', 'dense'] as const satisfies readonly FoodKind[]

export type FoodKindCounts = Record<FoodKind, number>

export interface FoodProfile {
  weight: number
  energy: number
  radius: number
}

export type FoodProfiles = Record<FoodKind, FoodProfile>

export interface FoodSnapshot {
  id: number
  x: number
  y: number
  kind: FoodKind
  energy: number
  radius: number
}

export type Species = 'prey' | 'predator'

export type EcosystemEventType = 'birth' | 'death' | 'predation'

export interface RecentEventSnapshot {
  id: number
  type: EcosystemEventType
  x: number
  y: number
  tick: number
  // Species of the organism for birth/death events, so per-species recent counts
  // are tracked exactly rather than estimated from the population ratio.
  // Undefined for predation events.
  species?: Species
}

export interface DensityFieldSnapshot {
  cols: number
  rows: number
  max: number
  cells: number[]
}

// Closed phrase sets emitted by the telemetry layer. Literal unions give the
// describe* functions exhaustiveness checking and keep UI fallbacks honest.
export type TelemetryState =
  | 'EXTINCTION'
  | 'EXTINCTION RISK'
  | 'GROWTH PHASE'
  | 'DIE-OFF'
  | 'MUTATION RESCUE'
  | 'STABILITY'

export type EcosystemState =
  | 'ecosystem collapsed'
  | 'resource pressure rising'
  | 'die-off underway'
  | 'population expanding'
  | 'diversity collapsing'
  | 'stable equilibrium'

export interface SimStats {
  organisms: number
  peakPopulation: number
  generation: number
  elapsed: number
  births: number
  deaths: number
  birthsRecent: number
  deathsRecent: number
  criticalOrganisms: number
  netRecent: number
  avgFitness: number
  avgAge: number
  maxAge: number
  avgEnergy: number
  mutations: number
  dominant: string
  dominantLabel: string
  dominantDrift: string
  specialization: string
  variants: number
  avgGenome: PhysicalTraits
  diversity: number
  foodDensity: number
  resourcePressure: number
  foodByKind: FoodKindCounts
  eatenByKind: FoodKindCounts
  eatenRecentByKind: FoodKindCounts
  energyEatenByKind: FoodKindCounts
  ecosystemState: EcosystemState
  telemetryState: TelemetryState
  popHistory: number[]
  predators: number
  predatorPeakPop: number
  predatorBirths: number
  predatorDeaths: number
  predatorBirthsRecent: number
  predatorDeathsRecent: number
  avgPredatorFitness: number
  predatorPopHistory: number[]
  predationEvents: number
  predationRecent: number
}

export interface WorldSnapshot {
  organisms: OrganismSnapshot[]
  foods: FoodSnapshot[]
  recentEvents: RecentEventSnapshot[]
  resourceDensity: DensityFieldSnapshot
  organismDensity: DensityFieldSnapshot
  stats: SimStats
  tick: number
}

export interface SimConfig {
  // Optional seed for the simulation PRNG. When set, the entire run is
  // reproducible from this value; when omitted, World picks a random seed so each
  // run still differs (preserving the previous default behaviour).
  seed?: number
  worldWidth: number
  worldHeight: number
  mutationRate: number
  initialPop: number
  initialFood: number
  initialEnergy: number
  reproductionBaseThreshold: number
  energyDecay: number
  temperature: number
  foodCap: number
  foodSpawnRate: number
  foodProfiles: FoodProfiles
  initialPredators: number
  maxPopulation: number
  // When true, the anti-extinction rescue floors are disabled so the ecosystem
  // can actually collapse — letting the sim demonstrate selection pressure /
  // extinction (the most basic Darwinian outcome) instead of a guaranteed cycle.
  allowExtinction?: boolean
}

export const DEFAULT_CONFIG: SimConfig = {
  worldWidth: 3072,
  worldHeight: 3072,
  mutationRate: 0.010,
  initialPop: 220,
  initialFood: 1100,
  initialEnergy: 280,
  reproductionBaseThreshold: 82,
  energyDecay: 0.00018,
  temperature: 1.0,
  foodCap: 3000,
  foodSpawnRate: 32,
  initialPredators: 10,
  maxPopulation: 700,
  allowExtinction: false,
  foodProfiles: {
    small: { energy: 22, radius: 2.0, weight: 0.46 },
    lean: { energy: 17, radius: 2.2, weight: 0.28 },
    rich: { energy: 52, radius: 2.4, weight: 0.17 },
    dense: { energy: 72, radius: 3.4, weight: 0.09 },
  },
}

// Validation bounds for the user-tunable config fields, co-located with the
// defaults so the LAB UI and normalizeConfig() can't drift apart. Per-field
// [min, max]; integer fields are rounded by the caller.
export const CONFIG_BOUNDS = {
  maxPopulation: [100, 800],
  foodCap: [500, 3500],
  foodSpawnRate: [0, 60],
  initialEnergy: [120, 320],
  reproductionBaseThreshold: [70, 240],
  mutationRate: [0, 0.2],
  energyDecay: [0.00001, 0.01],
  temperature: [0, 3],
  foodProfileWeight: [0, 1],
  foodProfileEnergy: [1, 240],
  foodProfileRadius: [0.2, 20],
} as const satisfies Record<string, readonly [number, number]>
