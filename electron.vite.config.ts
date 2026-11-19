import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    // docx and pptxgenjs are devDependencies bundled into out/main, so the installer does not carry their node_modules.
    plugins: [externalizeDepsPlugin({ exclude: ['docx', 'pptxgenjs'] })],
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
    // The shop, and the small corner window shown while the shop is out of sight.
    build: { rollupOptions: { input: { index: resolve('app/renderer/index.html'), mini: resolve('app/renderer/mini.html') } } },
  },
});
