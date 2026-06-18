import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const DOTS = [
  { top: 52,  right: 148, size: 6, color: 'rgba(0,255,136,0.55)' },
  { top: 88,  right: 210, size: 3, color: 'rgba(0,255,136,0.30)' },
  { top: 44,  right: 260, size: 4, color: 'rgba(0,102,255,0.50)' },
  { top: 124, right: 132, size: 3, color: 'rgba(255,68,0,0.45)'  },
  { top: 72,  right: 320, size: 5, color: 'rgba(0,255,136,0.25)' },
  { top: 160, right: 195, size: 4, color: 'rgba(0,102,255,0.35)' },
  { top: 108, right: 280, size: 6, color: 'rgba(0,255,136,0.40)' },
  { top: 56,  right: 380, size: 3, color: 'rgba(255,68,0,0.30)'  },
  { top: 140, right: 350, size: 4, color: 'rgba(0,255,136,0.20)' },
  { top: 92,  right: 420, size: 5, color: 'rgba(0,102,255,0.25)' },
  { top: 180, right: 160, size: 3, color: 'rgba(0,255,136,0.35)' },
  { top: 40,  right: 460, size: 4, color: 'rgba(255,68,0,0.20)'  },
]

export default async function OGImage() {
  const fontFamily = 'monospace'

  return new ImageResponse(
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#050508',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Microscope viewfinder — top-left corner lines */}
      <div style={{ position: 'absolute', top: 64, left: 0, width: 140, height: 1, background: 'rgba(0,255,136,0.1)', display: 'flex' }} />
      <div style={{ position: 'absolute', top: 0, left: 90, width: 1, height: 120, background: 'rgba(0,255,136,0.1)', display: 'flex' }} />
      <div style={{ position: 'absolute', top: 62, left: 88, width: 5, height: 5, borderRadius: '50%', border: '1px solid rgba(0,255,136,0.4)', display: 'flex' }} />

      {/* Organism scatter — top right */}
      {DOTS.map((d, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: d.top,
            right: d.right,
            width: d.size,
            height: d.size,
            borderRadius: '50%',
            background: d.color,
            display: 'flex',
          }}
        />
      ))}

      {/* Right edge rule */}
      <div style={{ position: 'absolute', top: 0, right: 540, width: 1, height: '100%', background: 'rgba(232,232,232,0.03)', display: 'flex' }} />

      {/* Main content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
          paddingLeft: 100,
          paddingRight: 360,
        }}
      >
        {/* Dot + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginBottom: 38 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#00FF88',
              boxShadow: '0 0 24px rgba(0,255,136,0.8)',
              flexShrink: 0,
              display: 'flex',
            }}
          />
          <span
            style={{
              fontSize: 106,
              fontWeight: 400,
              color: '#E8E8E8',
              letterSpacing: '-3px',
              lineHeight: 1,
              fontFamily,
            }}
          >
            primordial
          </span>
        </div>

        {/* Tagline */}
        <span
          style={{
            fontSize: 30,
            color: 'rgba(232,232,232,0.45)',
            fontFamily,
            letterSpacing: '0.04em',
            lineHeight: 1.55,
            paddingLeft: 48,
          }}
        >
          Darwinian artificial life simulation.{'\n'}
          No script. No destination. Only selection.
        </span>
      </div>

      {/* Bottom status bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 52,
          left: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#00FF88',
            boxShadow: '0 0 8px rgba(0,255,136,0.7)',
            display: 'flex',
          }}
        />
        <span
          style={{
            fontSize: 12,
            color: 'rgba(0,255,136,0.5)',
            fontFamily,
            letterSpacing: '0.14em',
          }}
        >
          GEN 0000 · 0 ORGANISMS · Δt = 0.000s
        </span>
      </div>
    </div>,
    {
      ...size,
    }
  )
}
