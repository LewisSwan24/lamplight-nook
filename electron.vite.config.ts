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
      // The shop's, and the postcard window's (docs/plan-1.5.md E3), which can only read the postcard and go home.
      lib: { entry: { index: resolve('app/preload/index.ts'), visit: resolve('app/preload/visit.ts') } },
      // A sandboxed preload script must be CommonJS.
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    root: resolve('app/renderer'),
    // The shop, the small corner window shown while the shop is out of sight, and someone else's shop on a postcard (E3).
    build: { rollupOptions: { input: { index: resolve('app/renderer/index.html'), mini: resolve('app/renderer/mini.html'), visit: resolve('app/renderer/visit.html') } } },
  },
});
