import { describe, it, expect } from 'vitest'
import { chooseFoodKind } from '../Food'
import { DEFAULT_CONFIG } from '../types'
import type { SimConfig } from '../types'

// DEFAULT weights: small .46, lean .28, rich .17, dense .09 → cumulative
// boundaries at 0.46 / 0.74 / 0.91 / 1.00 (totalWeight 1.0).
const at = (roll: number) => chooseFoodKind(DEFAULT_CONFIG, () => roll)

describe('chooseFoodKind', () => {
  it('selects each kind by weighted roulette', () => {
    expect(at(0.10)).toBe('small')
    expect(at(0.50)).toBe('lean')
    expect(at(0.80)).toBe('rich')
    expect(at(0.95)).toBe('dense')
  })

  it('falls back to small when total weight is zero', () => {
    const config: SimConfig = {
      ...DEFAULT_CONFIG,
      foodProfiles: {
        small: { energy: 22, radius: 2, weight: 0 },
        lean: { energy: 17, radius: 2.2, weight: 0 },
        rich: { energy: 52, radius: 2.4, weight: 0 },
        dense: { energy: 72, radius: 3.4, weight: 0 },
      },
    }
    expect(chooseFoodKind(config, () => 0.5)).toBe('small')
  })
})
