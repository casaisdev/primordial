import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About',
  description:
    'How Primordial works: an honest account of the evolutionary mechanics behind the simulation.',
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between border-b border-wire pb-4">
        <span className="glow-soft text-[15px] font-semibold lowercase tracking-[0.08em] text-ink">primordial</span>
        <Link href="/" className="lbl text-[11px] text-dim no-underline hover:text-ink">← back to sim</Link>
      </header>

      <article className="flex flex-col gap-6 text-[13px] leading-relaxed text-ghost">
        <h1 className="text-[20px] font-semibold text-ink">About</h1>
        <p>
          Primordial is a Darwinian artificial-life simulation. Each organism carries a genome —
          five physical traits (speed, size, vision, energy efficiency, reproduction rate) under a
          shared budget, plus a small neural network — that it passes to offspring with mutation.
          Nothing is scripted: who eats, survives and breeds is decided by energy, age and the
          environment, and the trait distribution drifts over generations as a result.
        </p>

        <h2 className="lbl text-[12px] text-life">There is no fitness function</h2>
        <p>
          Nothing scores an organism and breeds the winners. One that gathers enough energy crosses
          a reproduction threshold and spawns a mutated child; one that runs out of energy or reaches
          its lifespan dies. &ldquo;Fitness&rdquo; is just whatever happens to survive long enough to
          reproduce — an <span className="text-ink">observation</span>, never an input. Take the
          scoring away and the ecology has to balance on its own, which is the whole point.
        </p>

        <h2 className="lbl text-[12px] text-life">What is and isn&apos;t evolved</h2>
        <p>
          In the spirit of honesty about the mechanics: prey foraging is driven by the evolved
          neural brain, but predator hunting is a fixed pursuit heuristic — what evolution tunes
          there are the physical traits that decide a chase (speed, vision, size). The predator–prey
          cycle itself is fully emergent from population densities.
        </p>

        <h2 className="lbl text-[12px] text-life">Extinction is allowed</h2>
        <p>
          By default, anti-extinction floors keep both species ever-present so the ecosystem settles
          into a sustained limit cycle. Enable <span className="text-ink">allow extinction</span> in
          the LAB panel to remove those floors — then selection pressure can actually wipe a
          population out, the most basic Darwinian outcome.
        </p>

        <h2 className="lbl text-[12px] text-life">It&apos;s deterministic</h2>
        <p>
          Fix the <span className="text-ink">seed</span> in the LAB panel and the entire run replays
          bit-for-bit — not just the statistics, the whole world. Every random draw flows through one
          seeded stream, so the same seed always yields the same history. Leave the seed on AUTO for a
          fresh world each time.
        </p>

        <Link href="/docs" className="lbl text-[12px] text-dim no-underline hover:text-ink">
          → how to read the simulation
        </Link>
      </article>
    </main>
  )
}
