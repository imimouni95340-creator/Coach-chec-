import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The app must run entirely on the device, with no server and no network, so
// everything it needs — including the ~640 KB Stockfish WebAssembly engine —
// is precached by the service worker on first visit.
export default defineConfig({
  // Relative base so the built app also works when served from a sub-path
  // (e.g. GitHub Pages at /<repo>/).
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: "Coach d'Échecs IA",
        short_name: 'Coach Échecs',
        description: 'Jouez aux échecs contre Stockfish, hors ligne, sur votre appareil.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1c2128',
        theme_color: '#1c2128',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The engine files live in public/engine and are not part of the JS
        // bundle graph, so they must be named explicitly here.
        globPatterns: ['**/*.{js,css,html,svg,png,wasm}'],
        // stockfish.js (the asm.js fallback) alone is 1.6 MB.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
})
