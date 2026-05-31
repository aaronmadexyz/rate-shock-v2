/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,

  // CartoDB tile images are fetched by the browser directly (not by next/image),
  // so no remotePatterns entry is required. Listed here for documentation.
  // Tile URL pattern: https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png

  images: {
    // No next/image usage currently — placeholder for future map screenshot previews.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.basemaps.cartocdn.com',
      },
    ],
  },

  // react-leaflet v4 ships ES modules; transpile so Next.js can bundle them.
  transpilePackages: ['react-leaflet', '@react-leaflet/core'],

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',          value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control',    value: 'on' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
