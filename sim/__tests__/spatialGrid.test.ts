import { describe, it, expect } from 'vitest'
import { SpatialGrid } from '../SpatialGrid'

type P = { x: number; y: number; id: number }

describe('SpatialGrid', () => {
  it('returns every item within the query radius (cell superset is allowed)', () => {
    const items: P[] = [
      { x: 10, y: 10, id: 1 },
      { x: 50, y: 50, id: 2 },
      { x: 500, y: 500, id: 3 },
    ]
    const grid = new SpatialGrid<P>(64, items)
    const found = grid.query(10, 10, 80).map((p) => p.id)
    expect(found).toContain(1)
    expect(found).toContain(2) // within ~57 of (10,10)
    expect(found).not.toContain(3) // far away, different cells
  })

  it('finds an item straddling a cell boundary', () => {
    const grid = new SpatialGrid<P>(64, [{ x: 63.9, y: 64.1, id: 7 }])
    // Query centered just across the boundary must still surface it.
    expect(grid.query(70, 70, 20).map((p) => p.id)).toContain(7)
  })

  it('handles negative query coordinates (bias path)', () => {
    const grid = new SpatialGrid<P>(64, [{ x: 5, y: 5, id: 9 }])
    expect(grid.query(-10, -10, 40).map((p) => p.id)).toContain(9)
  })

  it('reuses the scratch array — a second query overwrites the first result', () => {
    const grid = new SpatialGrid<P>(64, [
      { x: 0, y: 0, id: 1 },
      { x: 1000, y: 1000, id: 2 },
    ])
    const first = grid.query(0, 0, 10)
    const second = grid.query(1000, 1000, 10)
    expect(first).toBe(second) // same array instance (documented contract)
    expect(second.map((p) => p.id)).toEqual([2])
  })

  it('rebuild() repopulates in place', () => {
    const grid = new SpatialGrid<P>(64, [{ x: 0, y: 0, id: 1 }])
    grid.rebuild([{ x: 500, y: 500, id: 2 }])
    expect(grid.query(0, 0, 10).length).toBe(0)
    expect(grid.query(500, 500, 10).map((p) => p.id)).toEqual([2])
  })
})
