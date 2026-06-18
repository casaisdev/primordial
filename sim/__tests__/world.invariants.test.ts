import { describe, it, expect } from 'vitest'
import { World } from '../World'
import { DEFAULT_CONFIG } from '../types'

const SEED = 0xdeadbeef
const TICKS = 2000

describe('World invariants (seed fixed, 2000 ticks)', () => {
  it('population bounds and snapshot consistency hold every tick', () => {
    const world = new World({ ...DEFAULT_CONFIG, seed: SEED })
    let prevBirths = 0
    let prevDeaths = 0
    let prevMutations = 0
    let prevPredationEvents = 0

    for (let t = 1; t <= TICKS; t++) {
      const snap = world.tick()
      const { stats, organisms } = snap

      // Population never goes negative or over cap
      expect(stats.organisms).toBeGreaterThanOrEqual(0)
      expect(stats.predators).toBeGreaterThanOrEqual(0)
      expect(stats.organisms + stats.predators).toBeLessThanOrEqual(DEFAULT_CONFIG.maxPopulation)

      // Snapshot counts match organism list
      const preyInList = organisms.filter(o => o.species === 'prey').length
      const predInList = organisms.filter(o => o.species === 'predator').length
      expect(stats.organisms).toBe(preyInList)
      expect(stats.predators).toBe(predInList)

      // All live organisms have energy in (0, maxEnergy]
      for (const org of organisms) {
        expect(org.energy).toBeGreaterThan(0)
        expect(org.energy).toBeLessThanOrEqual(org.maxEnergy)
      }

      // Density fields have correct dimensions (16×16 = 256)
      expect(snap.resourceDensity.cells).toHaveLength(
        snap.resourceDensity.cols * snap.resourceDensity.rows,
      )
      expect(snap.organismDensity.cells).toHaveLength(
        snap.organismDensity.cols * snap.organismDensity.rows,
      )

      // popHistory always 32 entries
      expect(stats.popHistory).toHaveLength(32)
      expect(stats.predatorPopHistory).toHaveLength(32)

      // Cumulative counters are non-decreasing
      expect(stats.births).toBeGreaterThanOrEqual(prevBirths)
      expect(stats.deaths).toBeGreaterThanOrEqual(prevDeaths)
      expect(stats.mutations).toBeGreaterThanOrEqual(prevMutations)
      expect(stats.predationEvents).toBeGreaterThanOrEqual(prevPredationEvents)

      prevBirths = stats.births
      prevDeaths = stats.deaths
      prevMutations = stats.mutations
      prevPredationEvents = stats.predationEvents
    }
  })
})
