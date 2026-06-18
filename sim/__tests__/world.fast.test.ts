import { describe, it, expect } from 'vitest'
import { World } from '../World'
import { DEFAULT_CONFIG } from '../types'
import type { SimConfig } from '../types'

// A small, fast world that exercises the same code paths as the big integration
// suite but in well under a second, giving sub-second feedback.
const small = (over: Partial<SimConfig> = {}): SimConfig => ({
  ...DEFAULT_CONFIG,
  seed: 0x5151,
  worldWidth: 600,
  worldHeight: 600,
  initialPop: 40,
  initialPredators: 6,
  initialFood: 150,
  foodCap: 400,
  foodSpawnRate: 12,
  maxPopulation: 150,
  ...over,
})

describe('World — fast invariants (small config)', () => {
  it('keeps stats finite and bounded across a 300-tick run', () => {
    const world = new World(small())
    for (let i = 0; i < 300; i++) {
      const snap = world.tick()
      const s = snap.stats
      expect(Number.isFinite(s.avgEnergy)).toBe(true)
      expect(Number.isFinite(s.diversity)).toBe(true)
      expect(Number.isFinite(s.avgFitness)).toBe(true)
      expect(s.organisms).toBeGreaterThanOrEqual(0)
      expect(s.organisms + s.predators).toBeLessThanOrEqual(small().maxPopulation)
      expect(snap.foods.length).toBeLessThanOrEqual(small().foodCap)
      expect(s.popHistory).toHaveLength(32)
      expect(s.predatorPopHistory).toHaveLength(32)
    }
  })
})

describe('World — determinism', () => {
  it('two worlds with the same seed produce identical snapshots', () => {
    const a = new World(small())
    const b = new World(small())
    for (let i = 0; i < 80; i++) { a.step(); b.step() }
    expect(a.buildSnapshot()).toEqual(b.buildSnapshot())
  })

  it('reset() reproduces the original run bit-for-bit', () => {
    const w = new World(small())
    for (let i = 0; i < 80; i++) w.step()
    const first = w.buildSnapshot()
    w.reset()
    for (let i = 0; i < 80; i++) w.step()
    expect(w.buildSnapshot()).toEqual(first)
  })
})

describe('World — allowExtinction toggle', () => {
  // Zero food + fast decay → prey starve quickly. With the rescue floor on they
  // can never be wiped out; with allowExtinction the population actually collapses.
  const harsh = (allowExtinction: boolean) =>
    small({
      seed: 777,
      initialPredators: 0,
      initialFood: 0,
      foodSpawnRate: 0,
      foodCap: 50,
      initialEnergy: 200,
      energyDecay: 0.01,
      allowExtinction,
    })

  it('rescue floor (default) keeps prey alive through a famine', () => {
    const world = new World(harsh(false))
    let min = Infinity
    for (let i = 0; i < 200; i++) min = Math.min(min, world.tick().stats.organisms)
    expect(world.buildSnapshot().stats.organisms).toBeGreaterThan(0)
    expect(min).toBeGreaterThan(0)
  })

  it('allowExtinction lets the population collapse to zero', () => {
    const world = new World(harsh(true))
    let extinct = false
    for (let i = 0; i < 200; i++) {
      if (world.tick().stats.organisms === 0) { extinct = true; break }
    }
    expect(extinct).toBe(true)
  })
})
