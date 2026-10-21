import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'apps/web',
  build: { outDir: '../../dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001', '/ws': { target: 'ws://127.0.0.1:3001', ws: true } } },
});
