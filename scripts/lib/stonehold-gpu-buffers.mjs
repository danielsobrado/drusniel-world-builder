import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Playwright serializes this function into a fresh QA page before any device is created.
export function trackGpuBuffers() {
  if (new URLSearchParams(location.search).get('buffers') !== '1' || !globalThis.GPUDevice) return;
  const buffers = new WeakMap();
  const stats = {};
  const { INDIRECT, STORAGE, UNIFORM, INDEX, VERTEX, MAP_READ, MAP_WRITE } = GPUBufferUsage;
  const create = GPUDevice.prototype.createBuffer;
  GPUDevice.prototype.createBuffer = function (descriptor) {
    const buffer = create.call(this, descriptor);
    const { usage, size } = buffer;
    const category = usage & INDIRECT ? 'indirect' : usage & STORAGE ? 'storage' : usage & UNIFORM ? 'uniform'
      : usage & (INDEX | VERTEX) ? 'vertexIndex' : usage & (MAP_READ | MAP_WRITE) ? 'staging' : 'other';
    const counters = stats[category] ??= { created: 0, createdBytes: 0, destroyed: 0, destroyedBytes: 0 };
    counters.created++;
    counters.createdBytes += size;
    buffers.set(buffer, counters);
    return buffer;
  };
  const destroy = GPUBuffer.prototype.destroy;
  GPUBuffer.prototype.destroy = function () {
    destroy.call(this);
    const counters = buffers.get(this);
    if (counters) {
      counters.destroyed++;
      counters.destroyedBytes += this.size;
      buffers.delete(this);
    }
  };
  window.__stoneholdGpuBuffers = () => structuredClone(stats);
}

const exec = promisify(execFile);

export async function driverGpuMemory(gpuPid) {
  if (process.platform !== 'win32' || !Number.isSafeInteger(gpuPid) || gpuPid <= 0) return null;
  const command = `Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory -Filter "Name LIKE 'pid_${gpuPid}_%'" | Select-Object Name,DedicatedUsage,SharedUsage | ConvertTo-Json -Compress`;
  try {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true, timeout: 15000 });
    if (!stdout.trim()) return { gpuPid, unavailable: 'No WDDM counters for the Chromium GPU process' };
    const rows = [JSON.parse(stdout)].flat();
    return { gpuPid, dedicatedBytes: rows.reduce((sum, row) => sum + Number(row.DedicatedUsage), 0),
      sharedBytes: rows.reduce((sum, row) => sum + Number(row.SharedUsage), 0) };
  } catch (error) {
    return { gpuPid, unavailable: error.message };
  }
}
