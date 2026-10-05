import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `--mode demo` conecta o CRM à API de demonstração (banco separado do real).
export default defineConfig(({ mode }) => {
  const api = mode === 'demo' ? 'http://localhost:3334' : 'http://localhost:3333';
  return {
    base: './',
    plugins: [react()],
    server: { port: 5174, proxy: { '/api': api } },
    preview: { port: 5174, proxy: { '/api': api } },
  };
});
