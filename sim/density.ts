import type { DensityFieldSnapshot } from './types'

const DENSITY_COLS = 16
const DENSITY_ROWS = 16

// Bins points into a fixed COLS×ROWS grid and tracks the busiest cell, for the
// heat-map overlays. Pure: no simulation state.
export function buildDensityField(
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
): DensityFieldSnapshot {
  const cells = new Array(DENSITY_COLS * DENSITY_ROWS).fill(0)
  let max = 0
  for (const point of points) {
    const col = Math.max(0, Math.min(DENSITY_COLS - 1, Math.floor((point.x / width) * DENSITY_COLS)))
    const row = Math.max(0, Math.min(DENSITY_ROWS - 1, Math.floor((point.y / height) * DENSITY_ROWS)))
    const index = row * DENSITY_COLS + col
    cells[index]++
    max = Math.max(max, cells[index])
  }
  return { cols: DENSITY_COLS, rows: DENSITY_ROWS, max, cells }
}
