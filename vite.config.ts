import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // a API e o CRM nunca passam pelo cache do app
      workbox: { navigateFallbackDenylist: [/^\/api/, /^\/crm/, /^\/afilhado/] },
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Bar do Dindo',
        short_name: 'Dindo',
        description: 'Reservas, cardápio, histórico e recompensas do Bar do Dindo.',
        theme_color: '#0f0d0b',
        background_color: '#0f0d0b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  build: {
    // o pré-cadastro é uma segunda página do mesmo build (publicada em /afilhado)
    rollupOptions: { input: { main: 'index.html', precadastro: 'precadastro/index.html' } },
  },
});
