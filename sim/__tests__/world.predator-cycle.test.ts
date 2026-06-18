import { describe, it, expect } from 'vitest'
import { World } from '../World'
import { DEFAULT_CONFIG } from '../types'

// Regression guard for the validated predator–prey cycle. This MUST stay green
// across the predator-hunting changes (heuristic → brain-modulated hunting): it
// pins down that neither species goes extinct and that the predator population
// actually oscillates (rises to a peak and crashes back), rather than collapsing
// to the rescue floor — the "mutational meltdown" failure mode.
//
// Run on the current heuristic first to establish the baseline, then re-run after
// the brain change to prove the cycle survives.

const TICKS = 2400

// Oscillation thresholds, set well inside the observed margins on the current
// heuristic (predator peaks 27–51, troughs 6–10) so a healthy cycle clears them
// with room to spare, but a meltdown (predators pinned at the floor of 8) fails.
const PEAK_MIN = 18
const RANGE_MIN = 6

interface Trace {
  minPred: number; maxPred: number; minPrey: number; maxPrey: number
  lastPred: number; lastPrey: number; predatorPeak: number; predationEvents: number
  preyExtinct: boolean; predExtinct: boolean
}

function trace(seed: number, allowExtinction: boolean): Trace {
  const world = new World({ ...DEFAULT_CONFIG, seed, allowExtinction })
  let minPred = Infinity, maxPred = 0, minPrey = Infinity, maxPrey = 0
  let preyExtinct = false, predExtinct = false
  let s = world.tick().stats
  for (let t = 0; t < TICKS; t++) {
    s = world.tick().stats
    if (s.organisms === 0) preyExtinct = true
    if (s.predators === 0) predExtinct = true
    minPred = Math.min(minPred, s.predators); maxPred = Math.max(maxPred, s.predators)
    minPrey = Math.min(minPrey, s.organisms); maxPrey = Math.max(maxPrey, s.organisms)
  }
  return {
    minPred, maxPred, minPrey, maxPrey,
    lastPred: s.predators, lastPrey: s.organisms,
    predatorPeak: s.predatorPeakPop, predationEvents: s.predationEvents,
    preyExtinct, predExtinct,
  }
}

describe('predator–prey cycle (rescue ON — default config)', () => {
  // The validated configuration users actually run. The rescue floors are armed
  // but, on a healthy cycle, barely fire — these seeds oscillate well above them.
  for (const seed of [0xc0ffee, 0x9e3779b9, 0x2468ace]) {
    it(`oscillates without extinction (seed ${seed.toString(16)})`, () => {
      const r = trace(seed, false)
      // Neither species ever blinks out.
      expect(r.preyExtinct).toBe(false)
      expect(r.predExtinct).toBe(false)
      // Predators climb well past the rescue floor (not pinned at it).
      expect(r.predatorPeak).toBeGreaterThanOrEqual(PEAK_MIN)
      // And the population genuinely oscillates (boom/bust spread).
      expect(r.maxPred - r.minPred).toBeGreaterThanOrEqual(RANGE_MIN)
      expect(r.maxPrey - r.minPrey).toBeGreaterThanOrEqual(RANGE_MIN)
      // Predation is actually driving the coupling.
      expect(r.predationEvents).toBeGreaterThan(0)
    }, 30_000)
  }
})

describe('predator–prey cycle (rescue OFF — self-sustaining)', () => {
  // allowExtinction disables BOTH rescue floors, so predators must sustain
  // themselves purely by reproduction. This is the real anti-meltdown proof:
  // if evolved hunting degrades faster than selection preserves it, predators
  // die here. Seeds chosen empirically as healthy on the current heuristic.
  for (const seed of [0xdeadbeef, 0x2468ace, 0x9e3779b9]) {
    it(`predators self-sustain to the end (seed ${seed.toString(16)})`, () => {
      const r = trace(seed, true)
      // Survival WITHOUT the rescue net — both species alive at the end.
      expect(r.lastPrey).toBeGreaterThan(0)
      expect(r.lastPred).toBeGreaterThan(0)
      expect(r.predExtinct).toBe(false)
      // Self-sustaining hunters still produce a real oscillation, not a flat line.
      expect(r.predatorPeak).toBeGreaterThanOrEqual(PEAK_MIN)
      expect(r.maxPred - r.minPred).toBeGreaterThanOrEqual(RANGE_MIN)
    }, 30_000)
  }
})
