import type { FoodKind, FoodProfile, FoodSnapshot, SimConfig } from './types'
import type { Rng } from './rng'

export class Food {
  readonly id: number
  x: number
  y: number
  readonly kind: FoodKind
  readonly energy: number
  readonly radius: number
  // Set when a prey consumes this food during the current tick; consumed food is
  // skipped by later prey and removed at end of tick. A boolean flag is much
  // cheaper than a Set.has() lookup in the hottest scan loop.
  consumed = false

  constructor(id: number, x: number, y: number, kind: FoodKind, profile: FoodProfile) {
    this.id = id
    this.x = x
    this.y = y
    this.kind = kind
    this.energy = profile.energy
    this.radius = profile.radius
  }

  static spawn(id: number, config: SimConfig, rng: Rng): Food {
    const kind = chooseFoodKind(config, rng)
    return new Food(
      id,
      rng() * config.worldWidth,
      rng() * config.worldHeight,
      kind,
      config.foodProfiles[kind],
    )
  }

  snapshot(): FoodSnapshot {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      kind: this.kind,
      energy: this.energy,
      radius: this.radius,
    }
  }
}

export function chooseFoodKind(config: SimConfig, rng: Rng): FoodKind {
  const entries = Object.entries(config.foodProfiles) as Array<[FoodKind, FoodProfile]>
  const totalWeight = entries.reduce((sum, [, profile]) => sum + Math.max(0, profile.weight), 0)
  if (totalWeight <= 0) return 'small'

  const roll = rng() * totalWeight
  let cursor = 0
  for (const [kind, profile] of entries) {
    cursor += Math.max(0, profile.weight)
    if (roll <= cursor) return kind
  }
  return 'small'
}
