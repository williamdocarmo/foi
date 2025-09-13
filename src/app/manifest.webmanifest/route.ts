import { MetadataRoute } from 'next'
 
export function GET(): MetadataRoute.Manifest {
  return {
    name: 'Você Sabia?',
    short_name: 'Você Sabia?',
    description: 'Um jogo educativo de curiosidades e quiz que funciona offline.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F3E5F5',
    theme_color: '#9C27B0',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
