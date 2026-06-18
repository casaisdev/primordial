import type { GenomeData, PhysicalTraits } from './types'
import { TRAIT_KEYS } from './types'
import type { Rng } from './rng'
import { BRAIN_SIZE } from './Brain'

const INITIAL_BUDGET_MIN = 2.2
const INITIAL_BUDGET_MAX = 2.9
const MUTATION_BUDGET_MIN = 1.8
const MUTATION_BUDGET_MAX = 3.2
const MEAN_REGRESSION = 0.02

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function gaussian(rng: Rng): number {
  const u = 1 - rng()
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function fromValues(values: number[]): PhysicalTraits {
  return {
    speed: clamp01(values[0]),
    size: clamp01(values[1]),
    vision: clamp01(values[2]),
    energyEfficiency: clamp01(values[3]),
    reproductionRate: clamp01(values[4]),
  }
}

function rebalanceBudget(genome: PhysicalTraits, minBudget: number, maxBudget: number): PhysicalTraits {
  const values = TRAIT_KEYS.map((key) => clamp01(genome[key]))
  const total = values.reduce((sum, value) => sum + value, 0)

  if (total > maxBudget) {
    return fromValues(values.map((value) => value * (maxBudget / total)))
  }

  if (total < minBudget) {
    const room = values.reduce((sum, value) => sum + (1 - value), 0) || 1
    const needed = minBudget - total
    return fromValues(values.map((value) => value + (1 - value) * (needed / room)))
  }

  return fromValues(values)
}

export function randomGenome(rng: Rng): GenomeData {
  const values = TRAIT_KEYS.map(() => clamp01(0.5 + gaussian(rng) * 0.13))
  const base = rebalanceBudget(fromValues(values), INITIAL_BUDGET_MIN, INITIAL_BUDGET_MAX)
  return { ...base, brainWeights: Array.from({ length: BRAIN_SIZE }, () => gaussian(rng) * 0.5) }
}

// Default brain-mutation magnitude (× sigma) — calibrated for prey, whose
// foraging tolerates a high churn rate (food is everywhere + a hard-coded flee
// override handles survival).
export const DEFAULT_BRAIN_MUTATION_SCALE = 8

// `brainScale` controls how hard the brain weights are perturbed (× sigma). The
// default reproduces the original prey behavior byte-for-byte. Predators pass a
// MUCH smaller scale: their hunting brain is the only thing standing between them
// and starvation, so a high churn rate shreds good hunters faster than selection
// can preserve them (mutational meltdown). Crucially, the NUMBER of RNG draws is
// identical regardless of brainScale (still one gaussian per weight, in order),
// so determinism and the seeded reproducibility runs are unaffected.
export function mutate(
  genome: GenomeData,
  rate: number,
  temp: number,
  rng: Rng,
  brainScale: number = DEFAULT_BRAIN_MUTATION_SCALE,
): GenomeData {
  const sigma = Math.min(0.055, Math.max(0.025, rate * (1.1 + temp * 2.6)))
  const values = TRAIT_KEYS.map((key) => {
    const mutated = clamp01(genome[key] + gaussian(rng) * sigma)
    return clamp01(mutated * (1 - MEAN_REGRESSION) + 0.5 * MEAN_REGRESSION)
  })

  const child = rebalanceBudget(fromValues(values), MUTATION_BUDGET_MIN, MUTATION_BUDGET_MAX)
  return { ...child, brainWeights: genome.brainWeights.map(w => w + gaussian(rng) * sigma * brainScale) }
}

// Bucketed key for diversity/dominance counting (5 buckets per trait)
export function genomeKey(genome: GenomeData): string {
  return [
    genome.speed,
    genome.size,
    genome.vision,
    genome.energyEfficiency,
    genome.reproductionRate,
  ]
    .map(v => Math.round(v * 4))
    .join('')
}
