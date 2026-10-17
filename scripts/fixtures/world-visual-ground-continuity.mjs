import * as THREE from 'three/webgpu';
import { float, positionWorld, uniform, vec4 } from 'three/tsl';
import { loadEditorConfig } from '/src/config/loadEditorConfig.js';
import { createTerrainTransitionPatterns } from '/src/editor/materials/TerrainTransitionNodes.js';
import { createMeadowGroundShading } from '/src/editor/stylized/meadow/MeadowGroundShading.js';
import { applyMeadowGroundDetail } from '/src/editor/stylized/meadow/meadowGroundDetail.js';

const backend = new URLSearchParams(location.search).get('backend') ?? 'webgpu';
const state = window.__worldGrassFixture = { report: { backend, checks: [], cases: [], done: false }, pendingCapture: null };
const renderer = new THREE.WebGPURenderer({ forceWebGL: backend === 'webgl', antialias: false });
renderer.setPixelRatio(1); renderer.setSize(800, 600); renderer.toneMapping = THREE.NoToneMapping;
document.body.append(renderer.domElement); await renderer.init();
state.report.backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl';
const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-16, 16, 12, -12, .1, 100);
camera.position.set(0, 10, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
const target = new THREE.RenderTarget(800, 600, { type: THREE.FloatType });
target.texture.colorSpace = THREE.LinearSRGBColorSpace;
const config = loadEditorConfig().stylizedSurface;
const patterns = createTerrainTransitionPatterns();
const biome = uniform(4), distance = uniform(60), offset = uniform(new THREE.Vector2());
const local = positionWorld.xz.sub(offset);
const ground = createMeadowGroundShading(config, vec4(0, 0, 0, biome.div(255)), positionWorld.xz);
const soil = new THREE.Color(config.dirt.color);
const color = applyMeadowGroundDetail({ color: ground.root, root: ground.root, soil: vec4(soil.r, soil.g, soil.b, 1).rgb,
  coverage: float(1), cameraDistance: distance, patterns, localXZ: local, ...ground.detail });
const material = new THREE.MeshBasicNodeMaterial(); material.fragmentNode = vec4(color, 1);
const mesh = new THREE.Mesh(new THREE.PlaneGeometry(32, 24).rotateX(-Math.PI / 2), material); scene.add(mesh);
const luminance = pixels => {
  let total = 0, finite = true;
  for (let i = 0; i < pixels.length; i += 4) {
    const value = pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
    total += value; finite &&= Number.isFinite(value) && value >= 0;
  }
  return { mean: total / (pixels.length / 4), finite };
};
async function draw() {
  renderer.setRenderTarget(target); await renderer.render(scene, camera);
  const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 800, 600);
  renderer.setRenderTarget(null); await renderer.render(scene, camera);
  return pixels;
}
async function capture(id) {
  state.pendingCapture = id;
  await new Promise(resolve => { state.continue = resolve; }); state.pendingCapture = null;
}
try {
  if (state.report.backend !== backend) throw new Error('Unexpected ground fixture backend.');
  await renderer.compileAsync(scene, camera);
  for (const id of [3, 4, 5, 6, 7, 8, 9, 10, 12]) {
    biome.value = id;
    for (const origin of [[0, 0], [7134127, -1081563]]) {
      patterns.update(...origin); offset.value.set(0, 0); distance.value = 60;
      const reference = luminance(await draw());
      for (const meters of [4, 8, 16, 24, 34, 60]) {
        distance.value = meters;
        const stats = luminance(await draw()), relativeMean = stats.mean / reference.mean;
        const name = `biome-${id}-${origin[0] ? 'far-origin' : 'local'}-${meters}m`;
        state.report.cases.push({ id: name, origin, meters, ...stats, relativeMean });
        state.report.checks.push({ id: name, relativeMean, passed: stats.finite && relativeMean >= .94 && relativeMean <= 1.06 });
        if (origin[0] === 0 && [4, 34].includes(meters)) await capture(name);
      }
    }
  }
  state.report.passed = state.report.checks.every(check => check.passed);
} catch (error) { state.report.failure = error.stack; state.report.passed = false; }
finally { target.dispose(); material.dispose(); ground.dispose(); mesh.geometry.dispose(); state.report.done = true; }
