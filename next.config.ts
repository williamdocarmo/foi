// next.config.ts
import type { NextConfig } from 'next';
import withPWAorig from 'next-pwa';

const isDev = process.env.NODE_ENV === 'development';

// A função default de next-pwa recebe as opções e retorna um wrapper para o Next config.
const withPWA = withPWAorig({
  dest: 'public',
  register: true,          // registra o SW
  skipWaiting: true,       // atualiza SW em segundo plano
  disable: isDev,          // desabilita no dev
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
  runtimeCaching: [
    // Google Fonts CSS
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts-cache',
        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
    // Google Fonts files
    {
      urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'gstatic-fonts-cache',
        expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
    // Imagens
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    // JSONs gerados pelo Next export (/_next/data/…)
    {
      urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/_next/data/'),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'app-data-cache',
        expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  output: 'export',            // gera ./out
  trailingSlash: true,         // opcional, bom para export estático
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // Evita warning de require.extensions do handlebars
    config.externals.push({ handlebars: 'commonjs handlebars' });
    return config;
  },
  images: {
    unoptimized: true,         // importante no export estático
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos', port: '', pathname: '/**' },
    ],
  },
};

export default withPWA(nextConfig);
