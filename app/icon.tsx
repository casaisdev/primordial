import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
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
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: '1px solid rgba(0,255,136,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: '#00FF88',
            boxShadow: '0 0 8px rgba(0,255,136,0.9)',
          }}
        />
      </div>
    </div>,
    { ...size }
  )
}
