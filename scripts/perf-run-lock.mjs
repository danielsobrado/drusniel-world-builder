import {
  closeSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

function defaultProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function lockOwner(lockPath) {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

export function acquirePerfRunLock(
  lockPath,
  {
    pid = process.pid,
    isProcessAlive = defaultProcessAlive,
    label = 'Performance matrix',
  } = {},
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let handle;
    try {
      handle = openSync(lockPath, 'wx');
      writeFileSync(handle, `${JSON.stringify({ pid, startedAt: new Date().toISOString() })}\n`);
      closeSync(handle);
    } catch (error) {
      if (handle !== undefined) closeSync(handle);
      if (error?.code !== 'EEXIST') throw error;
      const owner = lockOwner(lockPath);
      // Another process may have created the file but not written its owner
      // yet, especially through the WSL share. Do not steal that fresh lock.
      if (!owner && Date.now() - statSync(lockPath).mtimeMs < 5000) {
        const busy = new Error(`${label} is initializing its run lock.`);
        busy.code = 'PERF_RUN_BUSY';
        throw busy;
      }
      if (isProcessAlive(owner?.pid)) {
        const busy = new Error(`${label} is already running as PID ${owner.pid}.`);
        busy.code = 'PERF_RUN_BUSY';
        throw busy;
      }
      unlinkSync(lockPath);
      continue;
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const owner = lockOwner(lockPath);
      if (owner?.pid !== pid) return;
      try {
        unlinkSync(lockPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    };
  }
  throw new Error('Could not acquire the performance matrix run lock.');
}

/** Browser runs share the GPU; waiting preserves both callers' measurements. */
export async function waitForPerfRunLock(lockPath, {
  timeoutMs = 300_000,
  now = () => Date.now(),
  sleep = () => new Promise(resolve => setTimeout(resolve, 1000)),
  onWait = () => console.log('Waiting for another hardware browser QA run to finish.'),
  ...options
} = {}) {
  const started = now();
  let announced = false;
  while (true) {
    try { return acquirePerfRunLock(lockPath, { label: 'Hardware browser QA', ...options }); }
    catch (error) {
      // The owner can release between reading its metadata and stat/unlink.
      // Retry disappearance just like contention; never remove a live lock.
      if (!['PERF_RUN_BUSY', 'ENOENT'].includes(error.code) || now() - started >= timeoutMs) throw error;
      if (error.code === 'PERF_RUN_BUSY' && !announced) { onWait(); announced = true; }
      await sleep();
    }
  }
}
