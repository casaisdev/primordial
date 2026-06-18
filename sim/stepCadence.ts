// Pure speed→ticks cadence for the worker loop, pulled out so the fractional
// accumulator logic can be unit-tested without a worker, a canvas, or rAF.
//
// Speeds:
//   • fractional (0 < s < 1): accumulate s each frame, emit one tick when the
//     accumulator crosses 1 (so 0.25 → a tick every 4th frame). At most one tick
//     per frame, which keeps slow-motion smooth.
//   • integer (s ≥ 1): emit exactly s ticks every frame.
//   • s ≤ 0 is MAX mode, handled by the caller under a wall-clock budget (it is
//     not a fixed per-frame count), so this function returns zero ticks for it.
export interface CadenceResult {
  ticks: number
  accum: number
}

export function advanceCadence(speed: number, accum: number): CadenceResult {
  if (speed > 0 && speed < 1) {
    const a = accum + speed
    return a >= 1 ? { ticks: 1, accum: a - 1 } : { ticks: 0, accum: a }
  }
  if (speed <= 0) return { ticks: 0, accum: 0 }
  return { ticks: Math.floor(speed), accum: 0 }
}
