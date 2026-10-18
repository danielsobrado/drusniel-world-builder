import * as THREE from 'three/webgpu';
import { uniform, vec3 } from 'three/tsl';
import { loadEditorConfig } from '/src/config/loadEditorConfig.js';
import { createStylizedFlowerMaterial } from '/src/editor/stylized/StylizedFlowerMaterial.js';
import { createFlowerCrossGeometry } from '/src/editor/stylized/StylizedFlowerGeometry.js';
import { foliageLight, syncFoliageLight } from '/src/editor/stylized/forest/foliageLight.js';
import { applyFixtureLighting } from '/scripts/fixtures/world-visual-fixture-lighting.mjs';

const backend = new URLSearchParams(location.search).get('backend') ?? 'webgpu';
const state = window.__plantAppearanceFixture = { pendingCapture: null,
  report: { checks: [], cases: [], done: false, passed: false }, continue: () => state.resume?.() };
const map = values => {
  const t = new THREE.DataTexture(new Uint8Array(values), 1, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
};
let renderer;
try {
  const config = loadEditorConfig().stylizedSurface;
  config.ambientEffects.enabled = false; config.sky.cloudShadows.enabled = false;
  Object.assign(config.flowers, { windStrength: 0, windLean: 0, bendAmplitude: 0 });
  config.path.naturalTrail.enabled = false; config.dirt.coverage = -1;
  renderer = new THREE.WebGPURenderer({ forceWebGL: backend === 'webgl', antialias: false });
  renderer.setSize(384, 384); renderer.setClearColor(0, 0); renderer.toneMapping = THREE.NoToneMapping;
  await renderer.init(); document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1.4, 1.4, 1.4, -1.4, .1, 30);
  const sun = new THREE.DirectionalLight(), fill = new THREE.HemisphereLight(); scene.add(sun, fill, sun.target);
  const textures = { mask: map([255, 255, 255, 255]), zones: map([255, 0, 0, 255]), gradient: map([255, 255, 255, 255]) };
  const surfaceMaskTexture = map([0, 255, 0, 255]), tileTexture = map([128, 128, 128, 6]);
  const material = createStylizedFlowerMaterial({ config, textures, surfaceMaskTexture, tileTexture,
    chunkCenter: uniform(new THREE.Vector2()), chunkWorldSize: 128, time: uniform(0) });
  const geometry = createFlowerCrossGeometry(1); geometry.instanceCount = 1; geometry.setDrawRange(0, 6);
  geometry.getAttribute('instanceParams').setXYZW(0, 0, 1, .3, 0);
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; scene.add(mesh);
  const target = new THREE.RenderTarget(384, 384, { type: THREE.FloatType });
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  const draw = async () => {
    renderer.setRenderTarget(target); await renderer.renderAsync(scene, camera);
    const pixels = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 384, 384);
    renderer.setRenderTarget(null); await renderer.renderAsync(scene, camera);
    let luminance = 0, count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > .5) {
      count++; luminance += .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
    }
    return { luminance: luminance / Math.max(1, count), pixels: count };
  };
  for (const light of ['day', 'low-sun', 'overcast', 'night']) {
    const lighting = applyFixtureLighting(config, sun, fill, light);
    // Isolate diffuse normal correctness from legitimately view-dependent transmission.
    foliageLight.strength.value = 0;
    const views = [];
    for (const [index, eye] of [[0, [0, .5, 4]], [1, [0, 2.5, 4]]]) {
      camera.position.set(...eye); camera.lookAt(0, .5, 0); camera.updateMatrixWorld();
      const value = await draw(); views.push(value);
      state.report.cases.push({ light, eye, lighting, ...value });
      state.pendingCapture = `${light}-${index}`;
      await new Promise(resolve => { state.resume = resolve; }); state.pendingCapture = null;
    }
    const relative = views[1].luminance / views[0].luminance;
    state.report.checks.push({ id: `${light}-world-normal-camera-invariance`, relative,
      passed: views.every(v => v.pixels > 1000 && Number.isFinite(v.luminance)) && Math.abs(relative - 1) < .005 });
  }
  const day = state.report.cases.find(c => c.light === 'day').luminance;
  const night = state.report.cases.find(c => c.light === 'night').luminance;
  // Moon and sun have different bearings. Their ratio alone cannot impose a
  // radiometric ceiling on a double-sided card; also test complete blackout.
  state.report.checks.push({ id: 'ordinary-petals-darken-at-night', day, night, passed: night < day });
  sun.intensity = fill.intensity = 0; syncFoliageLight({ directional: sun, hemisphere: fill });
  const blackout = await draw();
  state.report.checks.push({ id: 'ordinary-petals-have-no-light-independent-glow', ...blackout,
    passed: blackout.pixels > 1000 && blackout.luminance < 1e-6 });
  applyFixtureLighting(config, sun, fill, 'day'); foliageLight.strength.value = 0;
  material.normalNode = vec3(0, 1, 0); material.needsUpdate = true;
  const control = [];
  for (const eye of [[0, .5, 4], [0, 2.5, 4]]) {
    camera.position.set(...eye); camera.lookAt(0, .5, 0); camera.updateMatrixWorld();
    control.push(await draw());
  }
  const controlChange = Math.abs(control[1].luminance / control[0].luminance - 1);
  state.report.checks.push({ id: 'old-view-space-normal-negative-control-rejected', controlChange, passed: controlChange > .02 });
  state.report.passed = state.report.checks.every(c => c.passed);
  target.dispose(); geometry.dispose(); material.dispose(); surfaceMaskTexture.dispose(); tileTexture.dispose();
  Object.values(textures).forEach(t => t.dispose());
} catch (error) { state.report.failure = error.stack; }
finally { state.report.done = true; }
