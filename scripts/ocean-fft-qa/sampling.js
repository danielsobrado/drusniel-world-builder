import * as THREE from 'three/webgpu';
import { float, Fn, instanceIndex, normalize, select, storage, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { writeCascadeUvOrigins } from '../../src/editor/water/fft/OceanFftCoordinates.js';
import { interpolateLevel, unresolvedSlopeVariance } from '../../src/editor/water/fft/OceanFftFiltering.js';
import { OceanFftBinding, sampleOceanFftSlope } from '../../src/editor/water/fft/OceanFftSampling.js';
import { CASCADE_CANDIDATES } from '../../src/editor/water/fft/OceanFftConstants.js';
import { realSpectra } from './cases.js';
import { readOutputLayer } from './instrument.js';

/**
 * GPU checks of the I.3 sampling path: the real OceanFftBinding + sampleOceanFftSlope
 * against the runtime's own output, in a compute probe (explicit LOD) and in
 * rendered chunk planes (footprint LOD from derivatives, per-object origins).
 */

const N = 128, CHUNK = 128, FAR = -4_234_496; // a chunk-centre multiple of 128 near −4.2 million metres
const TILES = CASCADE_CANDIDATES.map((c) => c.tileSizeMeters);
const HALF_ULP = 2 ** -10;

async function setup(ctx, spectra, time = 126) {
  const { runtime } = ctx;
  runtime.setField(0);
  runtime.configure({ size: N, tileSizes: TILES, spectra });
  runtime.prepare(time);
  await runtime.settled();
  if (runtime.state !== 'active') throw new Error(`runtime ${runtime.state}: ${runtime.reason}`);
  const binding = new OceanFftBinding({ size: N, tileSizes: TILES });
  binding.setSpectra(spectra);
  binding.update(runtime.output);
  return binding;
}

/** Sample `points` = [{ centre: [x, z], local: [x, z], lod }] through the real helper in a compute pass. */
async function probe(ctx, binding, points) {
  const count = points.length;
  const origins = new THREE.StorageBufferAttribute(new Float32Array(4 * count), 4);
  const inputs = new THREE.StorageBufferAttribute(new Float32Array(4 * count), 4);
  const outputs = new THREE.StorageBufferAttribute(new Float32Array(4 * count), 4);
  points.forEach(({ centre, local, lod }, i) => {
    origins.array.set(writeCascadeUvOrigins(centre[0], centre[1], TILES, [0, 0, 0, 0]), 4 * i);
    inputs.array.set([local[0], local[1], lod, 0], 4 * i);
  });
  const origin = storage(origins, 'vec4', count).toReadOnly(), input = storage(inputs, 'vec4', count).toReadOnly();
  const output = storage(outputs, 'vec4', count);
  const kernel = Fn(() => {
    const p = input.element(instanceIndex);
    const { slope, unresolved } = sampleOceanFftSlope(binding, { origin: origin.element(instanceIndex), localXZ: p.xy, lod: p.z });
    output.element(instanceIndex).assign(vec4(slope, unresolved, 0));
  })().compute(count, [64]);
  ctx.renderer.compute(kernel);
  const values = new Float32Array(await ctx.renderer.getArrayBufferAsync(outputs));
  kernel.dispose();
  for (const attribute of [origins, inputs, outputs]) attribute.dispose();
  return values;
}

const silence = (spectra, keep) => spectra.map((s, c) => (c === keep ? s : { ...s, h0: new Float64Array(s.h0.length) }));
/** A world point at the centre of texel (i, j) of cascade c's mip `lod`, near FAR, in the chunk that owns it. */
const texelPoint = (c, i, j, lod = 0) => {
  const tile = TILES[c], texel = tile / N * 2 ** lod, base = (Math.floor(FAR / tile) - 3) * tile;
  const x = base + (i + 0.5) * texel, z = base - 11 * tile + (j + 0.5) * texel;
  const centre = [Math.round(x / CHUNK) * CHUNK, Math.round(z / CHUNK) * CHUNK];
  return { centre, local: [x - centre[0], z - centre[1]], lod };
};

/** Texel centres of each cascade (one silenced at a time) must return that texel, row z / column x. */
export async function orientationCase(ctx) {
  const spectra = realSpectra(N), rows = [];
  for (const c of [0, 1]) {
    const binding = await setup(ctx, silence(spectra, c));
    const layer = await readOutputLayer(ctx.renderer, ctx.runtime, c);
    const picks = [[0, 0], [5, 0], [0, 9], [37, 101], [127, 64], [64, 127], [90, 13]];
    const values = await probe(ctx, binding, picks.map(([i, j]) => texelPoint(c, i, j)));
    let worst = 0, worstFlipped = 0;
    picks.forEach(([i, j], k) => {
      for (const axis of [0, 1]) {
        const expected = layer[2 * (j * N + i) + axis], flipped = layer[2 * ((N - 1 - j) * N + i) + axis];
        worst = Math.max(worst, Math.abs(values[4 * k + axis] - expected));
        worstFlipped = Math.max(worstFlipped, Math.abs(values[4 * k + axis] - flipped));
      }
    });
    rows.push({ cascade: c, maxError: worst, maxErrorIfVFlipped: worstFlipped, pass: worst <= 1e-6 && worstFlipped > 1e-3 });
    binding.dispose();
  }
  return rows;
}

/** Points on the shared edge of two chunks near −4.2 Mm, sampled from either side, at several LODs. */
export async function seamCase(ctx) {
  const binding = await setup(ctx, realSpectra(N));
  const points = [];
  for (let k = 0; k < 64; k++) {
    const along = -64 + k * 2.013, lod = [0, 0.5, 2, 4.25][k % 4];
    const left = [FAR, FAR + 512], right = [FAR + CHUNK, FAR + 512];
    points.push({ centre: left, local: [64, along], lod }, { centre: right, local: [-64, along], lod });
    const below = [FAR + 1024, FAR], above = [FAR + 1024, FAR + CHUNK];
    points.push({ centre: below, local: [along, 64], lod }, { centre: above, local: [along, -64], lod });
  }
  const values = await probe(ctx, binding, points);
  let worst = 0, scale = 0;
  for (let k = 0; k < points.length; k += 2) {
    for (const axis of [0, 1, 2]) {
      worst = Math.max(worst, Math.abs(values[4 * k + axis] - values[4 * (k + 1) + axis]));
      scale = Math.max(scale, Math.abs(values[4 * k + axis]));
    }
  }
  binding.dispose();
  // f32 UV rounding (< 5e-7 of a tile) moves a bilinear tap by < 1e-4 texel.
  return { pairs: points.length / 2, maxDifference: worst, maxValue: scale, pass: worst <= 1e-3 * scale };
}

/** Mip 1 texel = mean of its 2×2 level-0 texels; the 1×1 mip ≈ zero mean; unresolved variance = CPU table. */
export async function mipCase(ctx) {
  const spectra = realSpectra(N);
  const binding = await setup(ctx, silence(spectra, 0));
  const layer = await readOutputLayer(ctx.renderer, ctx.runtime, 0);
  const picks = [[0, 0], [10, 3], [63, 63], [17, 40]];
  const values = await probe(ctx, binding, [...picks.map(([i, j]) => texelPoint(0, i, j, 1)), texelPoint(0, 0, 0, 7)]);
  let worst = 0;
  picks.forEach(([i, j], k) => {
    for (const axis of [0, 1]) {
      let mean = 0;
      for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) mean += layer[2 * ((2 * j + dj) * N + 2 * i + di) + axis] / 4;
      worst = Math.max(worst, Math.abs(values[4 * k + axis] - mean) - 2 * HALF_ULP * Math.abs(mean));
    }
  });
  const topMip = Math.hypot(values[4 * picks.length], values[4 * picks.length + 1]);
  // Unresolved variance through the shader: both cascades live, at several LODs.
  binding.dispose();
  const live = await setup(ctx, spectra);
  const tables = spectra.map((s) => unresolvedSlopeVariance({ size: N, deltaK: s.deltaK, power: s.power }));
  const lods = [0, 1, 2.5, 4, 6.75, 7];
  const sampled = await probe(ctx, live, lods.map((lod) => ({ centre: [0, 0], local: [3, 4], lod })));
  let varianceError = 0;
  lods.forEach((lod, k) => {
    const expected = interpolateLevel(tables[0], lod) + interpolateLevel(tables[1], lod);
    varianceError = Math.max(varianceError, Math.abs(sampled[4 * k + 2] - expected) / Math.max(expected, 1e-12));
  });
  live.dispose();
  return {
    mip1MaxExcessError: Math.max(0, worst), mip7Magnitude: topMip, unresolvedRelativeError: varianceError,
    unresolvedByLod: lods.map((lod, k) => [lod, sampled[4 * k + 2]]),
    pass: worst <= 1e-6 && topMip < 1e-3 && varianceError < 1e-5,
  };
}

/** Debug views of the rendered planes (QA only): `debugMode` selects one. */
export const SAMPLING_DEBUG_MODES = Object.freeze(['combined', 'slopeX', 'slopeZ', 'normal', 'mipLevel', 'unresolved', 'resolved']);

/**
 * Render 13×13 chunk planes, the way the water draws them: chunk-local metres from
 * the plane UV, per-object origin uniforms, footprint LOD. The grid can be moved to
 * any canonical base (`place`); the runner screenshots views and the rebase and
 * teleport checks read pixels.
 */
export async function createSamplingScene(ctx) {
  const spectra = realSpectra(N);
  const binding = await setup(ctx, spectra, 126);
  const origin = uniform(new THREE.Vector4()).onObjectUpdate(({ object }) => object.userData.oceanFftOrigin);
  const localXZ = vec2(uv().x.sub(0.5).mul(CHUNK), uv().y.oneMinus().sub(0.5).mul(CHUNK));
  const { slope, unresolved, lods } = sampleOceanFftSlope(binding, { origin, localXZ });
  const debugMode = uniform(0);
  const total = binding.unresolved.element(binding.levels - 1).add(binding.unresolved.element(2 * binding.levels - 1));
  const normal = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
  const views = [
    vec3(slope.x.mul(2).add(0.5), slope.y.mul(2).add(0.5), unresolved.mul(40)),
    vec3(slope.x.mul(4).add(0.5)), vec3(slope.y.mul(4).add(0.5)),
    normal.mul(0.5).add(0.5), vec3(lods[0].div(7), lods[1].div(7), 0),
    vec3(unresolved.div(total)), vec3(total.sub(unresolved).div(total)),
  ];
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = views.slice(1).reduce((chosen, node, i) => select(debugMode.equal(float(i + 1)), node, chosen), views[0]);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101418);
  const geometry = new THREE.PlaneGeometry(CHUNK, CHUNK, 1, 1).rotateX(-Math.PI / 2);
  const offsets = [];
  for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) offsets.push([dx * CHUNK, dz * CHUNK]);
  const meshes = offsets.map(() => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.oceanFftOrigin = new THREE.Vector4();
    scene.add(mesh);
    return mesh;
  });
  /** Centre the grid on canonical `base` (a chunk centre); origins in f64, as StylizedWaterSlot does. */
  const place = (base) => meshes.forEach((mesh, i) => {
    const centre = [base[0] + offsets[i][0], base[1] + offsets[i][1]];
    mesh.userData.centre = centre;
    mesh.userData.oceanFftOrigin.set(...writeCascadeUvOrigins(centre[0], centre[1], TILES, [0, 0, 0, 0]));
  });
  place([FAR, FAR]);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 20_000);
  /** Place meshes and camera relative to a floating render origin (canonical metres). */
  const view = (renderOrigin, eye, target) => {
    for (const mesh of meshes) mesh.position.set(mesh.userData.centre[0] - renderOrigin[0], 0, mesh.userData.centre[1] - renderOrigin[1]);
    camera.position.set(eye[0] - renderOrigin[0], eye[1], eye[2] - renderOrigin[1]);
    camera.lookAt(target[0] - renderOrigin[0], target[1], target[2] - renderOrigin[1]);
    camera.updateMatrixWorld();
  };
  const meta = () => ({
    seed: 1234, waterTime: 126, size: N, tileSizes: TILES, generation: binding.generation,
    spectrumRevision: ctx.runtime.output?.spectrumRevision ?? null, available: binding.available.value,
  });
  return {
    binding, scene, camera, view, place, material, geometry, FAR, debugMode, meta,
    setMode(name) { debugMode.value = SAMPLING_DEBUG_MODES.indexOf(name); },
    dispose() { binding.dispose(); material.dispose(); geometry.dispose(); },
  };
}

/** Same view, render origin moved: the image must be pixel-identical (no swimming, no seams moving). */
export async function rebaseCase(ctx, sceneParts) {
  const { renderer } = ctx;
  const target = new THREE.RenderTarget(480, 270, { type: THREE.HalfFloatType, depthBuffer: true });
  const eye = [FAR + 40, 30, FAR - 90], look = [FAR + 40, 0, FAR + 60];
  const shots = [];
  for (const renderOrigin of [[FAR, FAR], [FAR + 64, FAR - 64], [0, 0]]) {
    sceneParts.view(renderOrigin, eye, look);
    renderer.setRenderTarget(target);
    renderer.render(sceneParts.scene, sceneParts.camera);
    renderer.setRenderTarget(null);
    shots.push(await renderer.readRenderTargetPixelsAsync(target, 0, 0, 480, 270));
  }
  target.dispose();
  const differing = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
  // Origin [0, 0] puts −4.2 Mm world matrices into f32 GPU maths (r187 multiplies model and view
  // on the GPU): the geometry jitters, which the app's floating origin exists to prevent. The FFT
  // sampling never sees positions, only per-object origins and chunk-local metres.
  const nearRebase = differing(shots[0], shots[1]), noRebase = differing(shots[0], shots[2]);
  return { channels: shots[0].length, differingChannelsAfterRebase: nearRebase, differingChannelsWithoutFloatingOrigin: noRebase, pass: nearRebase === 0 };
}

/** Teleport away (grid and camera re-placed at the world origin) and back: the image must not change. */
export async function teleportCase(ctx, sceneParts) {
  const { renderer } = ctx;
  const target = new THREE.RenderTarget(480, 270, { type: THREE.HalfFloatType, depthBuffer: true });
  const shoot = async (base) => {
    sceneParts.place(base);
    sceneParts.view(base, [base[0] + 40, 30, base[1] - 90], [base[0] + 40, 0, base[1] + 60]);
    renderer.setRenderTarget(target);
    renderer.render(sceneParts.scene, sceneParts.camera);
    renderer.setRenderTarget(null);
    return renderer.readRenderTargetPixelsAsync(target, 0, 0, 480, 270);
  };
  const before = await shoot([FAR, FAR]);
  const away = await shoot([64, 64]);
  const after = await shoot([FAR, FAR]);
  target.dispose();
  const differing = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
  const changed = differing(before, after), elsewhere = differing(before, away);
  // `elsewhere` > 0 proves the view at the origin shows other waves (the check is not blind).
  return { channels: before.length, differingAfterReturn: changed, differingAtOtherPlace: elsewhere, pass: changed === 0 && elsewhere > 0 };
}

/** Render a view into a float target and return it as a PNG data URL (visual evidence). */
export async function captureView(ctx, sceneParts, { renderOrigin, eye, look, width = 1280, height = 720 }) {
  const { renderer } = ctx;
  const target = new THREE.RenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: true });
  sceneParts.view(renderOrigin, eye, look);
  sceneParts.camera.aspect = width / height;
  sceneParts.camera.updateProjectionMatrix();
  renderer.setRenderTarget(target);
  renderer.render(sceneParts.scene, sceneParts.camera);
  renderer.setRenderTarget(null);
  const halves = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
  target.dispose();
  const bytes = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i % 4 === 3) ? 255 : 255 * THREE.DataUtils.fromHalfFloat(halves[i]);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d').putImageData(new ImageData(bytes, width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** GPU cost of the sampling path: the same full-screen grazing view with and without it. */
export async function samplingCostCase(ctx, sceneParts, frames = 90) {
  const { renderer } = ctx;
  const target = new THREE.RenderTarget(1600, 900, { type: THREE.HalfFloatType, depthBuffer: true });
  const plain = new THREE.MeshBasicNodeMaterial({ color: 0x336699 });
  const sampling = sceneParts.scene.children[0].material;
  const time = async (material) => {
    for (const mesh of sceneParts.scene.children) mesh.material = material;
    sceneParts.view([FAR, FAR], [FAR, 25, FAR - 300], [FAR, 0, FAR + 400]);
    sceneParts.camera.aspect = 16 / 9;
    sceneParts.camera.updateProjectionMatrix();
    renderer.setRenderTarget(target);
    renderer.render(sceneParts.scene, sceneParts.camera);
    await renderer.resolveTimestampsAsync('render');
    const samples = [];
    for (let i = 0; i < frames; i++) {
      renderer.render(sceneParts.scene, sceneParts.camera);
      samples.push(await renderer.resolveTimestampsAsync('render'));
    }
    renderer.setRenderTarget(null);
    samples.sort((a, b) => a - b);
    return samples[samples.length >> 1];
  };
  const withoutMs = await time(plain), withMs = await time(sampling), againWithoutMs = await time(plain);
  for (const mesh of sceneParts.scene.children) mesh.material = sampling;
  plain.dispose();
  target.dispose();
  return { resolution: '1600×900', medianWithoutMs: withoutMs, medianWithMs: withMs, medianWithoutAgainMs: againWithoutMs, addedMs: withMs - (withoutMs + againWithoutMs) / 2 };
}
