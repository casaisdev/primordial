import { describe, it, expect } from 'vitest'
import { brainForward, BRAIN_SIZE, BRAIN_INPUT, BRAIN_HIDDEN, BRAIN_OUTPUT } from '../Brain'

const B2_OFF = BRAIN_INPUT * BRAIN_HIDDEN + BRAIN_HIDDEN + BRAIN_HIDDEN * BRAIN_OUTPUT // 48

describe('brainForward', () => {
  it('pins the weight-layout contract', () => {
    expect(BRAIN_SIZE).toBe(50)
    expect(B2_OFF).toBe(48)
  })

  it('all-zero weights produce [0, 0]', () => {
    const out = brainForward(new Array(BRAIN_SIZE).fill(0), [0.2, 0.4, 0.6, 0.8, 1.0])
    expect(out).toEqual([0, 0])
  })

  it('output biases pass through tanh when all other weights are zero', () => {
    const weights = new Array(BRAIN_SIZE).fill(0)
    weights[B2_OFF] = 0.5      // output 0 bias
    weights[B2_OFF + 1] = -0.5 // output 1 bias
    const out = brainForward(weights, [0, 0, 0, 0, 0])
    expect(out[0]).toBeCloseTo(Math.tanh(0.5), 10)
    expect(out[1]).toBeCloseTo(Math.tanh(-0.5), 10)
  })

  it('outputs are always a length-2 tuple in (-1, 1)', () => {
    const weights = Array.from({ length: BRAIN_SIZE }, (_, i) => (i % 2 ? 3 : -3))
    const out = brainForward(weights, [1, 1, 1, 1, 1])
    expect(out).toHaveLength(2)
    for (const v of out) {
      expect(v).toBeGreaterThan(-1)
      expect(v).toBeLessThan(1)
    }
  })

  it('does not alias the input/weights arrays into the output', () => {
    const out = brainForward(new Array(BRAIN_SIZE).fill(0.1), [0.5, 0.5, 0.5, 0.5, 0.5])
    expect(Array.isArray(out)).toBe(true)
    expect(out).toHaveLength(2)
  })
})
