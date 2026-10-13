import * as THREE from 'three/webgpu';
import { uniform, vec3, vec4 } from 'three/tsl';
import { loadEditorConfig } from '../../../config/loadEditorConfig.js';
import { createStylizedLeafMaterial } from '../../stylized/StylizedTreeMaterials.js';
import { cloneBushMaterial, createBushProxyPrototype } from '../../stylized/BushRenderAssets.js';
import { createTreeProxyPrototype } from '../../stylized/lod/StylizedProxyGeometry.js';
import { createInstancedRenderers, writeInstances } from '../../stylized/lod/StylizedLodRuntime.js';
import { plantSwayTime } from '../../stylized/plantSway.js';
import { worldWindTarget, worldWindUniforms } from '../../weather/wind/worldWindState.js';
import { installUnusedSamplerPruning } from '../../../render/UnusedSamplerBindings.js';
import { FallingLeaves } from '../../stylized/leaves/FallingLeaves.js';
import { CpuTreeImpostorBatch } from '../../stylized/impostor/CpuTreeImpostorBatch.js';
import { GpuTreeImpostorBatch } from '../../stylized/impostor/GpuTreeImpostorBatch.js';

const backend = new URLSearchParams(location.search).get('backend') ?? 'webgpu';
const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: backend === 'webgl', powerPreference: 'high-performance' });
installUnusedSamplerPruning(renderer);
await renderer.init(); renderer.setSize(640, 480); renderer.setPixelRatio(1);
document.body.append(renderer.domElement);
const state = { renderer, report: { backend: renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl', cases: [] }, pendingCapture: null };
window.__foliageFixture = state;

async function capture(scene, camera, id) {
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone();
  state.report.cases.push({ id }); state.pendingCapture = id;
  await new Promise(resolve => { state.continue = resolve; });
  state.pendingCapture = null;
}

try {
  // Constant field isolates vertex response from changing weather and frame timing.
  const fill = new THREE.QuadMesh(new THREE.MeshBasicNodeMaterial());
  fill.material.colorNode = vec4(0.18, 0, 0.5, 0.18);
  renderer.setRenderTarget(worldWindTarget); fill.render(renderer); renderer.setRenderTarget(null);
  worldWindUniforms.windowCenter.value.set(0, 0);
  worldWindUniforms.windowCenterCanonical.value.set(0, 0);
  worldWindUniforms.prevailing.value.set(1, 0);
  const config = structuredClone(loadEditorConfig().stylizedSurface);
  const time = uniform(2.5);
  const crown = new THREE.PlaneGeometry(3, 4, 12, 24); crown.translate(0, 4, 0); crown.computeBoundingBox();
  const source = new THREE.MeshLambertMaterial({ color: '#5b8a41' });
  const leaf = createStylizedLeafMaterial({ source, bounds: { minY: 2, maxY: 6 }, time, config });
  const trunkGeometry = new THREE.CylinderGeometry(0.1, 0.15, 4, 6); trunkGeometry.translate(0, 2, 0);
  const tree = [{ geometry: crown, material: leaf, kind: 'leaf' },
    { geometry: trunkGeometry, material: new THREE.MeshLambertNodeMaterial(), kind: 'trunk' }];
  const proxy = createTreeProxyPrototype(tree, config).proxyParts;
  const shrubGeometry = new THREE.SphereGeometry(0.8, 16, 12); shrubGeometry.translate(0, 0.8, 0); shrubGeometry.computeBoundingBox();
  const shrubMaterial = cloneBushMaterial(source, { config, height: 1.6 });
  const shrub = { geometry: shrubGeometry, material: shrubMaterial, height: 1.6, prototypeId: 'qa-shrub', kind: 'bush' };
  const shrubProxy = createBushProxyPrototype(shrub, { config });

  for (const [id, parts, tinted, targetY] of [
    ['tree', tree, true, 3], ['tree-proxy', proxy, true, 3],
    ['bush', [shrub], false, 0.8], ['bush-proxy', [shrubProxy], false, 0.8],
  ]) {
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#ffffff');
    const root = new THREE.Group(); scene.add(root);
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100);
    camera.position.set(0, targetY, 15); camera.lookAt(0, targetY, 0); camera.updateMatrixWorld();
    const renderers = createInstancedRenderers({ root, renderer, partsByPrototype: [parts], capacity: 1, tintLeaves: tinted });
    writeInstances(renderers, [[{ matrix: new THREE.Matrix4(), fade: 1, seed: 0.2, colorVariation: 1 }]]);
    // Flat silhouettes test only geometry; procedural colour noise is independent.
    for (const mesh of renderers.flat()) { mesh.material.colorNode = vec3(0); mesh.material.emissiveNode = vec3(0); mesh.frustumCulled = false; }
    time.value = 2.5; plantSwayTime.value = 2.5;
    await capture(scene, camera, `${id}-still`);
    time.value = 4.1; plantSwayTime.value = 4.1;
    await capture(scene, camera, `${id}-moving`);
    // Move the render origin without changing any canonical world point.
    const rebase = new THREE.Vector3(-128, 0, 64);
    root.position.copy(rebase); root.updateMatrixWorld(true);
    camera.position.add(rebase); camera.updateMatrixWorld();
    worldWindUniforms.windowCenter.value.set(rebase.x, rebase.z);
    await capture(scene, camera, `${id}-rebased`);
    // Streaming can also change the instance anchor: compensate the matrix in
    // the root so geometry remains at exactly the same canonical location.
    writeInstances(renderers, [[{ matrix: new THREE.Matrix4().makeTranslation(256, 0, -256), fade: 1, seed: 0.2, colorVariation: 1 }]]);
    root.position.add(new THREE.Vector3(-256, 0, 256)); root.updateMatrixWorld(true);
    await capture(scene, camera, `${id}-reanchored`);
    worldWindUniforms.windowCenter.value.set(0, 0);
    for (const mesh of renderers.flat()) { mesh.geometry.dispose(); mesh.material.dispose(); }
  }
  const albedo = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); albedo.needsUpdate = true;
  const normal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); normal.needsUpdate = true;
  const atlas = { width: 3, height: 6, columns: 1, rows: 1, tileSize: 1, gutter: 0,
    lowElevationDegrees: 0, highElevationDegrees: 60, albedo, normal };
  for (const [id, Batch] of [['impostor-cpu', CpuTreeImpostorBatch], ...(backend === 'webgpu' ? [['impostor-gpu', GpuTreeImpostorBatch]] : [])]) {
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#ffffff');
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 100);
    camera.position.set(0, 3, 15); camera.lookAt(0, 3, 0); camera.updateMatrixWorld();
    const batch = new Batch({ scene, renderer, atlas, capacity: 1, name: id });
    batch.material.colorNode = vec3(0); batch.material.emissiveNode = vec3(0);
    batch.setRecords([{ x: 0, y: 3, z: 0, scale: 1, yaw: 0, fade: 1, seed: 0.2, radius: 4 }]);
    await batch.update(camera, { x: 0, z: 0 }, 2500);
    await capture(scene, camera, `${id}-still`);
    await batch.update(camera, { x: 0, z: 0 }, 4100);
    await capture(scene, camera, `${id}-moving`);
    camera.position.add(new THREE.Vector3(-128, 0, 64)); camera.updateMatrixWorld();
    worldWindUniforms.windowCenter.value.set(-128, 64);
    await batch.update(camera, { x: 128, z: -64 }, 4100);
    await capture(scene, camera, `${id}-rebased`);
    worldWindUniforms.windowCenter.value.set(0, 0);
    batch.dispose();
  }
  // Compile production pigment and transmission too, which silhouettes omit.
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#a6bac3');
  scene.add(new THREE.HemisphereLight('#d9edff', '#716046', 1.3));
  const sun = new THREE.DirectionalLight('#fff2d8', 2.2); sun.position.set(-20, 50, 35); scene.add(sun);
  const root = new THREE.Group(); scene.add(root);
  const camera = new THREE.PerspectiveCamera(52, 640 / 480, 0.1, 100);
  camera.position.set(0, 3.2, 12); camera.lookAt(0, 2.7, 0); camera.updateMatrixWorld();
  const renderers = createInstancedRenderers({ root, renderer, partsByPrototype: [tree, [shrub]], capacity: 1, tintLeaves: true });
  writeInstances(renderers, [[{ matrix: new THREE.Matrix4().makeTranslation(-1.5, 0, 0), fade: 1, seed: 0.2 }],
    [{ matrix: new THREE.Matrix4().makeTranslation(1.8, 0, 0), fade: 1, seed: 0.2 }]]);
  const leaves = new FallingLeaves({ scene, config: { count: 80, size: 0.24, boxSize: 8, boxHeight: 5 }, foliageConfig: config,
    getTile: () => 6, getTileSize: () => 2, getOrigin: () => ({ x: 0, z: 0 }) });
  for (let frame = 0; frame < 120; frame++) leaves.update(4.1, 1 / 30, camera, { x: 0, z: 0 });
  await capture(scene, camera, 'palette');
  leaves.dispose();
  state.report.done = true;
} catch (error) { state.report.failure = error.stack; state.report.done = true; }
