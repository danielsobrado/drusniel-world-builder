import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = fileURLToPath(new URL('.', import.meta.url));
interface SimulatorYaml { server: { host: string; port: number }; frontend: { port: number } }
const settings = yaml.load(readFileSync(new URL('../config/simulator.yaml', import.meta.url), 'utf8')) as SimulatorYaml;
const backendHost = process.env.WS_BACKEND_HOST ?? settings.server.host;
const backendPort = Number(process.env.WS_BACKEND_PORT ?? settings.server.port);

export default defineConfig({
  root: here,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WS_FRONTEND_PORT ?? settings.frontend.port),
    strictPort: true,
    proxy: { '/api': `http://${backendHost}:${backendPort}` },
  },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    root: here,
    environment: 'jsdom',
    include: ['tests/**/*.test.tsx'],
  },
});
