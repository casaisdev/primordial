import { describe, it, expect } from 'vitest'
import {
  analyzeGeneticSignal,
  describeEcosystemState,
  describeTelemetryState,
  describeDominantDrift,
} from '../telemetry'
import type { PhysicalTraits } from '../types'

const balanced: PhysicalTraits = { speed: 0.5, size: 0.5, vision: 0.5, energyEfficiency: 0.5, reproductionRate: 0.5 }
const fast: PhysicalTraits = { speed: 0.95, size: 0.3, vision: 0.3, energyEfficiency: 0.3, reproductionRate: 0.3 }

const eco = (over: Partial<Parameters<typeof describeEcosystemState>[0]> = {}) => ({
  organisms: 50, birthsRecent: 5, deathsRecent: 5, diversity: 0.5,
  resourcePressure: 0, criticalRatio: 0, predators: 0, ...over,
})

describe('analyzeGeneticSignal', () => {
  it('labels a flat genome as balanced/mixed', () => {
    expect(analyzeGeneticSignal(balanced)).toEqual({ label: 'BALANCED / MIXED', specialization: 'LOW / MIXED' })
  })
  it('labels a speed-dominant genome FAST', () => {
    expect(analyzeGeneticSignal(fast).label).toBe('FAST')
  })
})

describe('describeEcosystemState', () => {
  it('collapsed at zero population', () => {
    expect(describeEcosystemState(eco({ organisms: 0 }))).toBe('ecosystem collapsed')
  })
  it('resource pressure rising under high pressure', () => {
    expect(describeEcosystemState(eco({ resourcePressure: 0.9 }))).toBe('resource pressure rising')
  })
  it('die-off when deaths dominate', () => {
    expect(describeEcosystemState(eco({ birthsRecent: 0, deathsRecent: 10 }))).toBe('die-off underway')
  })
  it('expanding when births dominate', () => {
    expect(describeEcosystemState(eco({ birthsRecent: 20, deathsRecent: 0 }))).toBe('population expanding')
  })
  it('stable equilibrium otherwise', () => {
    expect(describeEcosystemState(eco())).toBe('stable equilibrium')
  })
})

describe('describeTelemetryState', () => {
  it('EXTINCTION at zero population', () => {
    expect(describeTelemetryState(eco({ organisms: 0 }))).toBe('EXTINCTION')
  })
  it('GROWTH PHASE when births dominate', () => {
    expect(describeTelemetryState(eco({ birthsRecent: 20, deathsRecent: 0 }))).toBe('GROWTH PHASE')
  })
  it('MUTATION RESCUE on low diversity with stable births', () => {
    expect(describeTelemetryState(eco({ diversity: 0.05 }))).toBe('MUTATION RESCUE')
  })
  it('STABILITY otherwise', () => {
    expect(describeTelemetryState(eco())).toBe('STABILITY')
  })
})

describe('describeDominantDrift', () => {
  it('reports no signal when current is NONE', () => {
    expect(describeDominantDrift('FAST', 'NONE', 0.2)).toBe('no population signal')
  })
  it('reports an emerging bias from NONE', () => {
    expect(describeDominantDrift('NONE', 'FAST', 0.2)).toBe('bias emerging: fast')
  })
})
