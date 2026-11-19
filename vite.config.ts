import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any folder (e.g. github.io/rigged/ or a Netlify root).
  base: './',
  server: { port: 8080 },
  preview: { port: 8080 },
  build: {
    target: 'es2022',
    // three.js is ~600 KB; the Rapier physics chunk is ~4.3 MB because its WebAssembly is embedded.
    chunkSizeWarningLimit: 4500,
  },
});
