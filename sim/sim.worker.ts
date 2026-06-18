// Simulation worker. Owns the entire hot path off the main thread: the World,
// the camera, wheel-zoom easing, drag-pan, organism hit-testing, and the
// OffscreenCanvas render loop. The main thread only forwards input events and
// receives a slim ViewState for the React HUD/panels — the per-frame
// organism/food/density arrays never cross the worker boundary.
//
// Determinism is unaffected: the seeded mulberry32 stream runs identically here.
import { World } from './World'
import type { SimConfig, WorldSnapshot } from './types'
import { renderWorld, type Camera } from './render'
import { advanceCadence } from './stepCadence'
import type { MainToWorker, WorkerToMain, ViewState, Speed } from './protocol'

// MAX (speed 0) fast-forwards: per-tick cost is tiny, but building a snapshot +
// repainting dominates, so run many steps per frame under a time budget and
// paint once. Mirrors the old main-thread loop.
const MAX_SPEED_TICKS_PER_FRAME = 60
const MAX_SPEED_FRAME_BUDGET_MS = 14

const MIN_ZOOM = 0.04
const MAX_ZOOM = 4.0
const ZOOM_SENSITIVITY = 0.0005
const ZOOM_DELTA_CLAMP = 100
const ZOOM_SMOOTH_RATE = 18
const FIT_MARGIN = 0.92

const raf: (cb: (ts: number) => void) => number =
  typeof requestAnimationFrame !== 'undefined'
    ? requestAnimationFrame
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number

function post(msg: WorkerToMain, transfer?: Transferable[]) {
  ;(self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void }).postMessage(msg, transfer)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// ── Worker state ───────────────────────────────────────────────────────
let world: World | null = null
let config: SimConfig | null = null
let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let snapshot: WorldSnapshot | null = null

let viewportWidth = 512
let viewportHeight = 512
let dpr = 1
let fitZoom = MIN_ZOOM

let simState: 'idle' | 'running' | 'paused' = 'idle'
let speed: Speed = 0.5
let accum = 0

let camera: Camera = { x: 0, y: 0, zoom: MIN_ZOOM }
let trails = new Map<number, { x: number; y: number }>()

// Wheel-zoom easing
let zoomTarget = MIN_ZOOM
let zoomAnchor: { sx: number; sy: number; world: { x: number; y: number } } | null = null
let zoomAnimating = false
let zoomLastTs = 0

// Drag-pan
let dragging = false
let dragHasMoved = false
let dragLast = { sx: 0, sy: 0 }

// Selection / hover (worker owns these because it owns hit-testing)
let selectedOrgId: number | null = null
let hoveredOrgId: number | null = null
let lastCursorWorld: { x: number; y: number } | null = null

let rafId = 0
let dirty = false
let reducedMotion = false

// ── Coordinate helpers (current camera/viewport) ───────────────────────
function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  return {
    x: (sx - viewportWidth / 2) / camera.zoom + camera.x,
    y: (sy - viewportHeight / 2) / camera.zoom + camera.y,
  }
}

function computeFitZoom(): number {
  const w = config?.worldWidth ?? 1
  const h = config?.worldHeight ?? 1
  return Math.max(MIN_ZOOM, Math.min(viewportWidth / w, viewportHeight / h) * FIT_MARGIN)
}

function findNearestOrg(wx: number, wy: number) {
  if (!snapshot) return null
  const zoom = camera.zoom
  let nearest = null
  let nearestDist = Infinity
  for (const org of snapshot.organisms) {
    const dx = org.x - wx
    const dy = org.y - wy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const hitRadius = (16 + org.genome.size * 12) * 1.4 + 6 / zoom
    if (dist < hitRadius && dist < nearestDist) {
      nearest = org
      nearestDist = dist
    }
  }
  return nearest
}

// ── Loop ───────────────────────────────────────────────────────────────
function schedule() {
  if (!rafId) rafId = raf(frame)
}

function kick() {
  dirty = true
  schedule()
}

// Advance the sim per the current speed. Returns true if `snapshot` changed.
function stepSim(): boolean {
  if (!world) return false
  const s = speed
  // MAX (s ≤ 0): fast-forward as many ticks as fit a wall-clock budget, then
  // paint once. Time-budgeted, so it can't be a fixed per-frame count.
  if (s <= 0) {
    world.step()
    const deadline = performance.now() + MAX_SPEED_FRAME_BUDGET_MS
    for (let i = 1; i < MAX_SPEED_TICKS_PER_FRAME && performance.now() < deadline; i++) {
      world.step()
    }
    snapshot = world.buildSnapshot()
    return true
  }
  const { ticks, accum: nextAccum } = advanceCadence(s, accum)
  accum = nextAccum
  if (ticks === 0) return false
  for (let i = 0; i < ticks; i++) world.step()
  snapshot = world.buildSnapshot()
  return true
}

function easeZoom(ts: number) {
  if (!zoomAnchor) return
  const dt = zoomLastTs ? Math.min(0.05, (ts - zoomLastTs) / 1000) : 1 / 60
  zoomLastTs = ts
  const t = 1 - Math.exp(-ZOOM_SMOOTH_RATE * dt)
  const eased = camera.zoom + (zoomTarget - camera.zoom) * t
  const done = Math.abs(zoomTarget - eased) < 0.0005
  const zoom = done ? zoomTarget : eased
  const w = config?.worldWidth ?? 0
  const h = config?.worldHeight ?? 0
  camera = {
    zoom,
    x: clamp(zoomAnchor.world.x - (zoomAnchor.sx - viewportWidth / 2) / zoom, 0, w),
    y: clamp(zoomAnchor.world.y - (zoomAnchor.sy - viewportHeight / 2) / zoom, 0, h),
  }
  if (done) {
    zoomAnimating = false
    zoomAnchor = null
    zoomLastTs = 0
  }
}

function render() {
  if (!ctx || !snapshot) return
  trails = renderWorld(ctx, {
    organisms: snapshot.organisms,
    foods: snapshot.foods,
    recentEvents: snapshot.recentEvents,
    resourceDensity: snapshot.resourceDensity,
    organismDensity: snapshot.organismDensity,
    worldWidth: config?.worldWidth ?? 0,
    worldHeight: config?.worldHeight ?? 0,
    viewportWidth,
    viewportHeight,
    dpr,
    camera,
    tick: snapshot.tick,
    renderSimplified: speed === 0,
    selectedOrgId,
    fitZoom,
    prevTrails: trails,
    reducedMotion,
  })
}

function lookup(id: number | null) {
  if (id === null || !snapshot) return null
  return snapshot.organisms.find((o) => o.id === id) ?? null
}

function postView() {
  const view: ViewState = {
    stats: snapshot?.stats ?? null,
    tick: snapshot?.tick ?? 0,
    zoom: camera.zoom,
    cursorWorld: lastCursorWorld,
    hasLife: (snapshot?.organisms.length ?? 0) > 0,
    hovered: lookup(hoveredOrgId),
    selected: lookup(selectedOrgId),
  }
  post({ type: 'view', view })
}

function frame(ts: number) {
  rafId = 0
  try {
    if (simState === 'running' && world) {
      if (stepSim()) dirty = true
    }
    if (zoomAnimating && zoomAnchor) {
      easeZoom(ts)
      dirty = true
    } else {
      zoomLastTs = 0
    }
    if (dirty && ctx && snapshot) {
      render()
      postView()
      dirty = false
    }
    if (simState === 'running' || zoomAnimating) schedule()
  } catch (err) {
    // Stop the loop rather than spinning on a throwing frame; let the error
    // propagate to the worker's onerror so the UI can surface it.
    simState = 'paused'
    zoomAnimating = false
    throw err
  }
}

// ── Initialization ─────────────────────────────────────────────────────
function tryInit() {
  if (world || !config || !canvas || !ctx) return
  world = new World(config)
  snapshot = world.buildInitialSnapshot()
  fitZoom = computeFitZoom()
  camera = { x: config.worldWidth / 2, y: config.worldHeight / 2, zoom: fitZoom }
  simState = 'idle'
  accum = 0
  post({ type: 'ready', seed: world.getSeed() })
  kick()
}

function applyCanvasSize() {
  if (!canvas) return
  canvas.width = Math.max(1, Math.round(viewportWidth * dpr))
  canvas.height = Math.max(1, Math.round(viewportHeight * dpr))
}

// ── Message handling ───────────────────────────────────────────────────
function handle(msg: MainToWorker) {
  switch (msg.type) {
    case 'canvas': {
      canvas = msg.canvas
      viewportWidth = msg.width
      viewportHeight = msg.height
      dpr = msg.dpr
      ctx = canvas.getContext('2d')
      applyCanvasSize()
      fitZoom = computeFitZoom()
      tryInit()
      break
    }
    case 'config': {
      config = msg.config
      tryInit()
      break
    }
    case 'reset': {
      config = msg.config
      world = new World(config)
      snapshot = world.buildInitialSnapshot()
      fitZoom = computeFitZoom()
      // Keep the user's current view; just clamp it into the (possibly new) bounds.
      camera = {
        zoom: camera.zoom,
        x: clamp(camera.x, 0, config.worldWidth),
        y: clamp(camera.y, 0, config.worldHeight),
      }
      simState = 'idle'
      accum = 0
      selectedOrgId = null
      hoveredOrgId = null
      zoomAnimating = false
      zoomAnchor = null
      post({ type: 'ready', seed: world.getSeed() })
      kick()
      break
    }
    case 'start': {
      if (!world) break
      simState = 'running'
      accum = 0
      kick()
      break
    }
    case 'pause': {
      simState = 'paused'
      break
    }
    case 'setSpeed': {
      speed = msg.speed
      accum = 0
      kick()
      break
    }
    case 'resize': {
      if (msg.width === viewportWidth && msg.height === viewportHeight && msg.dpr === dpr) break
      viewportWidth = msg.width
      viewportHeight = msg.height
      dpr = msg.dpr
      applyCanvasSize()
      fitZoom = computeFitZoom()
      // Re-fit the view on resize (matches the old ResizeObserver behavior).
      if (config) {
        camera = { x: config.worldWidth / 2, y: config.worldHeight / 2, zoom: fitZoom }
      }
      zoomAnimating = false
      zoomAnchor = null
      kick()
      break
    }
    case 'clearSelection': {
      selectedOrgId = null
      kick()
      break
    }
    case 'setReducedMotion': {
      reducedMotion = msg.value
      kick()
      break
    }
    case 'pan': {
      const w = config?.worldWidth ?? 0
      const h = config?.worldHeight ?? 0
      camera = {
        zoom: camera.zoom,
        x: clamp(camera.x + msg.dx / camera.zoom, 0, w),
        y: clamp(camera.y + msg.dy / camera.zoom, 0, h),
      }
      kick()
      break
    }
    case 'zoomBy': {
      zoomTarget = clamp((zoomAnimating ? zoomTarget : camera.zoom) * msg.factor, MIN_ZOOM, MAX_ZOOM)
      // Anchor the zoom at the viewport centre for keyboard zoom.
      zoomAnchor = { sx: viewportWidth / 2, sy: viewportHeight / 2, world: screenToWorld(viewportWidth / 2, viewportHeight / 2) }
      zoomAnimating = true
      kick()
      break
    }
    case 'cycle': {
      if (!snapshot || snapshot.organisms.length === 0) break
      // Stable ordering by id so cycling is predictable across frames.
      const ids = snapshot.organisms.map((o) => o.id).sort((a, b) => a - b)
      const current = selectedOrgId === null ? -1 : ids.indexOf(selectedOrgId)
      const next = current === -1
        ? (msg.dir === 1 ? 0 : ids.length - 1)
        : (current + msg.dir + ids.length) % ids.length
      selectedOrgId = ids[next]
      const org = snapshot.organisms.find((o) => o.id === selectedOrgId)
      if (org) {
        const w = config?.worldWidth ?? 0
        const h = config?.worldHeight ?? 0
        camera = { zoom: camera.zoom, x: clamp(org.x, 0, w), y: clamp(org.y, 0, h) }
      }
      kick()
      break
    }
    case 'pointerdown': {
      if (msg.button !== 0) break
      dragging = true
      dragHasMoved = false
      dragLast = { sx: msg.fx * viewportWidth, sy: msg.fy * viewportHeight }
      break
    }
    case 'pointermove': {
      const sx = msg.fx * viewportWidth
      const sy = msg.fy * viewportHeight
      if (dragging) {
        if (Math.abs(sx - dragLast.sx) > 2 || Math.abs(sy - dragLast.sy) > 2) dragHasMoved = true
        const prevWorld = screenToWorld(dragLast.sx, dragLast.sy)
        const nextWorld = screenToWorld(sx, sy)
        const w = config?.worldWidth ?? 0
        const h = config?.worldHeight ?? 0
        camera = {
          zoom: camera.zoom,
          x: clamp(camera.x + prevWorld.x - nextWorld.x, 0, w),
          y: clamp(camera.y + prevWorld.y - nextWorld.y, 0, h),
        }
        dragLast = { sx, sy }
        kick()
      } else {
        const wpt = screenToWorld(sx, sy)
        lastCursorWorld = { x: Math.round(wpt.x), y: Math.round(wpt.y) }
        const hit = findNearestOrg(wpt.x, wpt.y)
        hoveredOrgId = hit ? hit.id : null
        kick()
      }
      break
    }
    case 'pointerup': {
      const wasDrag = dragHasMoved
      dragging = false
      dragHasMoved = false
      if (!wasDrag) {
        const wpt = screenToWorld(msg.fx * viewportWidth, msg.fy * viewportHeight)
        const hit = findNearestOrg(wpt.x, wpt.y)
        selectedOrgId = !hit ? null : selectedOrgId === hit.id ? null : hit.id
        if (hit) hoveredOrgId = hit.id
        kick()
      }
      break
    }
    case 'pointerleave': {
      lastCursorWorld = null
      hoveredOrgId = null
      dragging = false
      dragHasMoved = false
      kick()
      break
    }
    case 'wheel': {
      const sx = msg.fx * viewportWidth
      const sy = msg.fy * viewportHeight
      let dy = msg.deltaY
      if (msg.deltaMode === 1) dy *= 16
      else if (msg.deltaMode === 2) dy *= viewportHeight
      dy = clamp(dy, -ZOOM_DELTA_CLAMP, ZOOM_DELTA_CLAMP)
      const factor = Math.exp(-dy * ZOOM_SENSITIVITY)
      zoomTarget = clamp((zoomAnimating ? zoomTarget : camera.zoom) * factor, MIN_ZOOM, MAX_ZOOM)
      zoomAnchor = { sx, sy, world: screenToWorld(sx, sy) }
      zoomAnimating = true
      kick()
      break
    }
  }
}

self.addEventListener('message', (e: MessageEvent) => handle(e.data as MainToWorker))
