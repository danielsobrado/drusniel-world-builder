import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { acquirePerfRunLock, waitForPerfRunLock } from '../scripts/perf-run-lock.mjs';

test('performance run lock rejects a concurrent live owner', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'simcity-perf-lock-'));
  const lockPath = path.join(directory, 'matrix.lock');
  try {
    const release = acquirePerfRunLock(lockPath, {
      pid: 101,
      isProcessAlive: (pid) => pid === 101,
    });
    assert.throws(
      () => acquirePerfRunLock(lockPath, {
        pid: 202,
        isProcessAlive: (pid) => pid === 101,
      }),
      /already running as PID 101/,
    );
    release();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('performance run lock replaces a stale owner and releases idempotently', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'simcity-perf-lock-'));
  const lockPath = path.join(directory, 'matrix.lock');
  try {
    writeFileSync(lockPath, JSON.stringify({ pid: 99 }), 'utf8');
    const release = acquirePerfRunLock(lockPath, {
      pid: 303,
      isProcessAlive: () => false,
    });
    release();
    release();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('browser QA waits for the live owner and acquires only after release', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'simcity-browser-lock-'));
  const lockPath = path.join(directory, 'browser.lock');
  let waited = 0, announcements = 0;
  try {
    const release = acquirePerfRunLock(lockPath, { pid: 101 });
    const next = await waitForPerfRunLock(lockPath, { pid: 202, isProcessAlive: pid => pid === 101,
      sleep: async () => { if (++waited === 2) release(); }, onWait: () => announcements++ });
    assert.equal(waited, 2);
    assert.equal(announcements, 1);
    next();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('a competing process cannot steal a newly created lock before owner metadata is written', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'simcity-browser-lock-'));
  const lockPath = path.join(directory, 'browser.lock');
  try {
    writeFileSync(lockPath, '');
    assert.throws(() => acquirePerfRunLock(lockPath, { isProcessAlive: () => false }),
      error => error.code === 'PERF_RUN_BUSY' && /initializing/.test(error.message));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('a timed-out browser waiter leaves the live owner intact', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'simcity-browser-lock-'));
  const lockPath = path.join(directory, 'browser.lock');
  let clock = 0;
  try {
    const release = acquirePerfRunLock(lockPath, { pid: 101 });
    await assert.rejects(waitForPerfRunLock(lockPath, { pid: 202, timeoutMs: 2,
      now: () => clock, sleep: async () => { clock++; }, onWait() {},
      isProcessAlive: pid => pid === 101 }), /already running as PID 101/);
    assert.throws(() => acquirePerfRunLock(lockPath, { pid: 303, isProcessAlive: pid => pid === 101 }), /PID 101/);
    release();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('browser QA retries when the previous owner releases during its ownership check', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'simcity-browser-lock-'));
  const lockPath = path.join(directory, 'browser.lock');
  let waited = 0;
  try {
    const release = acquirePerfRunLock(lockPath, { pid: 101 });
    const next = await waitForPerfRunLock(lockPath, { pid: 202,
      isProcessAlive: () => { release(); return false; },
      sleep: async () => { waited++; }, onWait() {} });
    assert.equal(waited, 1);
    assert.throws(() => acquirePerfRunLock(lockPath, { pid: 303, isProcessAlive: pid => pid === 202 }), /PID 202/);
    next();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
