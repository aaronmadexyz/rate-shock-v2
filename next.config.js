/** @type {import('next').NextConfig} */
const nextConfig = {
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
}

module.exports = nextConfig
