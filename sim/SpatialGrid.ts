// Uniform-grid spatial hash. Hot path: rebuilt and queried hundreds of times per
// tick, so it avoids per-cell allocation — integer cell keys (string keys were
// allocating ~40k short-lived strings per tick) and a single reused scratch array
// for query results.
//
// Callers MUST consume a query() result before the next query() on the SAME grid
// (the returned array is the reused scratch buffer, not a fresh copy). The grid
// is also poolable: call rebuild(items) to repopulate an existing instance every
// tick instead of allocating a new Map + buckets.
const GRID_KEY_BIAS = 2048      // shifts negative cells (queries can probe x<0) non-negative
const GRID_KEY_STRIDE = 8192    // > 2*BIAS, so (col,row) maps to a unique integer

export class SpatialGrid<T extends { x: number; y: number }> {
  private readonly cells = new Map<number, T[]>()
  private readonly scratch: T[] = []
  private readonly cellSize: number

  constructor(cellSize: number, items?: T[]) {
    this.cellSize = cellSize
    if (items) this.insert(items)
  }

  // Repopulate in place: empties existing buckets (keeping their arrays) and
  // re-inserts, so a per-tick rebuild allocates nothing once warmed up.
  rebuild(items: T[]): this {
    for (const bucket of this.cells.values()) bucket.length = 0
    this.insert(items)
    return this
  }

  private insert(items: T[]) {
    for (const item of items) {
      const key = this.key(this.cell(item.x), this.cell(item.y))
      const bucket = this.cells.get(key)
      if (bucket) bucket.push(item)
      else this.cells.set(key, [item])
    }
  }

  query(x: number, y: number, radius: number): T[] {
    const minCol = this.cell(x - radius)
    const maxCol = this.cell(x + radius)
    const minRow = this.cell(y - radius)
    const maxRow = this.cell(y + radius)
    const out = this.scratch
    out.length = 0

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const bucket = this.cells.get(this.key(col, row))
        if (bucket) for (let i = 0; i < bucket.length; i++) out.push(bucket[i])
      }
    }

    return out
  }

  private cell(value: number): number {
    return Math.floor(value / this.cellSize)
  }

  private key(col: number, row: number): number {
    return (col + GRID_KEY_BIAS) * GRID_KEY_STRIDE + (row + GRID_KEY_BIAS)
  }
}
