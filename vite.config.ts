import { defineConfig } from 'vite';

export default defineConfig({
  // './' deixa os caminhos relativos, necessário para o app empacotado no Electron
  base: './',
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
