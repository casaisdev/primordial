// Message protocol between the main thread (UI) and the simulation worker.
//
// The worker owns the World, the camera, hit-testing and the OffscreenCanvas
// render loop, so the heavy per-frame arrays (organisms/foods/density) NEVER
// cross this boundary. Only a slim ViewState — the data the React HUD and side
// panels actually read — is posted back each displayed frame.
import type { SimConfig, SimStats, OrganismSnapshot } from './types'

export type Speed = 0.25 | 0.5 | 1 | 2 | 4 | 0
export type SimState = 'idle' | 'running' | 'paused'

// ── main thread → worker ───────────────────────────────────────────────
export type MainToWorker =
  // The transferred drawing surface, sent once on mount. `width`/`height` are CSS
  // pixels; `dpr` scales the backing store for crispness.
  | { type: 'canvas'; canvas: OffscreenCanvas; width: number; height: number; dpr: number }
  // Initial config (and the World is (re)built once both canvas + config arrive).
  | { type: 'config'; config: SimConfig }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'reset'; config: SimConfig }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'clearSelection' }
  | { type: 'setReducedMotion'; value: boolean }
  // Keyboard-driven camera/selection (accessibility): pan by a screen-pixel
  // delta, zoom by a multiplicative factor about the viewport centre, and cycle
  // the selected organism (which also centres the camera on it).
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoomBy'; factor: number }
  | { type: 'cycle'; dir: 1 | -1 }
  // Pointer/wheel coords are normalized fractions [0,1] of the container so the
  // worker can map them to its own viewport without knowing the DOM rect.
  | { type: 'pointerdown'; fx: number; fy: number; button: number }
  | { type: 'pointermove'; fx: number; fy: number }
  | { type: 'pointerup'; fx: number; fy: number }
  | { type: 'pointerleave' }
  | { type: 'wheel'; fx: number; fy: number; deltaY: number; deltaMode: number }

// ── worker → main thread ───────────────────────────────────────────────
export interface ViewState {
  stats: SimStats | null
  tick: number
  zoom: number
  cursorWorld: { x: number; y: number } | null
  hasLife: boolean
  // Full snapshots of just the hovered/selected organisms (for the inspector),
  // refreshed each frame so the panel tracks the organism as it moves/ages.
  hovered: OrganismSnapshot | null
  selected: OrganismSnapshot | null
}

export type WorkerToMain =
  | { type: 'ready'; seed: number }
  | { type: 'view'; view: ViewState }
