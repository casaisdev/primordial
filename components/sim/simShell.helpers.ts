// Pure, DOM-free helpers extracted from SimShell so they can be unit-tested in
// isolation (config validation + header status are the bits most prone to silent
// drift). Kept side-effect free: same input → same output, no React, no globals.
import type { SimConfig } from '@/sim/types'
import { CONFIG_BOUNDS, FOOD_KINDS } from '@/sim/types'
import type { SimState } from '@/sim/protocol'

export type HeaderStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'EXTINCT'

// Status shown in the header. EXTINCT wins over RUNNING/PAUSED once the sim has
// started and the population has hit zero; IDLE is the pre-start state.
export function deriveHeaderStatus(simState: SimState, organisms: number | undefined): HeaderStatus {
  if (simState === 'idle') return 'IDLE'
  if ((organisms ?? 1) === 0) return 'EXTINCT'
  return simState === 'running' ? 'RUNNING' : 'PAUSED'
}

export function cloneConfig(config: SimConfig): SimConfig {
  return {
    ...config,
    foodProfiles: {
      small: { ...config.foodProfiles.small },
      lean: { ...config.foodProfiles.lean },
      rich: { ...config.foodProfiles.rich },
      dense: { ...config.foodProfiles.dense },
    },
  }
}

// Clamp every user-tunable field into its CONFIG_BOUNDS range and keep the
// dependent fields consistent (initialPop ≤ maxPopulation, etc.). Returns a fresh
// config — never mutates the input.
export function normalizeConfig(config: SimConfig): SimConfig {
  const next = cloneConfig(config)
  const b = CONFIG_BOUNDS
  // worldWidth/worldHeight are not user-configurable via LAB — preserve as-is
  next.maxPopulation = clampInt(next.maxPopulation, b.maxPopulation[0], b.maxPopulation[1])
  next.initialPop = clampInt(next.initialPop, 1, next.maxPopulation)
  next.initialPredators = clampInt(next.initialPredators ?? 0, 0, Math.max(0, next.maxPopulation - next.initialPop))
  next.foodCap = clampInt(next.foodCap, b.foodCap[0], b.foodCap[1])
  next.initialFood = clampInt(next.initialFood, 0, next.foodCap)
  next.foodSpawnRate = clampInt(next.foodSpawnRate, b.foodSpawnRate[0], b.foodSpawnRate[1])
  next.initialEnergy = clampNumber(next.initialEnergy, b.initialEnergy[0], b.initialEnergy[1])
  next.reproductionBaseThreshold = clampNumber(next.reproductionBaseThreshold, b.reproductionBaseThreshold[0], b.reproductionBaseThreshold[1])
  next.mutationRate = clampNumber(next.mutationRate, b.mutationRate[0], b.mutationRate[1])
  next.energyDecay = clampNumber(next.energyDecay, b.energyDecay[0], b.energyDecay[1])
  next.temperature = clampNumber(next.temperature, b.temperature[0], b.temperature[1])
  next.seed = normalizeSeed(next.seed)

  let totalWeight = 0
  for (const kind of FOOD_KINDS) {
    const profile = next.foodProfiles[kind]
    profile.weight = clampNumber(profile.weight, b.foodProfileWeight[0], b.foodProfileWeight[1])
    profile.energy = clampNumber(profile.energy, b.foodProfileEnergy[0], b.foodProfileEnergy[1])
    profile.radius = clampNumber(profile.radius, b.foodProfileRadius[0], b.foodProfileRadius[1])
    totalWeight += profile.weight
  }
  if (totalWeight <= 0) {
    next.foodProfiles.small.weight = 1
  }

  return next
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max))
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

export function normalizeSeed(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(0xffffffff, Math.round(value)))
}
