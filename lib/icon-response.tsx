import { ImageResponse } from 'next/og'

export function iconResponse(size: number) {
  const radius = Math.round(size * 0.21)
  const fontSize = Math.round(size * 0.52)
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize,
        }}
      >
        ✅
      </div>
    ),
    { width: size, height: size }
  )
}
