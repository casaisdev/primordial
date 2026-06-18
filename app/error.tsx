'use client'

import { useEffect } from 'react'

// Route-level error boundary. Catches render-time throws in the sim tree and
// offers a recovery affordance instead of a blank screen.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[primordial] render error:', error)
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <span className="lbl text-[11px] tracking-[0.32em] text-fire">SIMULATION FAULT</span>
      <p className="max-w-sm text-[13px] leading-relaxed text-ghost">
        The simulation hit an unexpected error and stopped. Your environment can be re-seeded.
      </p>
      <button
        onClick={reset}
        className="lbl border border-wire px-4 py-2 text-[11px] text-ink transition-colors hover:bg-fill-2"
      >
        ↺ restart
      </button>
    </main>
  )
}
