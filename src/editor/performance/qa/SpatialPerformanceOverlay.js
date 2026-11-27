import './SpatialPerformanceOverlay.css';
import { PerfCounters } from './PerfCounters.js';
import { spatialResourceSnapshot } from './SpatialResourceSnapshot.js';
import { spatialRendererSnapshot } from './SpatialRendererSnapshot.js';
import { SPATIAL_LAYERS, SPATIAL_METRICS, spatialWindow, spatialCell, spatialMetricLimit, spatialExport, spatialHotspots, spatialLayerBreakdown } from './SpatialPerformanceModel.js';

const GRID_PIXELS = 340;
const number = value => Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : 'n/a';
const metricLabels = { pressure: 'Estimated pressure', requestedTriangles: 'Requested triangles', selectedTriangles: 'Selected triangles',
  requestedDraws: 'Requested draws', selectedDraws: 'Selected draws', shadowTriangles: 'Selected shadow triangles',
  reflectionTriangles: 'Selected reflection triangles', slotTextureBytes: 'Assigned slot texture bytes', units: 'Weighted demand' };
const mib = value => Number.isFinite(value) ? `${(value / 1048576).toFixed(1)} MiB` : 'n/a';
const decimal = value => Number.isFinite(value) ? value.toFixed(1) : 'n/a';
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
    this.scaleLegend = append(this.panel, 'div', 'Green → red: estimated cost / local target. Layer filter does not hide scene geometry.');
    this.scaleLegend.className = 'spatial-legend';
    this.hotspots = append(this.panel, 'div');
    this.hotspots.className = 'spatial-hotspots';
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
      this.liveResources = this.rendererSnapshot = null;
      this.nextRefresh = -Infinity;
      return;
    }
    this.panel.hidden = false;
    if (!this.panel.open || now < this.nextRefresh) return;
    this.nextRefresh = now + this.settings.refreshMs;
    this.sample = (this.surface.regionalSpatial ?? this.surface.spatialDiagnostics)?.diagnosticSample ?? null;
    this.liveResources = spatialResourceSnapshot(this.surface, now);
    this.rendererSnapshot = spatialRendererSnapshot(this.surface, PerfCounters.snapshot(), this.gpuProfiler?.latestSample, now);
    this.download.disabled = !this.sample;
    if (!this.sample) {
      this.status.textContent = 'Waiting for a completed regional sample…';
      this.details.textContent = 'No current sample.';
      this.hotspots.replaceChildren();
      this.drawRenderer();
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
    const rows = spatialWindow(sample, radius, this.layer.value, this.metric.value, this.liveResources);
    const resourceMetric = this.metric.value === 'slotTextureBytes';
    this.layer.disabled = resourceMetric;
    this.scaleLegend.textContent = resourceMetric ? 'Green → red: assigned slot texture bytes relative to window maximum. Not a VRAM budget.'
      : 'Green → red: estimated cost / local target. Layer filter does not hide scene geometry.';
    const limit = resourceMetric ? Math.max(1, ...rows.map(row => row.value ?? 0)) : spatialMetricLimit(this.metric.value, sample.settings);
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
    this.hotspots.replaceChildren();
    append(this.hotspots, 'strong', resourceMetric ? 'Largest assigned slot textures (all layers; relative scale)' : 'Top 5 in visible window');
    for (const row of spatialHotspots(rows)) {
      const button = append(this.hotspots, 'button', `${row.x}:${row.z} · ${resourceMetric ? mib(row.value) : this.metric.value === 'pressure' ? `${row.value.toFixed(2)}×` : number(row.value)}`);
      button.type = 'button';
      button.addEventListener('click', () => { this.key = `${row.x}:${row.z}`; this.draw(); });
    }
    const cell = spatialCell(sample, key, resourceMetric ? 'all' : this.layer.value);
    const cost = value => value ? `${number(value.triangles)} tris / ${number(value.draws)} draws (unknown ${number(value.unknown)})` : 'Unavailable';
    this.details.textContent = cell ? [
      `Chunk ${key} · ${resourceMetric ? 'all layers' : this.layer.value}`,
      `Requested: ${cost(cell.requested)}`,
      `Selected: ${cost(cell.selected)}`,
      ...(cell.effective ? [`Effective requested: ${number(cell.effective.triangles)} tris / ${number(cell.effective.draws)} draws (weighted passes)`] : []),
      ...(cell.requested ? [`Shadow / reflection tris: ${number(cell.requested.shadowTriangles)} / ${number(cell.requested.reflectionTriangles)}`] : []),
      `Weighted demand: ${number(cell.units)}`,
      `Factors: ${Object.entries(cell.factors).map(([kind, factor]) => `${kind} ${factor}`).join(', ') || 'none'}`,
      `Counts: ${Object.entries(cell.counts).map(([kind, count]) => `${kind} ${number(count)}`).join(', ') || 'none'}`,
      ...cell.reasons,
    ].join('\n') : `Chunk ${key}: no sampled demand (not necessarily empty).`;
    const breakdown = spatialLayerBreakdown(sample, key);
    if (breakdown.length) this.details.textContent += '\nSelected cost by layer (estimated):\n' + breakdown.map(({ kind, selected }) =>
      `${kind}: ${cost(selected)}`).join('\n');
    const resource = this.liveResources?.cells.get(key);
    if (resource) this.details.textContent += '\n' + [
      'Assigned slot textures · live snapshot (not total chunk VRAM)',
      `Accounted: ${mib(resource.accountedTextureBytes)} · estimated: ${mib(resource.estimatedTextureBytes)}`,
      `Unknown/shared/unallocated: ${resource.unknownTextures}/${resource.sharedTextures}/${resource.unallocatedTextures}`,
      ...(resource.terrain ? [`Terrain: ${resource.terrain.loading ? 'loading' : resource.terrain.visible ? 'visible' : 'hidden'} · ${resource.terrain.materials.join(', ')}${resource.terrain.pendingMaterial ? ' → pending material' : ''}`] : []),
      ...(resource.water ? [`Water: ${resource.water.wet ? 'wet' : 'dry'} · ${resource.water.materials.join(', ')}`] : []),
    ].join('\n');
    this.drawRenderer();
  }

  drawRenderer() {
    const snapshot = this.rendererSnapshot;
    if (!snapshot) { this.global.textContent = ''; return; }
    const { cpu, publication, memory, renderer, streaming, compute, auxiliary, gpuRenderSample: gpu } = snapshot;
    const stats = this.sample?.allocationStats;
    this.global.textContent = [
      'Whole renderer · not per chunk',
      `CPU fixed/deferred/max unit: ${decimal(cpu.frameFixedCpuMs)} / ${decimal(cpu.frameDeferredCpuMs)} / ${decimal(cpu.frameMaxDeferredUnitMs)} ms`,
      `Publication: ${mib(publication.framePublicationUploadBytes)} · backlog ${number(cpu.framePreparationBacklogAgeMs)} ms`,
      `Reported draws / tris: ${number(renderer.rendererDrawCalls)} / ${number(renderer.rendererTriangles)}`,
      `Renderer-accounted memory: ${mib(memory.rendererTotalBytes)} · textures ${number(renderer.rendererTextures)} · geometries ${number(renderer.rendererGeometries)}`,
      `Tracked texture estimate: ${mib(memory.regionalTrackedTextureBytes)} · FFT ${mib(memory.oceanFftBytes)}`,
      ...(streaming ? [`Terrain resident/loading/capacity: ${streaming.resident}/${streaming.loading}/${streaming.capacity}`,
        `Commit queue: ${streaming.pendingCommits} · oldest ${number(streaming.maxQueuedCommitAgeMs)} ms`] : []),
      `Compute credits mandatory/optional: ${number(compute['gpuCompute.mandatoryCredits'])}/${number(compute['gpuCompute.optionalCredits'])}`,
      `Compute deferrals/deadlines/overflow: ${number(compute['gpuCompute.deferred'])}/${number(compute['gpuCompute.deadlineTurns'])}/${number(compute['gpuCompute.overflowCredits'])}`,
      `Hi-Z candidates / excluded: ${number(auxiliary.gpuOcclusionCandidates)} / ${number(auxiliary.occlusionLayerExcluded)}`,
      `Wet / refractive chunks: ${number(auxiliary.waterChunksWet)} / ${number(auxiliary.waterChunksRefractive)}`,
      ...(stats ? [`Admission changes/deferred: ${number(stats.changes)} / ${number(stats.deferred)}`,
        `Upload / overlap / unknown deferred: ${number(stats.uploadDeferred)} / ${number(stats.overlapDeferred)} / ${number(stats.unknownDeferred)}`] : []),
      ...(gpu ? [`Measured GPU render passes: ${decimal(gpu.totalMs)} ms · ${number(gpu.ageMs)} ms old`,
        ...Object.entries(gpu.passes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, ms]) => `${name}: ${decimal(ms)} ms`)] : ['No measured GPU pass sample']),
      'Per-chunk GPU timing and shader instruction counts unavailable.',
    ].join('\n');
  }

  export() {
    if (!this.sample) return;
    const resources = this.liveResources;
    const blob = new Blob([JSON.stringify({ ...spatialExport(this.sample), version: 2,
      wholeRenderer: this.rendererSnapshot,
      slotResources: resources ? { timestampMs: resources.timestamp, sharedTextures: resources.sharedTextures,
        cells: [...resources.cells.values()] } : null,
    }, null, 2)], { type: 'application/json' });
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
    this.liveResources = this.rendererSnapshot = null;
    this.surface = null;
    this.gpuProfiler = null;
  }
}
