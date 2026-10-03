import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // maplibre-gl v6 loads its worker relative to its own module URL; pre-bundling breaks that
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    host: true, // reachable from phones on the same wifi (for the demo)
    proxy: { '/api': 'http://localhost:8000' },
  },
})
