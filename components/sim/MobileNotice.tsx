'use client'

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'primordial:viewport-notice'

// A one-time advisory for phone visitors: the sim runs, but its instrument panel
// is laid out for a desktop viewport. Framed in the palette's warning colour
// (amber) so it reads as the instrument flagging a condition, not a generic toast.
// Dismissing it remembers the choice — it never nags twice.
//
// State lives in a tiny external store read through useSyncExternalStore (the same
// pattern useSimulation uses for its capability probe): the server snapshot is
// "dismissed", so SSR and the first client paint render nothing and agree, then it
// settles to the stored value — no hydration flash, no setState-in-effect.
const listeners = new Set<() => void>()

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dismissed'
  } catch {
    return false
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

function dismissNotice(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'dismissed')
  } catch {
    // Private mode / storage disabled — the in-memory listeners still hide it
    // for this session, which is enough.
  }
  for (const listener of listeners) listener()
}

export default function MobileNotice() {
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => true)
  if (dismissed) return null

  return (
    <div
      role="status"
      aria-label="Display notice"
      className="fixed inset-x-2 top-[52px] z-[60] hidden max-[860px]:block"
      style={{ animation: 'reveal 0.3s ease 0.12s both' }}
    >
      <div className="flex items-start gap-3 border border-amber/25 border-l-2 border-l-amber/70 bg-surface/95 px-4 py-3 shadow-[0_10px_34px_rgba(0,0,0,0.55)] backdrop-blur-md">
        <span
          aria-hidden="true"
          className="mt-[5px] inline-block size-[6px] shrink-0 bg-amber"
          style={{ boxShadow: '0 0 8px color-mix(in srgb, var(--amber) 80%, transparent)' }}
        />

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="lbl glow-amber text-[10px] text-amber">Display notice</span>
          <p className="text-[12px] leading-relaxed text-dim">
            Primordial&rsquo;s instrument panel is built for a desktop-width screen. It runs here, but
            the controls and telemetry get cramped on a phone.
          </p>
          <button
            type="button"
            onClick={dismissNotice}
            className="lbl mt-1 self-start text-[11px] text-ink transition-colors hover:text-amber"
          >
            Continue anyway →
          </button>
        </div>

        <button
          type="button"
          onClick={dismissNotice}
          aria-label="Dismiss notice"
          className="-mr-1.5 -mt-1 shrink-0 px-2 py-1 text-[15px] leading-none text-ghost transition-colors hover:text-ink"
        >
          ×
        </button>
      </div>
    </div>
  )
}
