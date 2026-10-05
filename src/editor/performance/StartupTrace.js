/** Bounded, opt-in CPU diagnostics. Overlapping spans are never summed as startup time. */
export class StartupTrace {
  constructor({ enabled = false, clock = () => performance.now(), capacity = 256 } = {}) {
    this.enabled = enabled;
    this.clock = clock;
    this.capacity = capacity;
    this.spans = [];
    this.active = new Set();
    this.creation = new Map();
    this.dropped = 0;
  }

  begin(name) {
    if (!this.enabled) return null;
    if (this.active.size >= this.capacity) { this.dropped += 1; return null; }
    const token = { name, startMs: this.clock() };
    this.active.add(token);
    return token;
  }

  end(token, status = 'complete') {
    if (!token || !this.active.delete(token)) return;
    if (this.spans.length >= this.capacity) { this.dropped += 1; return; }
    this.spans.push({ ...token, durationMs: this.clock() - token.startMs, status });
  }

  async measure(name, operation) {
    const token = this.begin(name);
    try { const result = await operation(); this.end(token); return result; }
    catch (error) { this.end(token, 'failed'); throw error; }
  }
  measureSync(name, operation) {
    const token = this.begin(name);
    try { const result = operation(); this.end(token); return result; }
    catch (error) { this.end(token, 'failed'); throw error; }
  }

  record(kind, family, cpuMs, shader = null) {
    if (!this.enabled) return;
    const key = `${kind}:${family}`;
    if (!this.creation.has(key) && this.creation.size >= this.capacity) { this.dropped += 1; return; }
    const row = this.creation.get(key) ?? { kind, family, count: 0, cpuMs: 0, maxCpuMs: 0, maxShaderChars: 0, maxSamplers: 0 };
    row.count += 1;
    row.cpuMs += cpuMs;
    row.maxCpuMs = Math.max(row.maxCpuMs, cpuMs);
    if (shader) {
      row.maxShaderChars = Math.max(row.maxShaderChars, shader.length);
      row.maxSamplers = Math.max(row.maxSamplers, (shader.match(/var\s+\w+\s*:\s*sampler\b/g) ?? []).length);
    }
    this.creation.set(key, row);
  }

  bindLoadingSession(session) {
    if (!this.enabled) return () => {};
    let token = null;
    const restores = [];
    for (const name of ['start', 'fail', 'finish']) {
      const original = session[name];
      const trace = this;
      const wrapped = function (...args) {
        trace.end(token, name === 'fail' ? 'failed' : 'complete');
        token = name === 'start' ? trace.begin(`boot.${args[0]}`) : null;
        return original.apply(this, args);
      };
      session[name] = wrapped;
      restores.push(() => { if (session[name] === wrapped) session[name] = original; });
    }
    return () => { this.end(token, 'cancelled'); restores.forEach(restore => restore()); };
  }

  getReport() {
    return { enabled: this.enabled, timing: 'CPU wall time; asynchronous API submission is not GPU execution',
      spans: this.spans.map(row => ({ ...row })), activeSpans: this.active.size,
      creation: [...this.creation.values()].map(row => ({ ...row })), hooks: { ...this.hookSupport },
      samplerOverflow: this.samplerOverflow ?? null, dropped: this.dropped };
  }

  dispose() { for (const token of this.active) this.end(token, 'cancelled'); }
}

export function startupDiagnosticsEnabled(search = globalThis.location?.search ?? '') {
  const params = new URLSearchParams(search);
  return params.get('profile') === '1' || params.get('assetQa') === '1';
}
