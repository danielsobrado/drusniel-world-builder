import './SpatialPerformanceOverlay.css';
import { PerfCounters } from './PerfCounters.js';
import { SPATIAL_LAYERS, SPATIAL_METRICS, spatialWindow, spatialCell, spatialMetricLimit, spatialExport } from './SpatialPerformanceModel.js';

const GRID_PIXELS = 340;
const number = value => Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : 'n/a';
const metricLabels = { pressure: 'Estimated pressure', requestedTriangles: 'Requested triangles', selectedTriangles: 'Selected triangles',
  requestedDraws: 'Requested draws', selectedDraws: 'Selected draws', units: 'Weighted demand' };
const append = (parent, tag, content = '') => {
  const element = parent.ownerDocument.createElement(tag);
  element.textContent = content;
  parent.append(element);
  return element;
};
function select(parent, values, labels, title) {
  const element = append(parent, 'select');
  element.setAttribute('aria-label', title);
  for (const value of values) {
    const option = append(element, 'option', labels[value] ?? value);
    option.value = value;
  }
  return element;
}

export class SpatialPerformanceOverlay {
  constructor({ root, surface, settings, gpuProfiler = null }) {
    this.surface = surface;
    this.gpuProfiler = gpuProfiler;
    this.settings = settings;
    this.nextRefresh = -Infinity;
    this.sample = null;
    this.key = null;
    this.panel = append(root, 'details');
    this.panel.className = 'spatial-perf-overlay';
    this.panel.open = true;
    append(this.panel, 'summary', 'Spatial rendering diagnostics');
    this.status = append(this.panel, 'div', 'Waiting for a completed sample…');
    const controls = append(this.panel, 'div');
    controls.className = 'spatial-controls';
    this.metric = select(controls, SPATIAL_METRICS, metricLabels, 'Cost metric');
    this.layer = select(controls, SPATIAL_LAYERS, { all: 'All layers' }, 'Layer filter');
    const recenter = append(controls, 'button', 'Focus');
    recenter.type = 'button';
    recenter.addEventListener('click', () => { this.key = null; this.draw(); });
    this.download = append(controls, 'button', 'Export JSON');
    this.download.type = 'button';
    this.download.disabled = true;
    this.canvas = append(this.panel, 'canvas');
    this.canvas.width = this.canvas.height = GRID_PIXELS;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Regional cost heatmap. Select a chunk with arrow keys or click.');
    this.context = this.canvas.getContext('2d');
    append(this.panel, 'div', 'North at top · grey unsampled · blue protected · violet reduced · amber incomplete').className = 'spatial-legend';
    append(this.panel, 'div', 'Green → red: estimated cost / local target. Layer filter does not hide scene geometry.').className = 'spatial-legend';
    this.details = append(this.panel, 'pre', 'Select a chunk to inspect.');
    this.global = append(this.panel, 'pre');
    for (const element of [this.metric, this.layer]) element.addEventListener('change', () => this.draw());
    this.canvas.addEventListener('click', event => {
      if (!this.sample) return;
      const rect = this.canvas.getBoundingClientRect(), side = this.settings.radius * 2 + 1;
      const x = Math.max(0, Math.min(side - 1, Math.floor((event.clientX - rect.left) / rect.width * side)));
      const z = Math.max(0, Math.min(side - 1, Math.floor((event.clientY - rect.top) / rect.height * side)));
      this.key = `${this.sample.focus.chunkX + x - this.settings.radius}:${this.sample.focus.chunkZ - z + this.settings.radius}`;
      this.draw();
    });
    this.canvas.addEventListener('keydown', event => {
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key];
      if (!delta || !this.sample) return;
      event.preventDefault();
      const [x, z] = (this.key ?? `${this.sample.focus.chunkX}:${this.sample.focus.chunkZ}`).split(':').map(Number);
      const clamp = (value, center) => Math.max(center - this.settings.radius, Math.min(center + this.settings.radius, value));
      this.key = `${clamp(x + delta[0], this.sample.focus.chunkX)}:${clamp(z + delta[1], this.sample.focus.chunkZ)}`;
      this.draw();
    });
    this.download.addEventListener('click', () => this.export());
    this.panel.addEventListener('toggle', () => {
      this.nextRefresh = -Infinity;
      this.surface?.spatialDiagnostics?.setDiagnosticPaused(!this.panel.open);
    });
    for (const event of ['pointerdown', 'pointerup', 'click', 'wheel', 'keydown', 'keyup']) {
      this.panel.addEventListener(event, e => e.stopPropagation());
    }
  }

  update(now, insideLocation = false) {
    if (insideLocation) {
      this.panel.hidden = true;
      this.nextRefresh = -Infinity;
      return;
    }
    this.panel.hidden = false;
    if (!this.panel.open || now < this.nextRefresh) return;
    this.nextRefresh = now + this.settings.refreshMs;
    this.sample = (this.surface.regionalSpatial ?? this.surface.spatialDiagnostics)?.diagnosticSample ?? null;
    this.download.disabled = !this.sample;
    if (!this.sample) {
      this.status.textContent = 'Waiting for a completed regional sample…';
      this.details.textContent = 'No current sample.';
      this.global.textContent = '';
      this.context?.clearRect(0, 0, GRID_PIXELS, GRID_PIXELS);
      return;
    }
    if (this.key) {
      const [x, z] = this.key.split(':').map(Number);
      if (Math.max(Math.abs(x - this.sample.focus.chunkX), Math.abs(z - this.sample.focus.chunkZ)) > this.settings.radius) this.key = null;
    }
    const age = Math.max(0, now - this.sample.timestamp);
    const mode = this.sample.observeOnly ? 'Observe only' : this.sample.rendererAdmission ? 'Renderer admission' : this.sample.admission ? 'Regional admission' : 'Spatial budget';
    this.status.textContent = `${mode} · ${number(age)} ms old · ${number(this.sample.size)} m/chunk · sample ${number(this.sample.timestamp - this.sample.startedAt)} ms`;
    this.draw();
  }

  draw() {
    const sample = this.sample, ctx = this.context;
    if (!sample || !ctx) return;
    const radius = this.settings.radius, side = radius * 2 + 1, step = GRID_PIXELS / side;
    const limit = spatialMetricLimit(this.metric.value, sample.settings);
    const rows = spatialWindow(sample, radius, this.layer.value, this.metric.value);
    const key = this.key ?? `${sample.focus.chunkX}:${sample.focus.chunkZ}`;
    ctx.clearRect(0, 0, GRID_PIXELS, GRID_PIXELS);
    for (const { x, z, cell, value } of rows) {
      const px = (x - sample.focus.chunkX + radius) * step;
      const py = (sample.focus.chunkZ - z + radius) * step;
      ctx.fillStyle = value === null ? '#384553' : `hsl(${120 * (1 - Math.min(1, value / limit))} 55% 34%)`;
      ctx.fillRect(px, py, step - 1, step - 1);
      if (cell && (cell.protected || cell.reduced || cell.requested?.unknown || !cell.requested)) {
        ctx.strokeStyle = cell.protected ? '#6dcaff' : cell.reduced ? '#cf9aff' : '#e9b35b';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, step - 3, step - 3);
      }
      if (x === sample.cameraChunk?.chunkX && z === sample.cameraChunk?.chunkZ) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(px + step / 3, py + step / 3, step / 3, step / 3);
      }
      if (`${x}:${z}` === key) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 2, step - 4, step - 4);
      }
    }
    const cell = spatialCell(sample, key, this.layer.value);
    const cost = value => value ? `${number(value.triangles)} tris / ${number(value.draws)} draws (unknown ${number(value.unknown)})` : 'Unavailable';
    this.details.textContent = cell ? [
      `Chunk ${key} · ${this.layer.value}`,
      `Requested: ${cost(cell.requested)}`,
      `Selected: ${cost(cell.selected)}`,
      ...(cell.effective ? [`Effective requested: ${number(cell.effective.triangles)} tris / ${number(cell.effective.draws)} draws (weighted passes)`] : []),
      ...(cell.requested ? [`Shadow / reflection tris: ${number(cell.requested.shadowTriangles)} / ${number(cell.requested.reflectionTriangles)}`] : []),
      `Weighted demand: ${number(cell.units)}`,
      `Factors: ${Object.entries(cell.factors).map(([kind, factor]) => `${kind} ${factor}`).join(', ') || 'none'}`,
      `Counts: ${Object.entries(cell.counts).map(([kind, count]) => `${kind} ${number(count)}`).join(', ') || 'none'}`,
      ...cell.reasons,
    ].join('\n') : `Chunk ${key}: no sampled demand (not necessarily empty).`;
    const stats = sample.allocationStats;
    const gpu = this.gpuProfiler?.latestSample;
    this.global.textContent = [
      'Whole renderer · not per chunk',
      `CPU fixed/deferred: ${PerfCounters.get('frameFixedCpuMs').toFixed(1)} / ${PerfCounters.get('frameDeferredCpuMs').toFixed(1)} ms`,
      `Queued upload: ${number(PerfCounters.get('framePublicationUploadBytes'))} B`,
      ...(stats ? [`Admission changes/deferred: ${number(stats.changes)} / ${number(stats.deferred)}`,
        `Upload / overlap / unknown deferred: ${number(stats.uploadDeferred)} / ${number(stats.overlapDeferred)} / ${number(stats.unknownDeferred)}`] : []),
      ...(gpu ? [`Measured GPU render passes (sample): ${gpu.totalMs.toFixed(2)} ms`,
        ...Object.entries(gpu.passes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, ms]) => `${name}: ${ms.toFixed(2)} ms`)] : ['No measured GPU pass sample (requires supported timestamp capture)']),
      'GPU per-region timing unavailable',
    ].join('\n');
  }

  export() {
    if (!this.sample) return;
    const blob = new Blob([JSON.stringify({ ...spatialExport(this.sample), wholeRenderer: {
      fixedCpuMs: PerfCounters.get('frameFixedCpuMs'), deferredCpuMs: PerfCounters.get('frameDeferredCpuMs'),
      queuedUploadBytes: PerfCounters.get('framePublicationUploadBytes'), gpuRenderSample: this.gpuProfiler?.latestSample ?? null,
    } }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = this.panel.ownerDocument.createElement('a');
    link.href = url;
    link.download = 'spatial-rendering-diagnostics.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  dispose() {
    this.surface?.spatialDiagnostics?.setDiagnosticPaused(true);
    this.panel.remove();
    this.sample = null;
    this.surface = null;
    this.gpuProfiler = null;
  }
}
