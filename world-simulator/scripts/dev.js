#!/usr/bin/env node
// Starts backend and frontend together and stops both when either exits or on Ctrl+C.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(root, 'node_modules/vite/bin/vite.js');
const children = [
  ['backend', [process.execPath, ['--watch', 'backend/src/server.js']]],
  ['frontend', [process.execPath, [vite, '--config', 'frontend/vite.config.js']]],
].map(([name, [command, args]]) => {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
  child.on('exit', (code) => { console.log(`[dev] ${name} exited (${code ?? 'signal'})`); shutdown(code ?? 0); });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode == null) child.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
