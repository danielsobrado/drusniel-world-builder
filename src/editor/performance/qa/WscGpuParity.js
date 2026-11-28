import * as THREE from 'three/webgpu';
import { int, screenCoordinate, uniformArray, vec4 } from 'three/tsl';
import {
  sampleWorldSurfaceContextAt,
  sampleWorldSurfaceContextCpu,
  wscUniforms,
} from '../../stylized/worldSurfaceContext/WorldSurfaceContextState.js';

/** Largest CPU/GPU difference per channel that still counts as parity (half floats, 8-bit albedo). */
export const WSC_PARITY_TOLERANCE = Object.freeze({
  height: 0.02, validity: 1e-3, canopy: 1e-3, contact: 1e-3,
  albedo: 2e-3, roughness: 2e-3, normal: 2e-3, litter: 1e-3,
});

/**
 * Points across the live WSC window in render space: an 8 × 8 grid jittered off the
 * texel centres (bilinear weights matter), spanning 5 % past each edge so the window
 * fade and the outside are covered too.
 */
export function wscParityPoints(count = 8, seed = 7) {
  const origin = wscUniforms.renderOrigin.value;
  const span = 1 / wscUniforms.inverseSpan.value;
  let state = seed >>> 0;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  const points = [];
  for (let j = 0; j < count; j += 1) {
    for (let i = 0; i < count; i += 1) {
      const u = -0.05 + 1.1 * (i + random()) / count;
      const v = -0.05 + 1.1 * (j + random()) / count;
      points.push([origin.x + u * span, origin.y + v * span]);
    }
  }
  return points;
}

/**
 * Renders the production GPU sampler (`sampleWorldSurfaceContextAt`) at each point into
 * a float target, one pixel per point, reads it back and compares it with the CPU
 * mirror (`sampleWorldSurfaceContextCpu`) on the same published data.
 *
 * @returns {Promise<{ points: number, maxError: object, failures: object[] }>}
 */
export async function measureWscGpuParity(renderer, points = wscParityPoints()) {
  const n = points.length;
  const coords = uniformArray(points.map(([x, z]) => new THREE.Vector4(x, z, 0, 0)), 'vec4');
  const sample = sampleWorldSurfaceContextAt(coords.element(int(screenCoordinate.x)).xy);
  const passes = [
    { node: vec4(sample.height, sample.validity, sample.canopy, sample.contact), read: c => [c.height, c.validity, c.canopy, c.contact], names: ['height', 'validity', 'canopy', 'contact'] },
    { node: vec4(sample.albedo, sample.roughness), read: c => [...c.albedo, c.roughness], names: ['albedo', 'albedo', 'albedo', 'roughness'] },
    { node: vec4(sample.normal, sample.litter), read: c => [...c.normal, c.litter], names: ['normal', 'normal', 'normal', 'litter'] },
  ];
  const target = new THREE.RenderTarget(n, 1, { type: THREE.FloatType, depthBuffer: false });
  const previous = renderer.getRenderTarget();
  const cpu = points.map(([x, z]) => sampleWorldSurfaceContextCpu(x, z, { canonical: false }));
  const maxError = Object.fromEntries(Object.keys(WSC_PARITY_TOLERANCE).map(k => [k, 0]));
  const failures = [];
  try {
    for (const { node, read, names } of passes) {
      const material = new THREE.MeshBasicNodeMaterial();
      material.fragmentNode = node;
      const quad = new THREE.QuadMesh(material);
      renderer.setRenderTarget(target);
      quad.render(renderer);
      const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, n, 1);
      material.dispose();
      for (let p = 0; p < n; p += 1) {
        const expected = read(cpu[p]);
        for (let c = 0; c < 4; c += 1) {
          const name = names[c];
          const error = Math.abs(pixels[p * 4 + c] - expected[c]);
          maxError[name] = Math.max(maxError[name], error);
          if (!(error <= WSC_PARITY_TOLERANCE[name])) {
            failures.push({ point: points[p], channel: name, component: c, gpu: pixels[p * 4 + c], cpu: expected[c] });
          }
        }
      }
    }
  } finally {
    renderer.setRenderTarget(previous);
    target.dispose();
  }
  return { points: n, valid: cpu.filter(c => c.validity > 0).length, maxError, failures: failures.slice(0, 20), failureCount: failures.length };
}
