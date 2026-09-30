import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Las pruebas e2e apuntan el proxy a un puerto sin nada escuchando
        // (VITE_API_PROXY): así un backend local nunca interfiere con la API simulada.
        target: process.env.VITE_API_PROXY ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    // manifest: true + manualChunks (abajo) es lo que le permite a
    // check-bundle-budget.mjs (T-06) leer dist/.vite/manifest.json y detectar
    // si cityDistances vuelve a quedar enganchada a la carga inicial: sin
    // manualChunks, un import *estático* nuevo la inlinearía directo dentro
    // del chunk de entrada (sin generar una entrada propia en el manifest),
    // y el chequeo no vería nada raro pese a que el bundle inicial creció.
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('/src/data/cityDistances.ts')) return 'city-distances'
        },
      },
    },
  },
})
