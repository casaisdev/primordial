import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Primordial',
    short_name: 'Primordial',
    description:
      'A Darwinian artificial life simulation. Digital organisms born, evolving, dying in real time.',
    start_url: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#050508',
    theme_color: '#050508',
    icons: [
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    categories: ['simulation', 'science', 'education'],
  }
}
