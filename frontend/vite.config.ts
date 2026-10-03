import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { networkInterfaces } from 'node:os'
import { defineConfig } from 'vite'

// This laptop's wifi address, so invite QR codes open on phones (they can't reach "localhost").
function lanHost() {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) if (ni.family === 'IPv4' && !ni.internal) return ni.address
  }
  return ''
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __LAN_HOST__: JSON.stringify(lanHost()),
    // Public URL for invite QR codes, e.g. a Cloudflare tunnel: PUBLIC_URL=https://x.trycloudflare.com npm run dev
    __PUBLIC_URL__: JSON.stringify((process.env.PUBLIC_URL ?? '').replace(/\/$/, '')),
  },
  // maplibre-gl v6 loads its worker relative to its own module URL; pre-bundling breaks that
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    host: true, // reachable from phones on the same wifi (for the demo)
    allowedHosts: ['.trycloudflare.com'], // the demo tunnel (see README / PUBLIC_URL)
    proxy: { '/api': 'http://localhost:8000' },
  },
})
