
import type {NextConfig} from 'next';

const isDev = process.env.NODE_ENV === 'development';

// A configuração do PWA foi otimizada para garantir que o service worker
// seja registrado e atualizado automaticamente em produção.
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true, // Garante que o service worker seja registrado.
  skipWaiting: true, // Força a atualização do service worker em segundo plano.
  disable: isDev, // Mantém o PWA desabilitado em desenvolvimento para agilizar os testes.
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // Aumentado para 5MB para evitar avisos
  runtimeCaching: [
    // Cache para fontes do Google
    {
      urlPattern: /^https:\/\/fonts\\.googleapis\\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts-cache',
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 60 * 60 * 24 * 365, // 1 ano
        },
      },
    },
    // Cache para os arquivos de fontes (woff2)
     {
      urlPattern: /^https:\/\/fonts\\.gstatic\\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'gstatic-fonts-cache',
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 60 * 60 * 24 * 365, // 1 ano
        },
      },
    },
    // Cache para imagens do Unsplash e Picsum
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
        },
      },
    },
     // Cache para os dados da aplicação (curiosidades, quizzes)
    {
      urlPattern: ({ url }) => {
        return url.pathname.startsWith('/_next/data/');
      },
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'app-data-cache',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60, // 24 horas
        },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  output: 'export', // Exporta o site como estático para o Capacitor
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    // Ignora o warning do 'require.extensions' da dependência 'handlebars'
    // Esta é a forma correta de ignorar um módulo no Webpack 5+ sem loaders externos.
    config.externals.push({
      'handlebars': 'commonjs handlebars'
    });
    return config;
  },
  images: {
    unoptimized: true, // Desabilita a otimização de imagem do Next.js para o Capacitor
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
