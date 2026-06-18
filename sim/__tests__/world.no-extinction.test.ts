import { describe, it, expect } from 'vitest'
import { World } from '../World'
import { DEFAULT_CONFIG } from '../types'

// Seed chosen to produce a healthy run. PREY_RESCUE_FLOOR in World guarantees a
// prey floor by design; this test catches regressions that break that guarantee.
const SEED = 0xc0ffee
const TICKS = 3000

describe('World no-extinction regression (seed fixed, 3000 ticks)', () => {
  it('prey never reach zero population', () => {
    const world = new World({ ...DEFAULT_CONFIG, seed: SEED })
    for (let t = 0; t < TICKS; t++) {
      const snap = world.tick()
      expect(snap.stats.organisms).toBeGreaterThan(0)
    }
  })

  it('predators survive to end of run', () => {
    const world = new World({ ...DEFAULT_CONFIG, seed: SEED })
    let lastSnap: ReturnType<typeof world.tick> | null = null
    for (let t = 0; t < TICKS; t++) {
      lastSnap = world.tick()
    }
    expect(lastSnap!.stats.predators).toBeGreaterThan(0)
  })
})
