'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import type { SimStats } from '@/sim/types'
import { TRAIT_RGB, TRAIT_BORDER, type TraitBorder, type TraitKey } from '@/sim/render'

// CSS rendering of each canvas border style, so the legend swatch shows the SAME
// non-chromatic cue (solid / dotted / dashed / double / thick) the canvas draws.
const BORDER_CSS: Record<TraitBorder, { borderStyle: string; borderWidth: string }> = {
  solid:  { borderStyle: 'solid',  borderWidth: '1px' },
  dotted: { borderStyle: 'dotted', borderWidth: '1px' },
  dashed: { borderStyle: 'dashed', borderWidth: '1px' },
  double: { borderStyle: 'double', borderWidth: '3px' },
  thick:  { borderStyle: 'solid',  borderWidth: '2px' },
}

// Thin presentation layer over the worker-owned OffscreenCanvas. This component
// transfers its <canvas> to the worker once, forwards pointer/wheel/resize events
// (as normalized fractions), and renders the React HUD from the slim props the
// worker reports back. All drawing, camera and hit-testing live in the worker.

interface Props {
  worker: Worker | null
  zoom: number
  stats: SimStats | null
  cursorPos: { x: number; y: number } | null
  hasLife: boolean
  worldWidth: number
  worldHeight: number
  // Reports the raw pointer screen position so the parent can place the hover
  // tooltip (the worker decides WHAT is hovered; the cursor lives on this thread).
  onPointerScreen: (pos: { x: number; y: number } | null) => void
  // False on browsers lacking Web Workers / OffscreenCanvas: we show a notice
  // rather than a dead black canvas.
  supported?: boolean
}

export default function SimCanvas({
  worker,
  zoom,
  stats,
  cursorPos,
  hasLife,
  worldWidth,
  worldHeight,
  onPointerScreen,
  supported = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const transferredRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  // Transfer the canvas to the worker exactly once. transferControlToOffscreen
  // is irreversible, so the transferredRef guard makes this safe under React
  // StrictMode's double-invoked effects.
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!worker || !canvas || !container || transferredRef.current) return
    transferredRef.current = true

    const rect = container.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const offscreen = canvas.transferControlToOffscreen()
    worker.postMessage({ type: 'canvas', canvas: offscreen, width, height, dpr }, [offscreen])
  }, [worker])

  // Report viewport size changes to the worker (it owns the camera/fit).
  useEffect(() => {
    const el = containerRef.current
    if (!el || !worker) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const width = Math.max(1, Math.round(entry.contentRect.width))
      const height = Math.max(1, Math.round(entry.contentRect.height))
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      worker.postMessage({ type: 'resize', width, height, dpr })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [worker])

  // Wheel must be a non-passive native listener so preventDefault works.
  useEffect(() => {
    const el = containerRef.current
    if (!el || !worker) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      worker.postMessage({
        type: 'wheel',
        fx: (e.clientX - rect.left) / rect.width,
        fy: (e.clientY - rect.top) / rect.height,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [worker])

  const fracOf = useCallback((e: React.PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect()
    return { fx: (e.clientX - rect.left) / rect.width, fy: (e.clientY - rect.top) / rect.height }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !worker) return
    const { fx, fy } = fracOf(e)
    worker.postMessage({ type: 'pointerdown', fx, fy, button: e.button })
    setIsDragging(true)
  }, [worker, fracOf])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!worker) return
    const { fx, fy } = fracOf(e)
    worker.postMessage({ type: 'pointermove', fx, fy })
    onPointerScreen({ x: e.clientX, y: e.clientY })
  }, [worker, fracOf, onPointerScreen])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false)
    if (!worker) return
    const { fx, fy } = fracOf(e)
    worker.postMessage({ type: 'pointerup', fx, fy })
  }, [worker, fracOf])

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
    onPointerScreen(null)
    worker?.postMessage({ type: 'pointerleave' })
  }, [worker, onPointerScreen])

  // Keyboard control so the world is usable without a pointer: arrows pan,
  // +/- zoom, n/p cycle the selected organism (centering on it), Esc clears.
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!worker) return
    const PAN = 48
    switch (e.key) {
      case 'ArrowUp': worker.postMessage({ type: 'pan', dx: 0, dy: -PAN }); break
      case 'ArrowDown': worker.postMessage({ type: 'pan', dx: 0, dy: PAN }); break
      case 'ArrowLeft': worker.postMessage({ type: 'pan', dx: -PAN, dy: 0 }); break
      case 'ArrowRight': worker.postMessage({ type: 'pan', dx: PAN, dy: 0 }); break
      case '+': case '=': worker.postMessage({ type: 'zoomBy', factor: 1.2 }); break
      case '-': case '_': worker.postMessage({ type: 'zoomBy', factor: 1 / 1.2 }); break
      case 'n': case ']': worker.postMessage({ type: 'cycle', dir: 1 }); break
      case 'p': case '[': worker.postMessage({ type: 'cycle', dir: -1 }); break
      case 'Escape': worker.postMessage({ type: 'clearSelection' }); break
      default: return
    }
    e.preventDefault()
  }, [worker])

  // Honor prefers-reduced-motion: tell the worker to freeze trails/blink/event rings.
  useEffect(() => {
    if (!worker || typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => worker.postMessage({ type: 'setReducedMotion', value: mq.matches })
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [worker])

  const liveSummary = hasLife
    ? `Ecosystem ${stats?.telemetryState ?? 'stable'}: ${stats?.ecosystemState ?? ''}.`
    : 'No life detected in the environment.'

  const cxLabel = cursorPos ? `x: ${cursorPos.x}` : 'x: -'
  const cyLabel = cursorPos ? `y: ${cursorPos.y}` : 'y: -'
  const pressurePct = `${Math.round((stats?.resourcePressure ?? 0) * 100)}%`
  const critical = stats?.criticalOrganisms ?? 0

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label="Simulation viewport. Arrow keys pan, plus and minus zoom, N and P cycle through organisms, Escape clears the selection."
      className="relative overflow-hidden border-r border-wire"
      style={{
        animation: 'reveal 0.25s ease 0.06s both',
        cursor: isDragging ? 'grabbing' : 'crosshair',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />

      {/* Screen-reader summary of the ecosystem state; announces on change only. */}
      <div className="sr-only" role="status" aria-live="polite">{liveSummary}</div>

      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/[0.03]" />
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/[0.03]" />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px will-change-transform"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(150,190,170,0.025) 25%, rgba(150,190,170,0.04) 50%, rgba(150,190,170,0.025) 75%, transparent 100%)',
          animation: 'scan-line 11s linear infinite',
        }}
      />

      <Mark pos="tl" />
      <Mark pos="tr" />
      <Mark pos="bl" />
      <Mark pos="br" />

      <div className="pointer-events-none absolute top-0 inset-x-0 flex">
        {Array.from({ length: 17 }).map((_, i) => (
          <div key={i} className="h-1.5 flex-1 border-r border-wire last:border-r-0" />
        ))}
      </div>
      <div className="pointer-events-none absolute left-0 inset-y-0 flex flex-col">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="w-1.5 flex-1 border-b border-wire last:border-b-0" />
        ))}
      </div>

      {hasLife && (
        <>
          <div className="pointer-events-none absolute right-0 top-0 flex flex-col items-end gap-[3px] px-5 pt-4">
            <div className="lbl flex items-center gap-2 text-[9px]">
              <span className="text-ghost">ECO</span>
              <span className="text-life/80 glow-soft">
                {stats?.telemetryState ?? 'STABILITY'}
              </span>
            </div>
            <div className="max-w-[180px] truncate text-right text-[9px] tracking-[0.02em] text-ghost">
              {stats?.ecosystemState ?? 'stable equilibrium'}
            </div>
            <div className="lbl mt-px flex items-center gap-2 text-[8px] tabular-nums text-ghost">
              <span>P {pressurePct}</span>
              <span className="text-wire-hi">╴</span>
              <span>C {critical}</span>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-8 left-3 border border-wire bg-fill-0 backdrop-blur-[2px] max-[860px]:hidden">
            <div className="border-b border-wire-lo px-3 py-1.5">
              <span className="lbl text-[8px] text-ghost">Trait Spectrum</span>
            </div>
            <div className="flex flex-col gap-[5px] px-3 py-2">
              {(Object.entries(TRAIT_RGB) as [TraitKey, [number, number, number]][]).map(([key, [r, g, b]]) => {
                const label =
                  key === 'energyEfficiency' ? 'EFF' :
                  key === 'reproductionRate'  ? 'REP' :
                  key.slice(0, 3).toUpperCase()
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0"
                      style={{ borderColor: `rgba(${r},${g},${b},0.85)`, ...BORDER_CSS[TRAIT_BORDER[key]] }}
                    />
                    <div
                      className="h-[2px] w-8 shrink-0"
                      style={{ background: `linear-gradient(90deg, rgba(${r},${g},${b},0.12) 0%, rgba(${r},${g},${b},0.88) 100%)` }}
                    />
                    <span className="w-5 text-[7px] tracking-[0.14em]" style={{ color: `rgba(${r},${g},${b},0.65)` }}>
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      <div className="pointer-events-none absolute bottom-0 inset-x-0 flex h-7 items-center justify-between border-t border-wire bg-void/40 px-5 backdrop-blur-[2px]">
        <span className="flex items-center gap-3 text-[9px] tracking-[0.06em] text-ghost">
          <span className="tabular-nums">{worldWidth} x {worldHeight}</span>
          <span className="text-wire-hi">·</span>
          <span><span className="lbl text-[8px]">zoom</span> <span className="tabular-nums">{Math.round(zoom * 100)}%</span></span>
          <span className="text-wire-hi">·</span>
          <span className="lbl text-[8px]">{stats?.dominantLabel ?? 'NONE'}</span>
        </span>
        <span className="text-[9px] tracking-[0.06em] text-ghost tabular-nums max-[860px]:hidden">
          {cxLabel} {'  '} {cyLabel}
        </span>
      </div>

      {supported && !hasLife && (
        <div className="pointer-events-none absolute inset-0 mb-7 flex select-none flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-3">
            <DormantCell delay="0s" />
            <DormantCell delay="0.55s" />
            <DormantCell delay="1.1s" />
          </div>
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <span className="lbl text-[11px] tracking-[0.32em] text-dim">VOID</span>
            <span className="text-[9px] tracking-[0.08em] text-ghost">
              no life detected in this environment
            </span>
          </div>
        </div>
      )}

      {!supported && (
        <div className="absolute inset-0 mb-7 flex select-none flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="lbl text-[11px] tracking-[0.32em] text-dim">UNSUPPORTED ENVIRONMENT</span>
          <span className="max-w-[320px] text-[10px] leading-relaxed tracking-[0.04em] text-ghost">
            This simulation renders through a Web Worker and an OffscreenCanvas, which this
            browser doesn&rsquo;t provide. Try a recent Chrome, Edge, Firefox, or Safari 16.4+.
          </span>
        </div>
      )}
    </div>
  )
}

function Mark({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const placement =
    pos === 'tl' ? 'top-5 left-5' :
    pos === 'tr' ? 'top-5 right-5' :
    pos === 'bl' ? 'bottom-12 left-5' :
      'bottom-12 right-5'

  return (
    <div className={`pointer-events-none absolute size-4 ${placement}`}>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-life/20" />
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-life/20" />
    </div>
  )
}

function DormantCell({ delay }: { delay: string }) {
  return (
    <div
      className="size-[5px] border border-ghost/50"
      style={{ animation: `blink 3s step-end ${delay} infinite` }}
    />
  )
}
