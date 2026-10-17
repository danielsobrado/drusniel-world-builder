import * as THREE from 'three/webgpu';
import { float, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { createRiverSurfaceNodes } from '/src/editor/stylized/RiverSurfaceShading.js';
import { createWaterPatternOrigins } from '/src/editor/stylized/WaterPatternOrigins.js';
import { loadEditorConfig } from '/src/config/loadEditorConfig.js';
import { createSeaSurfNodes } from '/src/editor/stylized/SeaSurfNodes.js';
import { resolveSeaSurf } from '/src/editor/water/SeaSurf.js';
import { createWaterAppearanceNodes } from '/src/editor/stylized/WaterAppearanceNodes.js';
import { createSeaSurfaceNodes } from '/src/editor/stylized/SeaSurfaceShading.js';
import { SEA_SWELL_COMPONENTS } from '/src/editor/water/SeaSwell.js';

// Read back production shader output: this catches texture repeat, float32
// origin seams and advection resets that CPU copies of the maths would miss.
const backend = new URLSearchParams(location.search).get('backend') ?? 'webgpu';
const state = window.__worldGrassFixture = { pendingCapture: null, continue: null,
  report: { backend, checks: [], cases: [], done: false } };
const renderer = new THREE.WebGPURenderer({ forceWebGL: backend === 'webgl', antialias: false });
await renderer.init(); renderer.setPixelRatio(1); renderer.setSize(800, 600);
renderer.toneMapping = THREE.NoToneMapping; document.body.append(renderer.domElement);
const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-32, 32, 32, -32, .1, 100);
camera.position.set(0, 50, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
const water = loadEditorConfig().stylizedSurface.water;
const patterns = createWaterPatternOrigins(water), offset = uniform(new THREE.Vector2()), clock = uniform(12.4);
const current = uniform(1), depth = uniform(6), shore = uniform(12);
const local = vec2(uv().x.sub(.5).mul(64), float(.5).sub(uv().y).mul(64)).add(offset);
const nodes = createRiverSurfaceNodes({ patternXZ: patterns.latticePoint('riverDetail', local),
  patterns, localXZ: local, flow: vec2(0, 1), currentStrength: current,
  fall: float(0), waterDepth: depth, shoreDistance: shore, time: clock,
  sunDirection: vec3(.1, .7, .7).normalize(), viewDirection: vec3(.1, .7, .7).normalize(), config: water.riverSurface });
const material = new THREE.MeshBasicNodeMaterial({ toneMapped: false, side: THREE.DoubleSide });
material.colorNode = vec3(nodes.normal.x.mul(.5).add(.5), nodes.foam, nodes.glint.div(2));
const mesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), material);
mesh.rotation.x = -Math.PI / 2; scene.add(mesh);
const size = 256, target = new THREE.RenderTarget(size, size, { type: THREE.FloatType, depthBuffer: false });
target.texture.colorSpace = THREE.LinearSRGBColorSpace;
const capture = async id => { state.pendingCapture = id; await new Promise(resolve => { state.continue = resolve; }); state.pendingCapture = null; };
const check = (id, passed, details = {}) => state.report.checks.push({ id, passed, ...details });
function difference(a, b) { let max = 0; for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i])); return max; }
function correlation(a, b) {
  const mean = v => v.reduce((s, x) => s + x, 0) / v.length, ma = mean(a), mb = mean(b);
  let aa = 0, ab = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; aa += x * x; ab += x * y; bb += y * y; }
  return ab / Math.sqrt(aa * bb);
}
async function draw(id, center, shift = [0, 0], seconds = 12.4, save = false) {
  patterns.update(...center); offset.value.set(...shift); clock.value = seconds;
  renderer.setRenderTarget(target); await renderer.render(scene, camera);
  const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size);
  renderer.setRenderTarget(null); await renderer.render(scene, camera);
  const channels = [0, 1, 2].map(channel => Float32Array.from({ length: size * size }, (_, i) => pixels[i * 4 + channel]));
  state.report.cases.push({ id, center, shift, seconds, fieldMeters: 64 });
  check(`${id}: finite`, channels.every(values => values.every(Number.isFinite)));
  if (save) await capture(id);
  return channels;
}
try {
  check('requested backend', (renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl') === backend);
  for (const center of [[0, 0], [-6524352, 1768768]]) {
    const id = center.join('_'), base = await draw(`${id}-river`, center, [0, 0], 12.4, true);
    for (const shift of [[4, 0], [0, 4], [8, 0], [0, 8]]) {
      const moved = await draw(`${id}-repeat-${shift.join('_')}`, center, shift);
      const value = correlation(base[0], moved[0]);
      check(`${id}: former detail repeat ${shift}`, Number.isFinite(value) && Math.abs(value) < .65, { correlation: value, limit: .65 });
    }
    for (const delta of [[64, 0], [0, 64]]) {
      const adjacent = await draw(`${id}-seam-${delta}`, center.map((v, i) => v + delta[i]), delta.map(v => -v));
      const error = Math.max(...base.map((values, i) => difference(values, adjacent[i])));
      check(`${id}: chunk/origin seam ${delta}`, error < .002, { maxError: error, limit: .002 });
    }
    const before = await draw(`${id}-cycle-before`, center, [0, 0], water.riverSurface.cycleSeconds - .0001);
    const after = await draw(`${id}-cycle-after`, center, [0, 0], water.riverSurface.cycleSeconds + .0001);
    const reset = Math.max(...before.map((values, i) => difference(values, after[i])));
    check(`${id}: advection reset continuity`, reset < .01, { maxError: reset, limit: .01 });
    current.value = 0; shore.value = 1; depth.value = .6;
    await draw(`${id}-lake`, center, [0, 0], 12.4, true);
    current.value = 1; shore.value = 12; depth.value = 6;
  }
  patterns.update(0, 0); offset.value.set(0, 0);
  const surf = createSeaSurfNodes({ swell: { height: float(0) }, waterDepth: uv().x.mul(6),
    localXZ: local, patterns, time: clock, settings: resolveSeaSurf(water.sea.surf) });
  material.colorNode = vec3(surf.foam); material.needsUpdate = true;
  for (let i = 0; i < 12; i++) {
    clock.value = i * 2;
    renderer.setRenderTarget(target); await renderer.render(scene, camera);
    const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size);
    let covered = 0, mean = 0;
    for (let p = 0; p < pixels.length; p += 4) { mean += pixels[p]; if (pixels[p] > .12) covered++; }
    covered /= size * size; mean /= size * size;
    // This known calm 0–6 m shelf must retain broad clear-water gaps at every
    // sampled phase. Measure the foam mask itself, never sky/white pixel counts.
    check(`calm surf coverage at ${clock.value}s`, covered < .2 && mean < .08, { covered, mean, coveredLimit: .2, meanLimit: .08 });
    if (i === 3) { renderer.setRenderTarget(null); await renderer.render(scene, camera); await capture('calm-surf-mask'); }
  }
  for (const kind of [1, 2, 3]) {
    const appearance = createWaterAppearanceNodes(vec4(kind / 255, 0, 0, 1), vec4(kind / 255, 0, 0, 1));
    const sea = createSeaSurfaceNodes({ terrainUv: uv(), chunkWorldSize: 64, waterDepth: float(8),
      surfaceWorldHeight: float(0), waterCoverage: float(1), currentStrength: float(0), time: clock,
      phaseOrigin: SEA_SWELL_COMPONENTS.map(() => float(.7)), sunDirection: vec3(0, 1, 0),
      config: water.sea, oceanMask: appearance.ocean });
    material.colorNode = vec3(sea.mask); material.needsUpdate = true;
    renderer.setRenderTarget(target); await renderer.render(scene, camera);
    const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size);
    check(`explicit water kind ${kind} at identical sea level and zero current`,
      pixels.every((v, i) => i % 4 === 3 || Math.abs(v - (kind === 1 ? 1 : 0)) < .001));
  }
  state.report.passed = state.report.checks.every(check => check.passed);
} catch (error) { state.report.failure = error.stack; state.report.passed = false; }
finally { target.dispose(); mesh.geometry.dispose(); material.dispose(); state.report.done = true; }
