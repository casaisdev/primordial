// Pure telemetry/labelling layer: turns aggregate population numbers into the
// human-readable phrases the UI shows. No simulation state, so each function is
// directly unit-testable without instantiating or stepping a World.
import type { PhysicalTraits, PhysicalTraitKey, TelemetryState, EcosystemState } from './types'
import { TRAIT_KEYS } from './types'

// Diversity below this triggers the adaptive mutation-rate boost in World.step
// and the MUTATION RESCUE telemetry label here — shared so they can't drift.
export const DIVERSITY_THRESHOLD = 0.10

const TRAIT_LABELS: Record<PhysicalTraitKey, string> = {
  speed: 'FAST',
  size: 'LARGE',
  vision: 'AWARE',
  energyEfficiency: 'EFFICIENT',
  reproductionRate: 'FERTILE',
}
const HIGH_TRAIT_THRESHOLD = 0.65
const LOW_TRAIT_THRESHOLD = 0.35
const BALANCED_RANGE_THRESHOLD = 0.18

export function analyzeGeneticSignal(averages: PhysicalTraits): { label: string; specialization: string } {
  const ranked = [...TRAIT_KEYS].sort((a, b) => averages[b] - averages[a])
  const values = TRAIT_KEYS.map((trait) => averages[trait])
  const range = Math.max(...values) - Math.min(...values)
  const highTraits = ranked.filter((trait) => averages[trait] > HIGH_TRAIT_THRESHOLD)
  const lowTraits = ranked.filter((trait) => averages[trait] < LOW_TRAIT_THRESHOLD)

  if (range < BALANCED_RANGE_THRESHOLD) return { label: 'BALANCED / MIXED', specialization: 'LOW / MIXED' }

  const highLabel = highTraits.map((trait) => TRAIT_LABELS[trait]).join(' + ')
  const specialization = describeSpecialization(highTraits, lowTraits)

  if (highTraits.length > 3) return { label: 'GENERALIST HIGH', specialization }
  if (highTraits.length > 0) return { label: highLabel, specialization }

  const first = ranked[0]
  return { label: first ? `LEANING ${TRAIT_LABELS[first]}` : 'NONE', specialization }
}

function describeSpecialization(highTraits: PhysicalTraitKey[], lowTraits: PhysicalTraitKey[]): string {
  if (highTraits.length >= 3 && lowTraits.length >= 1) return `HIGH: ${highTraits.map((t) => TRAIT_LABELS[t]).join(' + ')}`
  if (highTraits.length >= 2) return `MODERATE: ${highTraits.map((t) => TRAIT_LABELS[t]).join(' + ')}`
  return 'LOW / MIXED'
}

export function describeDominantDrift(previous: string, current: string, diversity: number): string {
  if (current === 'NONE') return 'no population signal'
  if (previous === 'NONE') return `bias emerging: ${current.toLowerCase()}`
  if (previous !== current && current === 'BALANCED / MIXED') return 'flattening toward mixed'
  if (previous !== current) return `shifting toward ${current.toLowerCase()}`
  if (diversity < 0.08) return `low-diversity bias: ${current.toLowerCase()}`
  if (diversity > 0.22) return `broad variation around ${current.toLowerCase()}`
  return `stable bias: ${current.toLowerCase()}`
}

interface EcoInput {
  organisms: number
  birthsRecent: number
  deathsRecent: number
  diversity: number
  resourcePressure: number
  criticalRatio: number
  predators?: number
}

export function describeEcosystemState(input: EcoInput): EcosystemState {
  if (input.organisms === 0) return 'ecosystem collapsed'
  const hasPredators = (input.predators ?? 0) > 0
  // Prey under active predation naturally run at lower energy (fleeing) and must
  // outreproduce to offset predation losses — loosen both thresholds.
  const criticalCap = hasPredators ? 0.65 : 0.42
  const expandingRatio = hasPredators ? 1.60 : 1.25
  if (input.resourcePressure > 0.8 || input.criticalRatio > criticalCap) return 'resource pressure rising'
  if (input.deathsRecent > input.birthsRecent * 1.3 && input.deathsRecent >= 4) return 'die-off underway'
  if (input.birthsRecent > input.deathsRecent * expandingRatio && input.birthsRecent >= 4) return 'population expanding'
  if (input.diversity < 0.08 && input.organisms > 24) return 'diversity collapsing'
  return 'stable equilibrium'
}

export function describeTelemetryState(input: EcoInput): TelemetryState {
  if (input.organisms === 0) return 'EXTINCTION'
  const hasPredators = (input.predators ?? 0) > 0
  const criticalCap = hasPredators ? 0.78 : 0.48
  const expandingRatio = hasPredators ? 1.60 : 1.30
  if (input.resourcePressure > 0.84 || input.criticalRatio > criticalCap) return 'EXTINCTION RISK'
  if (input.birthsRecent > input.deathsRecent * expandingRatio && input.birthsRecent >= 4) return 'GROWTH PHASE'
  if (input.deathsRecent > input.birthsRecent * 1.25 && input.deathsRecent >= 4) return 'DIE-OFF'
  if (input.diversity < DIVERSITY_THRESHOLD && input.birthsRecent >= input.deathsRecent) return 'MUTATION RESCUE'
  return 'STABILITY'
}
