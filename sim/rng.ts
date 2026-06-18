// Seedable PRNG for the simulation core. Every random draw in /sim flows through
// an injected Rng so a run is fully reproducible from its seed — same seed yields a
// bit-identical run. mulberry32 returns a float in [0, 1), exactly like
// Math.random(), so swapping it in preserves every existing distribution (uniform,
// Box-Muller gaussian, triangular lifespan); it only makes the entropy source
// deterministic. It's small, fast and good enough for a toy ALife sim.
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
