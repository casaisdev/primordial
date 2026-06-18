import { describe, it, expect } from 'vitest'
import { Organism } from '../Organism'
import { Food } from '../Food'
import { DEFAULT_CONFIG } from '../types'
import type { GenomeData } from '../types'

// Constant RNG → deterministic construction: angle = 0.5*2π, and
// lifespanGaussian = 0.5+0.5-1 = 0, so maxLifespan = 2000.
const rng = () => 0.5
const genome = (): GenomeData => ({
  speed: 0.5, size: 0.5, vision: 0.5, energyEfficiency: 0.5, reproductionRate: 0.5,
  brainWeights: new Array(50).fill(0),
})

describe('Organism.tick — prey life cycle', () => {
  it('decays energy by exactly energyCostPerTick on a barren tick', () => {
    const org = new Organism(1, 100, 100, genome(), 0, 100, 'prey', rng)
    const pheno = org.phenotype(DEFAULT_CONFIG)
    const r = org.tick([], DEFAULT_CONFIG, 0, [])
    expect(r.died).toBe(false)
    expect(org.age).toBe(1)
    expect(org.energy).toBeCloseTo(100 - pheno.energyCostPerTick, 6)
  })

  it('dies when energy crosses zero (starvation)', () => {
    const org = new Organism(1, 100, 100, genome(), 0, 0.05, 'prey', rng)
    const r = org.tick([], DEFAULT_CONFIG, 0, [])
    expect(r.died).toBe(true)
    expect(org.energy).toBeLessThanOrEqual(0)
  })

  it('dies of old age when age reaches maxLifespan', () => {
    const org = new Organism(1, 100, 100, genome(), 0, 300, 'prey', rng)
    org.age = org.maxLifespan
    const r = org.tick([], DEFAULT_CONFIG, 0, [])
    expect(r.died).toBe(true)
    expect(org.energy).toBeGreaterThan(0) // age death, not starvation
  })

  it('reproduces only when age + cooldown + energy thresholds are all met', () => {
    const ready = new Organism(1, 100, 100, genome(), 0, 300, 'prey', rng)
    ready.age = 400
    expect(ready.tick([], DEFAULT_CONFIG, 0, []).reproduce).toBe(true)

    const tooPoor = new Organism(2, 100, 100, genome(), 0, 50, 'prey', rng)
    tooPoor.age = 400
    expect(tooPoor.tick([], DEFAULT_CONFIG, 0, []).reproduce).toBe(false)

    const tooYoung = new Organism(3, 100, 100, genome(), 0, 300, 'prey', rng)
    tooYoung.age = 10
    expect(tooYoung.tick([], DEFAULT_CONFIG, 0, []).reproduce).toBe(false)
  })

  it('clamps energy to MAX_ENERGY (320) when eating', () => {
    const food = new Food(1, 100, 100, 'rich', { energy: 200, radius: 5, weight: 1 })
    const org = new Organism(1, 100, 100, genome(), 0, 315, 'prey', rng)
    const r = org.tick([food], DEFAULT_CONFIG, 0, [])
    expect(r.eaten).toBe(food)
    expect(r.energyGained).toBeGreaterThan(0)
    expect(org.energy).toBe(320)
  })
})

describe('Organism.tick — predator', () => {
  it('catches an adjacent prey and reports its id, gaining a fraction of its energy', () => {
    const pred = new Organism(1, 100, 100, genome(), 0, 200, 'predator', rng)
    const prey = new Organism(2, 100, 100, genome(), 0, 200, 'prey', rng)
    const r = pred.tick([], DEFAULT_CONFIG, 0, [prey])
    expect(r.killedPreyId).toBe(2)
    expect(pred.energy).toBeGreaterThan(0)
  })

  it('returns no kill when the nearest prey is out of range', () => {
    const pred = new Organism(1, 100, 100, genome(), 0, 200, 'predator', rng)
    const prey = new Organism(2, 5000, 5000, genome(), 0, 200, 'prey', rng)
    const r = pred.tick([], DEFAULT_CONFIG, 0, [prey])
    expect(r.killedPreyId).toBeNull()
  })
})
