'use client'

import { useRef, useState, useCallback, useEffect, useSyncExternalStore } from 'react'
import type { SimConfig } from '@/sim/types'
import { DEFAULT_CONFIG } from '@/sim/types'
import type { MainToWorker, WorkerToMain, ViewState, Speed, SimState } from '@/sim/protocol'

// Re-exported for consumers (e.g. ControlBar) that previously imported these here.
export type { Speed, SimState } from '@/sim/protocol'

// The whole renderer lives in a worker that paints a transferred OffscreenCanvas.
// Both pieces are required — there is no main-thread fallback path — so we probe
// for them up front and surface a clear message instead of a dead black canvas
// on browsers that lack either (e.g. Safari < 16.4, legacy WebViews).
export function supportsOffscreenWorker(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function'
  )
}

// The capability never changes after load, so the store has a no-op subscribe.
// The server snapshot is optimistic (true) so SSR and the first client render
// agree — useSyncExternalStore then settles to the real value on the client
// without a hydration mismatch.
const NEVER_CHANGES = () => () => {}

// Drives the simulation worker. The worker owns the World, camera, hit-testing
// and the OffscreenCanvas render loop; this hook only sends commands and surfaces
// the slim per-frame ViewState the React UI reads.
export function useSimulation(config: SimConfig = DEFAULT_CONFIG) {
  const workerRef = useRef<Worker | null>(null)
  const teardownRef = useRef<number>(0)
  const configRef = useRef<SimConfig>(config)

  // True during SSR + first client paint (so the HTML matches), then settles to
  // the real probe on the client — no hydration mismatch, no setState-in-effect.
  const supported = useSyncExternalStore(NEVER_CHANGES, supportsOffscreenWorker, () => true)
  const [worker, setWorker] = useState<Worker | null>(null)
  const [view, setView] = useState<ViewState | null>(null)
  const [simState, setSimState] = useState<SimState>('idle')
  const [speed, setSpeedState] = useState<Speed>(0.5)
  const [activeSeed, setActiveSeed] = useState<number | null>(null)

  useEffect(() => {
    configRef.current = config
  }, [config])

  // Create the worker once. OffscreenCanvas transfer is a one-shot operation
  // that cannot survive a teardown+recreate, so we keep the worker alive across
  // React StrictMode's synthetic unmount by DEFERRING teardown: a real unmount
  // lets the timer fire; a StrictMode remount cancels it on the next run.
  useEffect(() => {
    if (!supportsOffscreenWorker()) return
    if (teardownRef.current) {
      clearTimeout(teardownRef.current)
      teardownRef.current = 0
    }

    if (!workerRef.current) {
      const w = new Worker(new URL('../sim/sim.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<WorkerToMain>) => {
        const msg = e.data
        if (msg.type === 'ready') {
          setActiveSeed(msg.seed)
          setSimState('idle')
        } else if (msg.type === 'view') {
          setView(msg.view)
        }
      }
      w.onerror = (e) => {
        console.error('[primordial] simulation worker error:', e.message || e)
      }
      w.postMessage({ type: 'config', config: configRef.current } satisfies MainToWorker)
      workerRef.current = w
      setWorker(w)
    }

    return () => {
      teardownRef.current = window.setTimeout(() => {
        workerRef.current?.terminate()
        workerRef.current = null
        setWorker(null)
      }, 0)
    }
  }, [])

  const send = useCallback((msg: MainToWorker) => {
    workerRef.current?.postMessage(msg)
  }, [])

  const start = useCallback(() => {
    send({ type: 'start' })
    setSimState('running')
  }, [send])

  const pause = useCallback(() => {
    send({ type: 'pause' })
    setSimState('paused')
  }, [send])

  const setSpeed = useCallback((s: Speed) => {
    send({ type: 'setSpeed', speed: s })
    setSpeedState(s)
  }, [send])

  const recreate = useCallback((nextConfig?: SimConfig) => {
    const next = nextConfig ?? configRef.current
    configRef.current = next
    send({ type: 'reset', config: next })
    setSimState('idle')
  }, [send])

  const clearSelection = useCallback(() => {
    send({ type: 'clearSelection' })
  }, [send])

  return {
    worker,
    supported,
    view,
    simState,
    speed,
    activeSeed,
    start,
    pause,
    reset: recreate,
    restart: recreate,
    setSpeed,
    clearSelection,
  }
}
