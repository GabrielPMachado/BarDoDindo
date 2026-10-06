import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // o CRM e o pré-cadastro nunca passam pelo cache do app
      workbox: { navigateFallbackDenylist: [/^\/crm/, /^\/afilhado/] },
      includeAssets: ['icon.png', 'icon-192.png', 'icon-maskable.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Bar do Dindo',
        short_name: 'Dindo',
        description: 'Reservas, cardápio, histórico e recompensas do Bar do Dindo.',
        theme_color: '#0e0c0c',
        background_color: '#0e0c0c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    // o pré-cadastro é uma segunda página do mesmo build (publicada em /afilhado)
    rollupOptions: { input: { main: 'index.html', precadastro: 'precadastro/index.html' } },
  },
});
