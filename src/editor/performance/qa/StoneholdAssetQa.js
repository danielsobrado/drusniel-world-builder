import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { reflector } from 'three/tsl';

import { resolveAssetUrl } from '../../assets/assetUrl.js';
import { TownKitAssets } from '../../towns/TownKitAssets.js';
import { createTownKitMaterial } from '../../towns/TownKitMaterial.js';
import { resolveLook } from '../../towns/TownMaterialPalette.js';

const NAMES = [
  'Stonehold_Ledge_Small', 'Stonehold_Ledge_Large', 'Stonehold_Twin_Outcrop',
  'Stonehold_Vent_Crater', 'Stonehold_Caldera_Basin', 'Stonehold_Fang_Shrine',
  'Stonehold_Cavern_Maw', 'Stonehold_Horned_Sanctum', 'Mine_Vent_Stack',
  'Mountain_Cliff_Wall', 'Mountain_Gate_Massif', 'Mountain_Cavern_Vault',
];
const query = new URLSearchParams(location.search);
const controls = Object.fromEntries(['module', 'lod', 'light', 'view'].map(id => [id, document.getElementById(id)]));
for (const name of NAMES) controls.module.add(new Option(name.replaceAll('_', ' '), name));
for (const [key, input] of Object.entries(controls)) if (query.has(key)) input.value = query.get(key);
if (!NAMES.includes(controls.module.value)) controls.module.value = 'Stonehold_Twin_Outcrop';
const status = document.getElementById('status');
const mode = query.get('meshlets') ?? 'baseline';
const comparison = query.has('meshlets');
const staticMaterial = query.get('material') === 'static';

async function main() {
  if (!['baseline', 'native', 'external'].includes(mode)) throw new Error(`Unknown meshlet mode: ${mode}`);
  const startup = performance.now();
  const renderer = new THREE.WebGPURenderer({
    antialias: true, forceWebGL: query.get('webgl') === '1', trackTimestamp: comparison,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  document.body.prepend(renderer.domElement);
  await renderer.init();
  const timestamps = renderer.backend.trackTimestamp === true;
  renderer.backend.trackTimestamp = false;
  if (comparison && renderer.backend.isWebGPUBackend) {
    renderer.backend.device.addEventListener('uncapturederror', event => console.error(event.error.message));
  }
  if (mode === 'native') {
    const { MeshletDrawingPipeline } = await import('three/addons/pipelines/MeshletDrawingPipeline.js');
    renderer.drawingPipeline = new MeshletDrawingPipeline({ occlusionCulling: false });
  }
  const assets = new TownKitAssets({ baseUrl: import.meta.env.BASE_URL });
  await assets.ensure();
  if (assets.failed) throw assets.failed;
  const townMaterial = createTownKitMaterial(assets.atlas, resolveLook({
    skin: 'heartland', stone: 'granite', finish: 'masonry', family: 'Stonehold',
    thatch: false, banner: [0.11, 0.18, 0.32],
  }));
  let material = townMaterial;
  if (staticMaterial) {
    const map = await new THREE.TextureLoader().loadAsync(resolveAssetUrl(import.meta.env.BASE_URL,
      'assets/textures/settlement/stone-rock-color.webp'));
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    material = new THREE.MeshStandardNodeMaterial({ map, roughness: 0.9 });
  }
  const copies = THREE.MathUtils.clamp(Math.trunc(Number(query.get('copies'))) || 1, 1, 16);
  let vg;
  if (mode === 'external' && staticMaterial && renderer.backend.isWebGPUBackend) {
    const { VirtualGeometry } = await import('three-virtual-geometry');
    // Cover the full-detail workload in both passes without reserving the defaults (10M / 4M triangles).
    vg = new VirtualGeometry({ maxTriangles: copies * 48000, maxShadowTriangles: copies * 48000 });
    vg.occlusion.enabled = false;
    vg.lodBlend = 1;
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#52677b');
  scene.fog = new THREE.FogExp2('#52677b', 0.0025);
  const sky = new THREE.HemisphereLight('#bed7f0', '#51453b', 2.1);
  scene.add(sky);
  const sun = new THREE.DirectionalLight('#ffe2b8', 3.2);
  sun.position.set(-20, 35, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 0.1, far: 140 });
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#aacaf1', 1.0);
  rim.position.set(15, 15, -20);
  scene.add(rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardNodeMaterial({ color: '#3a454b', roughness: 0.96 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.18;
  ground.receiveShadow = true;
  if (comparison) ground.material.side = THREE.DoubleSide;
  const subject = new THREE.Group();
  scene.add(ground, subject);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 1500);
  const orbit = new OrbitControls(camera, renderer.domElement);
  let mesh;
  let imported;
  function unload() {
    if (imported) {
      imported.dispose();
      imported = null;
      vg.dispose(); // The viewer owns one active asset; release the retired geometry pool as well.
    }
    mesh?.removeFromParent();
    mesh?.dispose();
    mesh = null;
  }
  async function update() {
    const far = controls.lod.value === '1';
    const geometry = (far ? assets.farModules : assets.modules).get(controls.module.value)?.opaque;
    if (!geometry) throw new Error(`Missing ${controls.module.value} at LOD ${controls.lod.value}`);
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const centre = geometry.boundingBox.getCenter(new THREE.Vector3());
    if (mesh?.geometry !== geometry) {
      unload();
      mesh = new THREE.InstancedMesh(geometry, material, copies);
      for (let i = 0; i < copies; i += 1) {
        mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation((i % 4) * (size.x + 4), 0, Math.floor(i / 4) * (size.z + 4)));
        mesh.setColorAt(i, new THREE.Color(0.95, 0.95, 0.95));
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      subject.add(mesh);
      const current = { module: controls.module.value, lod: Number(controls.lod.value), copies, triangles: geometry.index.count / 3 };
      if (comparison) Object.assign(current, { mode, material: staticMaterial ? 'static' : 'town', converted: 0, buildMs: 0 });
      if (vg) {
        state.preparing = true;
        try {
          imported = await vg.add(subject, { filter: candidate => candidate === mesh
            && !material.transparent && !material.positionNode && material.side === THREE.FrontSide });
          current.converted = imported.meshes.length;
          current.buildMs = imported.stats.buildMs;
          if (state.ready) await vg.compileAsync(renderer, scene, camera);
        } finally {
          state.preparing = false;
        }
      }
      state.current = current;
    }
    const reach = Math.max(size.x, size.y, size.z) * (copies > 1 ? 3 : 1);
    if (copies > 1) centre.add(new THREE.Vector3(
      (Math.min(copies, 4) - 1) * (size.x + 4) / 2, 0, Math.floor((copies - 1) / 4) * (size.z + 4) / 2));
    centre.add(subject.position);
    if (controls.view.value === 'detail') {
      centre.y += size.y * 0.10;
      camera.position.copy(centre).add(new THREE.Vector3(0, reach * 0.08, reach * 0.62));
    } else {
      const direction = controls.view.value === 'front' ? new THREE.Vector3(0, 0.12, 1) : new THREE.Vector3(-0.4, 0.62, 1);
      camera.position.copy(centre).add(direction.normalize().multiplyScalar(reach * 2));
    }
    orbit.target.copy(centre);
    orbit.update();
    const dusk = controls.light.value === 'dusk';
    sky.intensity = dusk ? 0.65 : 2.1;
    sun.intensity = dusk ? 0.65 : 3.2;
    rim.intensity = dusk ? 0.8 : 1.0;
    const { current } = state;
    status.textContent = `${current.module.replaceAll('_', ' ')} · ${current.triangles.toLocaleString()} triangles · ${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} m · drag to orbit`;
  }
  const state = window.__stoneholdQa = { ready: false, renderer, assets, scene, camera, update, frameTimes: [] };
  if (comparison) Object.assign(state, {
    timestamps, orbit, unload, vg,
    shiftOrigin(offset) {
      for (const object of [subject, ground, sun, sun.target, rim, camera]) object.position.x += offset;
      orbit.target.x += offset;
      imported?.syncTransforms();
      orbit.update();
    },
    setSnow(value) { townMaterial.userData.townKit.snow.value = value; },
    addReflector() {
      const mirror = reflector({ resolutionScale: 0.5 });
      mirror.target.rotation.x = -Math.PI / 2;
      mirror.target.position.set(orbit.target.x, -0.1, orbit.target.z + 15);
      // Keep the reflector surface on the regular path when it hides its own material for the nested pass.
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(45, 23),
        new THREE.MeshBasicNodeMaterial({ colorNode: mirror.mul(0.7), side: THREE.DoubleSide }));
      mirror.target.add(pool);
      scene.add(mirror.target);
    },
  });
  await update();
  for (const input of Object.values(controls)) input.addEventListener('change', async () => {
    for (const control of Object.values(controls)) control.disabled = true;
    try { await update(); }
    catch (error) { status.textContent = error.message; console.error(error); }
    finally { for (const control of Object.values(controls)) control.disabled = false; }
  });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  if (mode === 'native' && renderer.backend.isWebGPUBackend) {
    const buildStart = performance.now();
    await renderer.drawingPipeline.prepareAsync(scene, camera);
    state.current.buildMs = performance.now() - buildStart;
  }
  const compileStart = performance.now();
  if (vg) await vg.compileAsync(renderer, scene, camera);
  else await renderer.compileAsync(scene, camera);
  state.compileMs = performance.now() - compileStart;
  let previous = performance.now();
  renderer.setAnimationLoop(() => {
    if (state.preparing) return;
    const now = performance.now();
    const dt = now - previous;
    if (state.measuring) state.frameTimes.push(dt);
    previous = now;
    if (state.beforeRender?.() === false) return;
    const start = state.afterRender ? performance.now() : 0;
    renderer.render(scene, camera);
    state.afterRender?.(dt, performance.now() - start);
    if (!state.ready) state.firstFrameMs = performance.now() - startup;
    state.ready = true;
  });
}

main().catch(error => {
  window.__stoneholdQaError = error.message;
  status.textContent = error.message;
  console.error(error);
});
