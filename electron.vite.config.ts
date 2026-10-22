import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: resolve('app/main/index.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve('app/preload/index.ts') },
      // A sandboxed preload script must be CommonJS.
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    root: resolve('app/renderer'),
    build: { rollupOptions: { input: resolve('app/renderer/index.html') } },
  },
});
