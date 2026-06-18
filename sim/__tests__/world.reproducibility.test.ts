import { describe, it, expect } from 'vitest'
import { World } from '../World'
import { DEFAULT_CONFIG } from '../types'

const SEED = 12345
const TICKS = 500

describe('World reproducibility', () => {
  it('two worlds with the same seed produce identical snapshots at tick K', () => {
    const a = new World({ ...DEFAULT_CONFIG, seed: SEED })
    const b = new World({ ...DEFAULT_CONFIG, seed: SEED })

    let snapA: ReturnType<typeof a.tick> | null = null
    let snapB: ReturnType<typeof b.tick> | null = null
    for (let t = 0; t < TICKS; t++) {
      snapA = a.tick()
      snapB = b.tick()
    }

    // Id counters live on the World, so even organism/food ids match — the whole
    // snapshot is bit-identical, not just the derived stats.
    expect(snapA).toEqual(snapB)
  })

  it('reset() reproduces the original run, ids included', () => {
    const world = new World({ ...DEFAULT_CONFIG, seed: SEED })
    let first: ReturnType<typeof world.tick> | null = null
    for (let t = 0; t < TICKS; t++) first = world.tick()

    world.reset()
    let second: ReturnType<typeof world.tick> | null = null
    for (let t = 0; t < TICKS; t++) second = world.tick()

    expect(second).toEqual(first)
  })

  it('a different seed actually drives the stream — runs diverge within a few ticks', () => {
    // Strong check: the seed must change the run from the start. Organism
    // positions are the sensitive signal — they diverge almost immediately, even
    // though discrete aggregate counts (births/deaths) can still coincide this
    // early. (Asserting on those coarse aggregates was the old, flaky check.)
    const a = new World({ ...DEFAULT_CONFIG, seed: SEED })
    const b = new World({ ...DEFAULT_CONFIG, seed: SEED + 1 })

    let snapA: ReturnType<typeof a.tick> | null = null
    let snapB: ReturnType<typeof b.tick> | null = null
    for (let t = 0; t < 8; t++) {
      snapA = a.tick()
      snapB = b.tick()
    }

    const posA = snapA!.organisms.map(o => [o.x, o.y])
    const posB = snapB!.organisms.map(o => [o.x, o.y])
    expect(posA).not.toEqual(posB)

    // And the divergence compounds: by a longer horizon the full snapshots differ.
    for (let t = 8; t < TICKS; t++) { snapA = a.tick(); snapB = b.tick() }
    expect(snapA).not.toEqual(snapB)
  })
})
