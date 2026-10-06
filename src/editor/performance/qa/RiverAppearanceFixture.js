import * as THREE from 'three/webgpu';
import { float, uniform, vec3 } from 'three/tsl';
import { loadEditorConfig } from '../../../config/loadEditorConfig.js';
import { createStylizedWaterMaterial } from '../../stylized/StylizedWaterMaterial.js';
import { createWaterPatternOrigins } from '../../stylized/WaterPatternOrigins.js';
import { waterfallPatternOrigin } from '../../stylized/WaterfallShading.js';
import { compositeWaterFoam } from '../../stylized/WaterSurfaceResponse.js';

/** Production water over a deterministic sloping channel, shallow banks and a fall. */
export async function runRiverAppearanceFixture(renderer, capture) {
  const config = structuredClone(loadEditorConfig().stylizedSurface);
  config.water.sea.enabled = false;
  config.water.rainRipples.enabled = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#81a8b4');
  const camera = new THREE.PerspectiveCamera(50, 640 / 480, 0.1, 300);
  camera.position.set(21, 13, 32); camera.lookAt(0, 4, -3); camera.updateMatrixWorld();
  const meters = 64, size = 65, center = [-4226432, 278528];
  const field = new Float32Array(size * size * 4);
  const flow = new Float32Array(field.length), coverage = new Uint8Array(field.length);
  const geometry = new THREE.PlaneGeometry(meters, meters, size - 1, size - 1);
  const bed = geometry.clone(), positions = bed.attributes.position;
  const colors = new Float32Array(size * size * 3);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const profile = (x, z) => {
    const bank = 8 - Math.abs(x - Math.sin(z * 0.055) * 3);
    const drop = clamp((z + 10) / 6, 0, 1);
    const height = 3 + 3 * (1 - drop) - z * 0.025;
    const depth = Math.max(0, bank * 0.3);
    return { bank, height, depth, fall: z > -10 && z < -4 ? 0.8 : 0,
      plunge: z >= -4 ? Math.exp(-(z + 4) / 5) : 0 };
  };
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const index = row * size + col, x = col - meters / 2, z = row - meters / 2;
    const p = profile(x, z);
    // Texture UV y runs opposite to plane vertex rows.
    const pixel = ((size - 1 - row) * size + col) * 4;
    field.set([p.bank > 0 ? 1 : 0, p.height, p.depth, Math.max(0, p.bank)], pixel);
    flow.set([0.5, 0.1, p.fall, p.plunge], pixel);
    coverage.set([0, 0, p.bank > 0 ? 255 : 0, 255], pixel);
    positions.setZ(index, p.height - p.bank * 0.3);
    const grain = 0.88 + 0.12 * Math.sin(x * 3.1) * Math.cos(z * 2.7);
    const tint = new THREE.Color(p.bank < -1 ? '#69704a' : '#a59b7a').multiplyScalar(grain);
    colors.set([tint.r, tint.g, tint.b], index * 3);
  }
  bed.setAttribute('color', new THREE.BufferAttribute(colors, 3)); bed.computeVertexNormals();
  const bedMaterial = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
  const ground = new THREE.Mesh(bed, bedMaterial); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const makeTexture = (data, type) => {
    const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, type);
    map.minFilter = map.magFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
  };
  const maps = [makeTexture(field, THREE.FloatType), makeTexture(flow, THREE.FloatType),
    makeTexture(coverage, THREE.UnsignedByteType)];
  const rockGeometry = new THREE.IcosahedronGeometry(1.2, 1);
  const rockMaterial = new THREE.MeshBasicNodeMaterial({ color: '#605e53' });
  for (const [x, z] of [[-5, 4], [6, 1], [-7, -11], [5, -9], [7, 16]]) {
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.set(x, profile(x, z).height - 0.25, z); scene.add(rock);
  }
  const clock = uniform(12.3), patterns = createWaterPatternOrigins(config.water); patterns.update(...center);
  const mesh = new THREE.Mesh(geometry); mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 2; scene.add(mesh);
  const owned = [];
  const build = (tier, refraction) => {
    const settings = structuredClone(config); settings.water.qualityTier = tier;
    const material = createStylizedWaterMaterial({ config: settings,
      waterFieldTexture: maps[0], waterFlowTexture: maps[1], surfaceMaskTexture: maps[2],
      waterFieldSize: size, waterSurfaceOrigin: uniform(0), chunkWorldSize: meters,
      chunkCenter: uniform(new THREE.Vector2(...center)), surfacePatterns: patterns,
      patternOrigin: uniform(new THREE.Vector2(...waterfallPatternOrigin(...center))),
      time: clock, sunDirection: uniform(new THREE.Vector3(-0.4, 0.8, 0.3).normalize()),
      enableRefraction: refraction });
    material.side = THREE.DoubleSide; owned.push(material); return material;
  };
  const draw = async id => {
    await renderer.compileAsync(scene, camera); renderer.render(scene, camera);
    if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone();
    await capture(id, { time: clock.value, calls: renderer.info.render.calls });
  };
  try {
    mesh.material = build('medium', false); await draw('river-medium');
    mesh.material = build('high', true); await draw('river-high');
    clock.value += 0.75; await draw('river-moving');
    clock.value -= 0.75;
    const offset = new THREE.Vector3(-4096, 0, 4096);
    scene.position.copy(offset); camera.position.add(offset); camera.updateMatrixWorld();
    await draw('river-rebased');
    scene.position.set(0, 0, 0); camera.position.sub(offset);
    camera.position.set(12, 6.8, 5); camera.lookAt(0, 4.5, -8); camera.updateMatrixWorld();
    await draw('river-fall');
  } finally {
    owned.forEach(material => material.dispose()); maps.forEach(map => map.dispose());
    geometry.dispose(); bed.dispose(); bedMaterial.dispose(); rockGeometry.dispose(); rockMaterial.dispose();
  }
  await captureFoamCompositing(renderer, capture);
}

/** Compare the shader to explicit two-layer compositing, including dry/opaque limits. */
async function captureFoamCompositing(renderer, capture) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0.2, 0.15, 0.1);
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 10); camera.position.z = 2;
  const geometry = new THREE.PlaneGeometry(1.8, 2.6), materials = [];
  const water = vec3(0.01, 0.09, 0.1), foam = vec3(0.7, 0.85, 0.8);
  const cases = [[0, 0], [0, 0.5], [0.12, 0.5], [0.3, 1], [1, 0.5], [1, 0], [0.08, 0.1], [0.94, 0.3]];
  try {
    for (const shader of [true, false]) {
      scene.clear();
      for (const [i, [opacity, coverage]] of cases.entries()) {
        const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
        if (shader) {
          const composed = compositeWaterFoam(water, float(opacity), foam, float(coverage));
          material.colorNode = composed.color; material.opacityNode = composed.opacity;
        } else {
          // Render the water layer, then the foam layer, using ordinary blending.
          const base = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
          base.colorNode = water; base.opacity = opacity; materials.push(base);
          const under = new THREE.Mesh(geometry, base); under.renderOrder = 0;
          under.position.set((i % 4 - 1.5) * 2, i < 4 ? 1.5 : -1.5, 0); scene.add(under);
          material.colorNode = foam; material.opacity = coverage;
        }
        materials.push(material);
        const mesh = new THREE.Mesh(geometry, material); mesh.renderOrder = 1;
        mesh.position.set((i % 4 - 1.5) * 2, i < 4 ? 1.5 : -1.5, 0); scene.add(mesh);
      }
      await renderer.compileAsync(scene, camera); renderer.render(scene, camera);
      if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone();
      await capture(shader ? 'river-foam-composite' : 'river-foam-layers');
    }
  } finally { geometry.dispose(); materials.forEach(material => material.dispose()); }
}
