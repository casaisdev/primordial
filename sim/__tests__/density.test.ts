import { describe, it, expect } from 'vitest'
import { buildDensityField } from '../density'

describe('buildDensityField', () => {
  it('bins points into a 16x16 grid and tracks the busiest cell', () => {
    const field = buildDensityField(
      [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 999, y: 999 }],
      1000,
      1000,
    )
    expect(field.cols).toBe(16)
    expect(field.rows).toBe(16)
    expect(field.cells).toHaveLength(256)
    expect(field.cells[0]).toBe(2) // both (0,0) points
    expect(field.max).toBe(2)
    expect(field.cells[255]).toBe(1) // bottom-right cell
  })

  it('clamps out-of-range points into the grid', () => {
    const field = buildDensityField([{ x: 5000, y: 5000 }], 1000, 1000)
    expect(field.cells[255]).toBe(1)
    expect(field.max).toBe(1)
  })

  it('reports max 0 for an empty field', () => {
    const field = buildDensityField([], 1000, 1000)
    expect(field.max).toBe(0)
    expect(field.cells.every((c) => c === 0)).toBe(true)
  })
})
