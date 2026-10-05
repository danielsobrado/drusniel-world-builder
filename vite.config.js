import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentLibraryPlugin } from './scripts/content-library-plugin.mjs';
import { compiledYamlPlugin } from './scripts/compiled-yaml-plugin.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [compiledYamlPlugin(), contentLibraryPlugin(root)],
  resolve: {
    alias: [
      { find: /^three$/, replacement: 'three/webgpu' },
    ],
  },
  build: {
    rollupOptions: {
      input: {
        app: path.resolve(root, 'index.html'),
        workshopQa: path.resolve(root, 'workshop-qa.html'),
      },
    },
  },
});
