import * as THREE from 'three/webgpu';
import { abs, Fn, instanceIndex, storage, uniform, uv, vec2, vec4 } from 'three/tsl';
import { OFFSHORE_FFT_DEFAULTS } from '../../src/editor/water/fft/OceanFftConfig.js';
import { offshoreFftWeight, offshoreFftWeightCpu } from '../../src/editor/water/fft/OceanFftBlendNodes.js';
import { createSeaRippleNodes } from '../../src/editor/stylized/SeaRippleShading.js';
import { acquireSeaDetailTexture } from '../../src/editor/assets/godsEnd/seaDetailCache.js';
import { PatternOrigins } from '../../src/editor/stylized/PatternOrigins.js';
import { resolveSeaDetail, seaDetailPatternFrames } from '../../src/editor/water/SeaDetailPolicy.js';

/**
 * GPU checks of the I.4 material pieces (PR I phase I.4), outside the app:
 * the TSL coastal weight against its CPU twin, and the medium/fine ripple split
 * against the legacy total it must sum to.
 */

const FIELDS = ['waterDepth', 'shoreDistance', 'exposure', 'oceanMask', 'waterCoverage', 'available'];

/** TSL weight over a grid of the I.0 boundary values, against offshoreFftWeightCpu. */
export async function weightCase(ctx) {
  const rows = [];
  for (const waterDepth of [0, 3.5, 7, 8, 10, 10.5, 13, 14, 17, 24]) {
    for (const shoreDistance of [0, 12, 24, 28, 32, 36, 40, 48]) {
      for (const [exposure, oceanMask, waterCoverage, available] of [[1, 1, 1, 1], [0.5, 1, 1, 1], [0, 1, 1, 1], [1, 0, 1, 1], [1, 1, 0.3, 1], [1, 1, 1, 0]]) {
        rows.push({ waterDepth, shoreDistance, exposure, oceanMask, waterCoverage, available });
      }
    }
  }
  const count = rows.length, blend = OFFSHORE_FFT_DEFAULTS.blend;
  const inputs = FIELDS.map((name) => new THREE.StorageBufferAttribute(new Float32Array(rows.map((row) => row[name])), 1));
  const outputs = new THREE.StorageBufferAttribute(new Float32Array(count), 1);
  const nodes = inputs.map((attribute) => storage(attribute, 'float', count).toReadOnly());
  const out = storage(outputs, 'float', count);
  const kernel = Fn(() => {
    const read = Object.fromEntries(FIELDS.map((name, i) => [name, nodes[i].element(instanceIndex)]));
    out.element(instanceIndex).assign(offshoreFftWeight({ ...read, blend }));
  })().compute(count, [64]);
  ctx.renderer.compute(kernel);
  const values = new Float32Array(await ctx.renderer.getArrayBufferAsync(outputs));
  kernel.dispose();
  for (const attribute of [...inputs, outputs]) attribute.dispose();
  let worst = 0;
  rows.forEach((row, i) => { worst = Math.max(worst, Math.abs(values[i] - offshoreFftWeightCpu({ ...row, blend }))); });
  return { cases: count, maxError: worst, pass: worst < 1e-5 };
}

/**
 * The real ripple nodes on a 128 m plane at −4.2 Mm, seen at a grazing angle so both
 * distance fades are live: |total − (medium + fine)| for slope and variance, read back.
 */
export async function rippleSplitCase(ctx) {
  const settings = resolveSeaDetail({ enabled: true });
  const patterns = new PatternOrigins(seaDetailPatternFrames(settings));
  patterns.update(-4_234_496, 278_528);
  const lease = acquireSeaDetailTexture(4);
  const localXZ = vec2(uv().x.sub(0.5).mul(128), uv().y.oneMinus().sub(0.5).mul(128));
  const ripple = createSeaRippleNodes({
    map: lease.texture, patterns, localXZ, phases: [uniform(0.3), uniform(1.7), uniform(-2.2)],
    amplitude: uniform(0.6), time: uniform(126), strength: uniform(0.8), settings,
  });
  const slopeError = abs(ripple.slope.sub(ripple.mediumSlope.add(ripple.fineSlope)));
  const varianceError = abs(ripple.variance.sub(ripple.mediumVariance.add(ripple.fineVariance)));
  const material = new THREE.MeshBasicNodeMaterial();
  // Alpha is left at 1: the background clears it to 1 too, so it carries nothing.
  material.colorNode = vec4(slopeError.x.max(slopeError.y), varianceError, ripple.slope.length(), 1);
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(128, 128).rotateX(-Math.PI / 2), material);
  scene.add(mesh);
  const camera = new THREE.PerspectiveCamera(60, 2, 0.5, 2000);
  camera.position.set(0, 8, -80);
  camera.lookAt(0, 0, 40);
  const target = new THREE.RenderTarget(400, 200, { type: THREE.FloatType, depthBuffer: true });
  ctx.renderer.setRenderTarget(target);
  ctx.renderer.render(scene, camera);
  ctx.renderer.setRenderTarget(null);
  const pixels = await ctx.renderer.readRenderTargetPixelsAsync(target, 0, 0, 400, 200);
  target.dispose();
  material.dispose();
  mesh.geometry.dispose();
  lease.release();
  let slope = 0, variance = 0, magnitude = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    slope = Math.max(slope, pixels[i]);
    variance = Math.max(variance, pixels[i + 1]);
    magnitude = Math.max(magnitude, pixels[i + 2]);
  }
  // f32 reassociation only: (a+b+c)·g vs a·g + b·g + c·g.
  return { maxSlopeError: slope, maxVarianceError: variance, maxSlope: magnitude, pass: magnitude > 1e-3 && slope <= 1e-5 * Math.max(magnitude, 1) && variance < 1e-6 };
}
