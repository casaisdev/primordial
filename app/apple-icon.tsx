import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: '#050508',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Outer diffuse ring */}
      <div
        style={{
          position: 'absolute',
          width: 110,
          height: 110,
          borderRadius: '50%',
          border: '1px solid rgba(0,255,136,0.08)',
        }}
      />
      {/* Middle ring */}
      <div
        style={{
          position: 'absolute',
          width: 78,
          height: 78,
          borderRadius: '50%',
          border: '1px solid rgba(0,255,136,0.18)',
        }}
      />
      {/* Cell membrane */}
      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: '50%',
          background: 'rgba(0,255,136,0.06)',
          border: '1.5px solid rgba(0,255,136,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Nucleus */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#00FF88',
            boxShadow: '0 0 24px rgba(0,255,136,0.9)',
          }}
        />
      </div>
    </div>,
    { ...size }
  )
}
