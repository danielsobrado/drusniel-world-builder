import * as THREE from 'three/webgpu';
import { PostProcessingController } from '../../../render/postprocessing/PostProcessingController.js';
import { createPostProcessingSettings } from '../../../render/postprocessing/PostProcessingSettings.js';
import { createPostProcessingWarmupVariants } from '../../../render/postprocessing/PostProcessingWarmup.js';
import { installUnusedSamplerPruning } from '../../../render/UnusedSamplerBindings.js';
import { runRenderEnhancementVisualFixtures } from './RenderEnhancementVisualFixtures.js';

// A deterministic, small actual-renderer fixture; performance still uses PerfQaHarness.
const params = new URLSearchParams(location.search);
THREE.Node.captureStackTrace = params.has('stacks');
const renderer = new THREE.WebGPURenderer({ antialias: false });
installUnusedSamplerPruning(renderer);
await renderer.init();
renderer.setSize(1280, 720);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#8faec1');
const camera = new THREE.PerspectiveCamera(60, 1280 / 720, 0.1, 200);
camera.position.set(6, 5, 10); camera.lookAt(0, 1, 0);
const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(-10, 20, 12); scene.add(light);
scene.add(new THREE.HemisphereLight(0xc9e1ff, 0x736951, 2));
const block = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshStandardNodeMaterial({ color: '#b74a35' }));
block.position.set(-2, 2, 0); scene.add(block);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardNodeMaterial({ color: '#628450' }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
camera.updateMatrixWorld();
const store = createPostProcessingSettings();
const controller = new PostProcessingController({ renderer, scene, postProcessingStore: store });
const report = { cases: [], backend: renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl' };
window.__renderFixture = { renderer, scene, camera, controller, report };
try {
  for (const variant of (params.get('features') === 'only' ? [] : createPostProcessingWarmupVariants(store.get()))) {
    if (params.get('case') && variant.id !== params.get('case')) continue;
    document.querySelector('#status').textContent = variant.id;
    window.__renderFixture.current = variant.id;
    store.reset(variant.settings);
    controller.render(camera);
    await renderer.backend.device.queue.onSubmittedWorkDone();
    report.cases.push({ id: variant.id, failure: controller.lastFailure?.message ?? null });
  }
  controller.dispose();
  if (params.has('features')) await runRenderEnhancementVisualFixtures(renderer, async (id, state) => {
    report.cases.push({ id, ...state });
    if (params.has('snapshots')) await new Promise(resolve => { window.__renderFixture.pendingCapture = id; window.__renderFixture.continue = resolve; });
  });
} catch (error) { report.failure = error.stack; }
report.done = true;
document.querySelector('#status').textContent = report.failure ? 'Failed' : 'Complete';
