import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Array form guarantees most-specific aliases are tested first.
    // Object form uses shortest-prefix matching, which breaks subpath aliases.
    alias: [
      {
        find: '@jvm-viz/engine/languages/java/limits',
        replacement: path.resolve(__dirname, '../engine/src/languages/java/limits.ts'),
      },
      {
        find: '@jvm-viz/engine/languages/java',
        replacement: path.resolve(__dirname, '../engine/src/languages/java/index.ts'),
      },
      {
        find: '@jvm-viz/engine',
        replacement: path.resolve(__dirname, '../engine/src/index.ts'),
      },
    ],
  },
  worker: {
    format: 'es',
  },
});
