// Canvas renderer for the simulation. Extracted from SimCanvas so it can run
// inside the worker against an OffscreenCanvas: it only ever touches the 2D
// context API (no DOM), so the same code paints whether the context comes from a
// main-thread <canvas> or a worker-owned OffscreenCanvas.
import type {
  OrganismSnapshot,
  FoodSnapshot,
  GenomeData,
  RecentEventSnapshot,
  DensityFieldSnapshot,
  FoodKind,
} from './types'

type Ctx = OffscreenCanvasRenderingContext2D

export const TRAIT_KEYS = ['speed', 'vision', 'energyEfficiency', 'reproductionRate', 'size'] as const
export type TraitKey = typeof TRAIT_KEYS[number]

// Trait → hue. Five maximally-separated, saturated hues (72° apart on the colour
// wheel) so the dominant trait reads as a distinct COLOUR — never an averaged
// grey. These are the vivid "specialist" colours; geneticColor mutes them toward
// neutral as the trait's advantage over the rest shrinks.
export const TRAIT_RGB: Record<TraitKey, [number, number, number]> = {
  energyEfficiency: [224, 159, 62],  //  36° gold
  speed:            [94, 224, 62],   // 108° green
  size:             [62, 224, 224],  // 180° cyan
  vision:           [94, 62, 224],   // 252° blue-violet
  reproductionRate: [224, 62, 159],  // 324° magenta-pink
}

// Hue collapses toward this neutral for an unspecialised (balanced) genome.
const NEUTRAL_RGB: [number, number, number] = [110, 118, 126]

// Per-trait halo BORDER style — the non-chromatic second channel. The ring drawn
// around an organism encodes its dominant trait by line STYLE (not colour), so
// the trait survives without colour vision. Mirrored in the on-canvas legend.
export type TraitBorder = 'solid' | 'dotted' | 'dashed' | 'double' | 'thick'
export const TRAIT_BORDER: Record<TraitKey, TraitBorder> = {
  speed: 'solid',
  vision: 'dotted',
  energyEfficiency: 'double',
  reproductionRate: 'dashed',
  size: 'thick',
}

const FOOD_RGB: Record<FoodKind, [number, number, number]> = {
  small: [152, 192, 172],
  lean:  [112, 148, 134],
  rich:  [210, 174, 82],
  dense: [78,  188, 202],
}

const EVENT_TTL_TICKS = 18
// Below this dominance the leading trait isn't a real signal — skip the border
// ring (the muted hue already reads as "generalist").
const RING_MIN_DOMINANCE = 0.15
const SHOW_WORLD_DEBUG = false
// Detail backs off when organisms would overlap into "soup". Measured as
// body-disk coverage of the viewport (Σ disk area ÷ screen area, overlap counted,
// so it overestimates — which is what we want for crowding).
const COVERAGE_LO = 0.22          // below this, full detail allowed
const COVERAGE_HI = 0.55          // above this, force simple dots

export interface Camera { x: number; y: number; zoom: number }
interface Point { x: number; y: number }

export interface RenderInput {
  organisms: OrganismSnapshot[]
  foods: FoodSnapshot[]
  recentEvents: RecentEventSnapshot[]
  resourceDensity: DensityFieldSnapshot
  organismDensity: DensityFieldSnapshot
  worldWidth: number
  worldHeight: number
  viewportWidth: number
  viewportHeight: number
  dpr: number
  camera: Camera
  tick: number
  renderSimplified: boolean
  selectedOrgId: number | null
  fitZoom: number
  prevTrails: Map<number, { x: number; y: number }>
  // When set, ambient motion (movement trails, expanding event rings, the
  // critical-energy blink) is frozen for prefers-reduced-motion users.
  reducedMotion?: boolean
}

export function geneticColor(genome: GenomeData): {
  rgb: [number, number, number]       // crisp core body colour (hue + brightness encoded)
  glowRgb: [number, number, number]   // vivid trait hue for the halo glow + border ring
  dominantTrait: TraitKey
  dominance: number                   // 0..1 — how far the top trait leads the rest
} {
  let best: TraitKey = 'speed'
  let bestVal = -1
  let secondVal = -1

  for (const key of TRAIT_KEYS) {
    const value = Math.max(0, genome[key])
    if (value > bestVal) {
      secondVal = bestVal
      bestVal = value
      best = key
    } else if (value > secondVal) {
      secondVal = value
    }
  }

  // Hue comes ENTIRELY from the dominant trait (no weighted average — averaging
  // is what used to wash everything to blue-grey). Dominance — the gap between
  // the top trait and the runner-up — drives a second, non-chromatic channel:
  // saturation + brightness. Specialists read vivid and bright; generalists stay
  // muted and dim, but still hint their leading hue.
  const dominance = smoothstep(0.015, 0.26, bestVal - secondVal)
  const vivid = TRAIT_RGB[best]
  const core = liftRgb(mixRgb(NEUTRAL_RGB, vivid, 0.30 + 0.70 * dominance), Math.round(dominance * 14))
  return { rgb: core, glowRgb: vivid, dominantTrait: best, dominance }
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    clampColor(a[0] + (b[0] - a[0]) * t),
    clampColor(a[1] + (b[1] - a[1]) * t),
    clampColor(a[2] + (b[2] - a[2]) * t),
  ]
}

// Draws the per-trait BORDER-style ring around an organism (the non-chromatic
// channel). `r` is the ring radius in screen px; `lw` the base line width. Colour
// is redundant — the line style is what carries the trait without colour vision.
function drawTraitRing(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  border: TraitBorder,
  rgb: [number, number, number],
  alpha: number,
  lw: number,
) {
  const [rr, gg, bb] = rgb
  ctx.strokeStyle = `rgba(${rr},${gg},${bb},${alpha.toFixed(3)})`
  ctx.lineWidth = lw
  switch (border) {
    case 'solid':
      ctx.setLineDash([])
      ringArc(ctx, x, y, r); ctx.stroke()
      break
    case 'thick':
      ctx.setLineDash([])
      ctx.lineWidth = lw * 2.1
      ringArc(ctx, x, y, r); ctx.stroke()
      break
    case 'dotted':
      ctx.setLineDash([Math.max(0.5, lw * 0.6), lw * 2.0])
      ringArc(ctx, x, y, r); ctx.stroke()
      break
    case 'dashed':
      ctx.setLineDash([lw * 3, lw * 2.2])
      ringArc(ctx, x, y, r); ctx.stroke()
      break
    case 'double':
      ctx.setLineDash([])
      ringArc(ctx, x, y, r); ctx.stroke()
      ringArc(ctx, x, y, r + lw * 1.8); ctx.stroke()
      break
  }
  ctx.setLineDash([])
}

function ringArc(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
}

function liftRgb(rgb: [number, number, number], amount: number): [number, number, number] {
  return [clampColor(rgb[0] + amount), clampColor(rgb[1] + amount), clampColor(rgb[2] + amount)]
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

// Smooth Hermite interpolation in [0,1] across the band [edge0, edge1].
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// Paint one frame. Returns the next trail map (caller persists it across frames).
export function renderWorld(ctx: Ctx, input: RenderInput): Map<number, { x: number; y: number }> {
  const {
    organisms, foods, recentEvents, resourceDensity, organismDensity,
    worldWidth, worldHeight, viewportWidth, viewportHeight, dpr,
    camera, tick, renderSimplified, selectedOrgId, fitZoom, prevTrails,
    reducedMotion = false,
  } = input

  const zoom = camera.zoom
  const worldToScreen = (pos: Point): Point => ({
    x: (pos.x - camera.x) * zoom + viewportWidth / 2,
    y: (pos.y - camera.y) * zoom + viewportHeight / 2,
  })
  const screenToWorld = (pos: Point): Point => ({
    x: (pos.x - viewportWidth / 2) / zoom + camera.x,
    y: (pos.y - viewportHeight / 2) / zoom + camera.y,
  })

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, viewportWidth, viewportHeight)

  // ── Void background (canvas space) — visible outside world boundaries ──
  ctx.fillStyle = '#020204'
  ctx.fillRect(0, 0, viewportWidth, viewportHeight)

  // ── Camera transform — everything below is in world coordinates ────
  const worldTopLeft = worldToScreen({ x: 0, y: 0 })
  const worldBottomRight = worldToScreen({ x: worldWidth, y: worldHeight })
  const worldScreenWidth = worldBottomRight.x - worldTopLeft.x
  const worldScreenHeight = worldBottomRight.y - worldTopLeft.y

  ctx.fillStyle = '#050508'
  ctx.fillRect(worldTopLeft.x, worldTopLeft.y, worldScreenWidth, worldScreenHeight)
  drawWorldGrid(ctx, worldToScreen, worldWidth, worldHeight, zoom)
  if (SHOW_WORLD_DEBUG) drawWorldDebug(ctx, worldToScreen, worldWidth, worldHeight)

  // Frustum bounds with 100px canvas-pixel margin to prevent pop-in at edges
  const margin = 100 / zoom
  const visTopLeft = screenToWorld({ x: -100, y: -100 })
  const visBottomRight = screenToWorld({ x: viewportWidth + 100, y: viewportHeight + 100 })
  const visL = visTopLeft.x - margin
  const visR = visBottomRight.x + margin
  const visT = visTopLeft.y - margin
  const visB = visBottomRight.y + margin

  // LOD depends EXCLUSIVELY on zoom (scale) and the global MAX-speed flag —
  // never on camera offset or how many entities are visible. Tying it to a
  // visible-count made the detail level flip while panning at a fixed zoom; a
  // pure zoom threshold keeps detail stable across the whole world at a given
  // scale. (Population is capped, so detailed organisms never get unbounded.)
  const simplifiedRender = renderSimplified || zoom <= fitZoom * 1.35
  if (!simplifiedRender) {
    drawDensityField(ctx, resourceDensity, 'food', worldToScreen, zoom, worldWidth, worldHeight)
    drawDensityField(ctx, organismDensity, 'organism', worldToScreen, zoom, worldWidth, worldHeight)
  }

  // Organism level-of-detail. Two representations are always kept: fine dots
  // when far / crowded, contoured glyphs when close / sparse. Detail is a
  // continuous cross-fade driven by zoom band + glyph coverage.
  let orgDetail = renderSimplified ? 0 : smoothstep(fitZoom * 1.2, fitZoom * 1.7, zoom)
  if (orgDetail > 0) {
    let glyphArea = 0
    for (const org of organisms) {
      if (org.x < visL || org.x > visR || org.y < visT || org.y > visB) continue
      const rr = (16 + org.genome.size * 12) * zoom
      glyphArea += rr * rr * Math.PI
    }
    const coverage = glyphArea / (viewportWidth * viewportHeight)
    orgDetail *= 1 - smoothstep(COVERAGE_LO, COVERAGE_HI, coverage)
  }

  // Trails (in world coordinates)
  const hairline = Math.max(0.7, zoom)
  const nextTrailMap = new Map<number, { x: number; y: number }>()
  for (const org of organisms) {
    const prev = prevTrails.get(org.id)
    if (prev && !simplifiedRender && !reducedMotion) {
      const minX = Math.min(org.x, prev.x)
      const maxX = Math.max(org.x, prev.x)
      const minY = Math.min(org.y, prev.y)
      const maxY = Math.max(org.y, prev.y)
      if (maxX >= visL && minX <= visR && maxY >= visT && minY <= visB) {
        const dx = org.x - prev.x
        const dy = org.y - prev.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0.4 && dist < 40) {
          const [r, g, b] = geneticColor(org.genome).rgb
          const from = worldToScreen({ x: prev.x + dx * 0.45, y: prev.y + dy * 0.45 })
          const to = worldToScreen(org)
          ctx.beginPath()
          ctx.moveTo(from.x, from.y)
          ctx.lineTo(to.x, to.y)
          ctx.lineWidth = hairline * 1.4
          ctx.strokeStyle = `rgba(${r},${g},${b},0.075)`
          ctx.stroke()
        }
      }
    }
    nextTrailMap.set(org.id, { x: org.x, y: org.y })
  }

  for (const event of recentEvents) {
    if (!simplifiedRender && !reducedMotion && event.x >= visL && event.x <= visR && event.y >= visT && event.y <= visB) {
      drawEventMark(ctx, event, tick, worldToScreen, zoom)
    }
  }
  for (const food of foods) {
    if (food.x >= visL && food.x <= visR && food.y >= visT && food.y <= visB) {
      if (simplifiedRender) drawSimpleFood(ctx, food, worldToScreen, zoom)
      else drawFood(ctx, food, worldToScreen, zoom)
    }
  }

  for (const org of organisms) {
    const radius = 16 + org.genome.size * 12
    if (org.x + radius < visL || org.x - radius > visR ||
        org.y + radius < visT || org.y - radius > visB) continue

    const energyRatio = Math.max(0, Math.min(1, org.energy / org.maxEnergy))
    const color = geneticColor(org.genome)
    const [r, g, b] = color.rgb
    const critical = energyRatio < 0.22
    const blink = reducedMotion ? 0.85 : 0.45 + 0.55 * Math.abs(Math.sin(tick * 0.34))
    const alpha = critical ? 0.32 + energyRatio * 0.46 : 0.54 + energyRatio * 0.40
    const lw = hairline
    const screen = worldToScreen(org)
    const screenRadius = radius * zoom
    const selected = org.id === selectedOrgId

    if (orgDetail <= 0.01) {
      drawSimpleOrganism(ctx, screen, screenRadius, [r, g, b], org.species, selected)
      continue
    }

    if (orgDetail < 0.99) {
      drawSimpleOrganism(ctx, screen, screenRadius, [r, g, b], org.species, false, 1 - orgDetail)
    }

    if (org.species === 'predator') {
      drawPredator(ctx, screen.x, screen.y, screenRadius, org.angle, [r, g, b], alpha, critical, blink, selected, orgDetail)
    } else {
      // Soft glow — confined to the halo OUTSIDE the crisp core (the opaque core
      // disc painted on top covers the bright centre, so the glow only shows as a
      // coloured ring of light around a sharp body).
      if (orgDetail > 0.25) {
        const [vr, vg, vb] = color.glowRgb
        const haloR = screenRadius * 2.0
        const grad = ctx.createRadialGradient(screen.x, screen.y, screenRadius * 0.55, screen.x, screen.y, haloR)
        grad.addColorStop(0, `rgba(${vr},${vg},${vb},${(0.18 * orgDetail).toFixed(3)})`)
        grad.addColorStop(1, `rgba(${vr},${vg},${vb},0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(screen.x, screen.y, haloR, 0, Math.PI * 2)
        ctx.fill()
      }

      // Crisp, near-opaque core — the body itself reads sharp (energy only dims it).
      const coreAlpha = critical ? 0.55 + energyRatio * 0.30 : 0.80 + energyRatio * 0.18
      ctx.beginPath()
      ctx.arc(screen.x, screen.y, screenRadius, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${r},${g},${b},${(coreAlpha * orgDetail).toFixed(3)})`
      ctx.fill()

      // Non-chromatic reinforcement: a per-trait border STYLE on the ring. Only
      // when the dominant trait is a real signal — generalists get no ring.
      if (color.dominance > RING_MIN_DOMINANCE && orgDetail > 0.5) {
        drawTraitRing(ctx, screen.x, screen.y, screenRadius + lw * 1.4, TRAIT_BORDER[color.dominantTrait], color.glowRgb, 0.6 * orgDetail, lw * 1.1)
      }

      if (critical) {
        ctx.beginPath()
        ctx.arc(screen.x, screen.y, screenRadius + lw, 0, Math.PI * 2)
        ctx.lineWidth = lw * 1.3
        ctx.strokeStyle = `rgba(205,72,52,${(orgDetail * (0.20 + blink * 0.20)).toFixed(3)})`
        ctx.stroke()
      }

      if (selected) {
        ctx.beginPath()
        ctx.arc(screen.x, screen.y, screenRadius + lw * 5, 0, Math.PI * 2)
        ctx.lineWidth = lw * 2
        ctx.strokeStyle = 'rgba(226,226,226,0.72)'
        ctx.stroke()
      }
    }
  }

  return nextTrailMap
}

function drawPredator(
  ctx: Ctx,
  x: number,
  y: number,
  radius: number,
  angle: number,
  rgb: [number, number, number],
  alpha: number,
  critical: boolean,
  blink: number,
  selected: boolean,
  detail = 1,
) {
  const [r, g, b] = rgb
  const size = radius * 1.9
  const lw = 1
  const tip = rotatePoint(size, 0, angle, x, y)
  const backA = rotatePoint(-size * 0.62, -size * 0.72, angle, x, y)
  const backB = rotatePoint(-size * 0.62, size * 0.72, angle, x, y)

  ctx.beginPath()
  ctx.moveTo(tip.x, tip.y)
  ctx.lineTo(backA.x, backA.y)
  ctx.lineTo(backB.x, backB.y)
  ctx.closePath()
  ctx.fillStyle = `rgba(${r},${g},${b},${(alpha * detail).toFixed(3)})`
  ctx.fill()

  const outlineTip = rotatePoint(size + lw * 2.4, 0, angle, x, y)
  const outlineA = rotatePoint(-size * 0.62 - lw * 1.8, -size * 0.72 - lw * 1.8, angle, x, y)
  const outlineB = rotatePoint(-size * 0.62 - lw * 1.8, size * 0.72 + lw * 1.8, angle, x, y)

  ctx.beginPath()
  ctx.moveTo(outlineTip.x, outlineTip.y)
  ctx.lineTo(outlineA.x, outlineA.y)
  ctx.lineTo(outlineB.x, outlineB.y)
  ctx.closePath()
  ctx.strokeStyle = critical
    ? `rgba(220,50,30,${(detail * (0.30 + blink * 0.30)).toFixed(3)})`
    : `rgba(200,60,40,${(0.45 * detail).toFixed(3)})`
  ctx.lineWidth = lw * 1.6 * detail
  ctx.stroke()

  if (selected) {
    ctx.beginPath()
    ctx.arc(x, y, radius * 1.9 + lw * 6.4, 0, Math.PI * 2)
    ctx.lineWidth = lw * 2
    ctx.strokeStyle = 'rgba(226,226,226,0.72)'
    ctx.stroke()
  }
}

function rotatePoint(x: number, y: number, angle: number, originX: number, originY: number): Point {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: originX + x * cos - y * sin,
    y: originY + x * sin + y * cos,
  }
}

function drawSimpleFood(ctx: Ctx, food: FoodSnapshot, worldToScreen: (pos: Point) => Point, zoom: number) {
  const { x, y } = worldToScreen(food)
  const [r, g, b] = FOOD_RGB[food.kind]
  ctx.beginPath()
  ctx.arc(x, y, Math.max(1, food.radius * zoom), 0, Math.PI * 2)
  ctx.fillStyle = `rgba(${r},${g},${b},0.55)`
  ctx.fill()
}

function drawSimpleOrganism(
  ctx: Ctx,
  screen: Point,
  radius: number,
  rgb: [number, number, number],
  species: 'prey' | 'predator',
  selected: boolean,
  alphaMul = 1,
) {
  if (alphaMul <= 0) return
  const [r, g, b] = rgb
  const size = Math.max(species === 'predator' ? 2.4 : 1.8, Math.min(5, radius * 0.28))

  if (species === 'predator') {
    ctx.beginPath()
    ctx.moveTo(screen.x, screen.y - size)
    ctx.lineTo(screen.x + size, screen.y + size)
    ctx.lineTo(screen.x - size, screen.y + size)
    ctx.closePath()
  } else {
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2)
  }

  ctx.fillStyle = `rgba(${r},${g},${b},${(0.72 * alphaMul).toFixed(3)})`
  ctx.fill()

  if (selected) {
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, size + 4, 0, Math.PI * 2)
    ctx.lineWidth = 1
    ctx.strokeStyle = `rgba(226,226,226,${(0.8 * alphaMul).toFixed(3)})`
    ctx.stroke()
  }
}

function drawFood(ctx: Ctx, food: FoodSnapshot, worldToScreen: (pos: Point) => Point, zoom: number) {
  const { x, y } = worldToScreen(food)
  const [r, g, b] = FOOD_RGB[food.kind]
  const lw = 1

  if (food.kind === 'dense') {
    const s = 10 * zoom
    ctx.fillStyle = `rgba(${r},${g},${b},0.22)`
    ctx.fillRect(x - s, y - s, s * 2, s * 2)
    ctx.strokeStyle = `rgba(${r},${g},${b},0.35)`
    ctx.lineWidth = lw * 0.8
    ctx.strokeRect(x - s - lw * 1.6, y - s - lw * 1.6, (s + lw * 1.6) * 2, (s + lw * 1.6) * 2)
    return
  }

  if (food.kind === 'lean') {
    const d = 8 * zoom
    ctx.beginPath()
    ctx.moveTo(x,     y - d)
    ctx.lineTo(x + d, y)
    ctx.lineTo(x,     y + d)
    ctx.lineTo(x - d, y)
    ctx.closePath()
    ctx.fillStyle = `rgba(${r},${g},${b},0.18)`
    ctx.fill()
    ctx.strokeStyle = `rgba(${r},${g},${b},0.32)`
    ctx.lineWidth = lw * 0.8
    ctx.stroke()
    return
  }

  if (food.kind === 'rich') {
    ctx.beginPath()
    ctx.arc(x, y, 11 * zoom, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(${r},${g},${b},0.28)`
    ctx.lineWidth = lw * 1.1
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, 3.5 * zoom, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${r},${g},${b},0.50)`
    ctx.fill()
    return
  }

  // small: × marker
  const arm = 7 * zoom
  ctx.lineWidth = lw * 1.1
  ctx.strokeStyle = `rgba(${r},${g},${b},0.26)`
  ctx.beginPath()
  ctx.moveTo(x - arm, y - arm)
  ctx.lineTo(x + arm, y + arm)
  ctx.moveTo(x + arm, y - arm)
  ctx.lineTo(x - arm, y + arm)
  ctx.stroke()
}

function drawWorldGrid(
  ctx: Ctx,
  worldToScreen: (pos: Point) => Point,
  worldWidth: number,
  worldHeight: number,
  zoom: number,
) {
  const step = 128
  ctx.beginPath()
  ctx.strokeStyle = 'rgba(255,255,255,0.038)'
  ctx.lineWidth = Math.max(0.5, zoom)

  for (let x = 0; x <= worldWidth; x += step) {
    const from = worldToScreen({ x, y: 0 })
    const to = worldToScreen({ x, y: worldHeight })
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
  }

  for (let y = 0; y <= worldHeight; y += step) {
    const from = worldToScreen({ x: 0, y })
    const to = worldToScreen({ x: worldWidth, y })
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
  }

  ctx.stroke()
}

function drawWorldDebug(
  ctx: Ctx,
  worldToScreen: (pos: Point) => Point,
  worldWidth: number,
  worldHeight: number,
) {
  const topLeft = worldToScreen({ x: 0, y: 0 })
  const topRight = worldToScreen({ x: worldWidth, y: 0 })
  const bottomRight = worldToScreen({ x: worldWidth, y: worldHeight })
  const bottomLeft = worldToScreen({ x: 0, y: worldHeight })

  ctx.beginPath()
  ctx.moveTo(topLeft.x, topLeft.y)
  ctx.lineTo(topRight.x, topRight.y)
  ctx.lineTo(bottomRight.x, bottomRight.y)
  ctx.lineTo(bottomLeft.x, bottomLeft.y)
  ctx.closePath()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.stroke()

  for (const corner of [topLeft, topRight, bottomRight, bottomLeft]) {
    ctx.beginPath()
    ctx.arc(corner.x, corner.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,255,136,0.95)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function drawDensityField(
  ctx: Ctx,
  field: DensityFieldSnapshot,
  mode: 'food' | 'organism',
  worldToScreen: (pos: Point) => Point,
  zoom: number,
  worldWidth: number,
  worldHeight: number,
) {
  if (field.max <= 0) return

  const cellW = worldWidth / field.cols
  const cellH = worldHeight / field.rows

  for (let row = 0; row < field.rows; row++) {
    for (let col = 0; col < field.cols; col++) {
      const value = field.cells[row * field.cols + col] ?? 0
      if (value <= 0) continue
      const ratio = value / field.max
      const cx = col * cellW + cellW * 0.5
      const cy = row * cellH + cellH * 0.5
      const screen = worldToScreen({ x: cx, y: cy })

      if (mode === 'food') {
        if (ratio < 0.62) continue
        const glowRadius = Math.min(cellW, cellH) * zoom * (0.16 + ratio * 0.12)
        const gradient = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, glowRadius)
        gradient.addColorStop(0, `rgba(120,180,140,${(0.003 + ratio * 0.007).toFixed(3)})`)
        gradient.addColorStop(0.72, `rgba(120,180,140,${(0.001 + ratio * 0.003).toFixed(3)})`)
        gradient.addColorStop(1, 'rgba(120,180,140,0)')
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(screen.x, screen.y, glowRadius, 0, Math.PI * 2)
        ctx.fill()
        continue
      }

      if (ratio < 0.65) continue
      const alpha = 0.002 + ratio * 0.006
      const dotR = Math.min(cellW, cellH) * zoom * 0.18
      ctx.fillStyle = `rgba(226,226,226,${alpha.toFixed(3)})`
      ctx.beginPath()
      ctx.arc(screen.x, screen.y, dotR, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawEventMark(
  ctx: Ctx,
  event: RecentEventSnapshot,
  tick: number,
  worldToScreen: (pos: Point) => Point,
  zoom: number,
) {
  const age = tick - event.tick
  if (age < 0 || age > EVENT_TTL_TICKS) return

  const life = 1 - age / EVENT_TTL_TICKS
  const lw = 1
  const screen = worldToScreen(event)

  if (event.type === 'birth') {
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, (14 + life * 5) * zoom, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(168,220,184,${(life * 0.42).toFixed(3)})`
    ctx.fill()
    return
  }

  if (event.type === 'predation') {
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, (10 + life * 18) * zoom, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(220,130,40,${(life * 0.55).toFixed(3)})`
    ctx.lineWidth = lw * 1.6
    ctx.stroke()
    return
  }

  // death — small rect
  const s = 8 + life * 4
  ctx.fillStyle = `rgba(198,70,54,${(life * 0.38).toFixed(3)})`
  const screenSize = s * zoom
  ctx.fillRect(screen.x - screenSize / 2, screen.y - screenSize / 2, screenSize, screenSize)
}
