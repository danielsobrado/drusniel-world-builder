#!/usr/bin/env node
// Starts the Python backend and the Vite frontend together; stops both when either exits or on Ctrl+C.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
const python = path.join(root, 'backend/.venv', windows ? 'Scripts/python.exe' : 'bin/python');
if (!existsSync(python) && spawnSync('uv', ['sync', '--project', 'backend'], { cwd: root, stdio: 'inherit' }).status !== 0) {
  console.error('[dev] uv sync failed; install uv (https://docs.astral.sh/uv/) and retry');
  process.exit(1);
}
const vite = path.join(root, 'node_modules/vite/bin/vite.js');

let stopping = false;
const children = [
  ['backend', python, ['-m', 'world_sim.server', '--reload']],
  ['frontend', process.execPath, [vite, '--config', 'frontend/vite.config.ts']],
].map(([name, command, args]) => {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
  child.on('exit', (code) => { console.log(`[dev] ${name} exited (${code ?? 'signal'})`); shutdown(code ?? 0); });
  return child;
});

// uvicorn --reload runs the server in a child process; on Windows only a tree kill reaches it.
function stop(child) {
  if (child.exitCode != null) return;
  if (windows) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  children.forEach(stop);
  process.exitCode = code;
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
