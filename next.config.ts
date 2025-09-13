
import type {NextConfig} from 'next';

const isDev = process.env.NODE_ENV === 'development';

// A configuração do PWA foi otimizada para garantir que o service worker
// seja registrado e atualizado automaticamente em produção.
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true, // Garante que o service worker seja registrado.
  skipWaiting: true, // Força a atualização do service worker em segundo plano.
  disable: isDev, // Mantém o PWA desabilitado em desenvolvimento para agilizar os testes.
});

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https'
        ,
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

// Envolve a configuração do Next.js com o PWA.
export default withPWA(nextConfig);
