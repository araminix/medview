import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

/** GitHub Pages serves the app from /medview/; override with MEDVIEW_BASE for a custom domain. */
const base = process.env.MEDVIEW_BASE ?? '/medview/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'] },
      manifest: {
        name: 'MedView — Private Medical-File Viewer',
        short_name: 'MedView',
        description: 'Open FHIR, HL7 v2 and C-CDA files locally. Nothing leaves your device.',
        theme_color: '#0284C7',
        background_color: '#F8FAFC',
        display: 'standalone',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  worker: { format: 'es' },
  // Never inline assets as data: URIs — the CSP only allows fonts from 'self'.
  build: { assetsInlineLimit: 0 },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
