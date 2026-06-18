import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../rng'
import { randomGenome, mutate } from '../Genome'
import { BRAIN_SIZE } from '../Brain'

const TRAITS = ['speed', 'size', 'vision', 'energyEfficiency', 'reproductionRate'] as const

describe('randomGenome', () => {
  it('same seed → identical genome', () => {
    const a = randomGenome(mulberry32(7))
    const b = randomGenome(mulberry32(7))
    expect(a).toEqual(b)
  })

  it('all traits in [0, 1]', () => {
    const rng = mulberry32(13)
    for (let i = 0; i < 20; i++) {
      const g = randomGenome(rng)
      for (const t of TRAITS) {
        expect(g[t]).toBeGreaterThanOrEqual(0)
        expect(g[t]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('brainWeights has correct length', () => {
    const g = randomGenome(mulberry32(0))
    expect(g.brainWeights).toHaveLength(BRAIN_SIZE)
  })
})

describe('mutate', () => {
  it('same seed → identical mutation', () => {
    const parent = randomGenome(mulberry32(1))
    const a = mutate(parent, 0.01, 1.0, mulberry32(77))
    const b = mutate(parent, 0.01, 1.0, mulberry32(77))
    expect(a).toEqual(b)
  })

  it('all traits stay in [0, 1] after many mutations', () => {
    const rng = mulberry32(42)
    let g = randomGenome(rng)
    for (let i = 0; i < 100; i++) {
      g = mutate(g, 0.05, 2.0, rng)
      for (const t of TRAITS) {
        expect(g[t]).toBeGreaterThanOrEqual(0)
        expect(g[t]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('brainWeights length preserved through mutation', () => {
    const rng = mulberry32(3)
    const parent = randomGenome(rng)
    const child = mutate(parent, 0.01, 1.0, rng)
    expect(child.brainWeights).toHaveLength(BRAIN_SIZE)
  })
})
