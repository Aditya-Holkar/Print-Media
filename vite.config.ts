import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// default mode  -> Web + PWA build (static, host anywhere)
// electron mode -> bundle for the desktop app (no service worker)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    mode !== 'electron' &&
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/*.png', 'customer.html', 'operator.html', 'peerjs.min.js'],
        workbox: { navigateFallbackDenylist: [/customer\.html/, /operator\.html/] },
        manifest: {
          name: 'XeroxStation',
          short_name: 'XeroxStation',
          description: 'Receive PDFs from customers and print them',
          start_url: './',
          scope: './',
          display: 'standalone',
          background_color: '#0b1220',
          theme_color: '#0b1220',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
          ]
        }
      })
  ].filter(Boolean),
  server: { port: 5173, host: true, watch: { ignored: ['**/release/**'] } }
}));
