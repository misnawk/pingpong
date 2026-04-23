import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const clientRoot = fileURLToPath(new URL('.', import.meta.url));
const sharedRoot = fileURLToPath(new URL('../shared', import.meta.url));

export default defineConfig({
  root: clientRoot,
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    fs: {
      allow: [clientRoot, sharedRoot],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['three', 'cannon-es', 'gsap', 'socket.io-client', 'stats.js'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
