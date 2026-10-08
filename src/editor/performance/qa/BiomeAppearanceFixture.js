import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { loadEditorConfig } from '../../../config/loadEditorConfig.js';
import { createTerrainMaterial } from '../../terrainMaterial.js';
import { TILE_BY_ID } from '../../tileCatalog.js';
import { TERRAIN_SLOT_KEY } from '../../materials/TerrainSlotBindings.js';
import { installUnusedSamplerPruning } from '../../../render/UnusedSamplerBindings.js';
import { raiseDeviceLimits } from '../../../render/deviceLimits.js';
import { GrassTuning } from '../../stylized/GrassTuning.js';
import { createMeadowUniforms } from '../../stylized/meadow/meadowUniforms.js';
import { resolveMeadowGrassConfig } from '../../stylized/meadow/meadowGrassConfig.js';
import { createMeadowTemplate } from '../../stylized/meadow/meadowGrassGeometry.js';
import { createCompaction } from '../../stylized/meadow/meadowGrassCompaction.js';
import { MeadowGrassBatches } from '../../stylized/meadow/MeadowGrassBatches.js';
import { createMeadowBladeMaterial } from '../../stylized/meadow/meadowBladeMaterial.js';
import { createMeadowCardMaterial } from '../../stylized/meadow/meadowCardMaterial.js';

const backend = new URLSearchParams(location.search).get('backend') ?? 'webgpu';
const requiredLimits = backend === 'webgpu' ? await raiseDeviceLimits({}, { powerPreference: 'high-performance' }) : {};
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: backend === 'webgl',
  powerPreference: 'high-performance', requiredLimits });
const pruning = installUnusedSamplerPruning(renderer);
await renderer.init(); renderer.setSize(720, 480); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
document.body.append(renderer.domElement);
const actualBackend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl';
const state = { renderer, report: { backend: actualBackend, cases: [] }, pendingCapture: null };
window.__biomeFixture = state;
const atlas = await new THREE.TextureLoader().loadAsync('/assets/ground/meadow/meadow-grass-cards.webp');
atlas.colorSpace = THREE.SRGBColorSpace;

async function draw(scene, camera, id, details) {
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone();
  state.report.cases.push({ id, ...details }); state.pendingCapture = id;
  await new Promise(resolve => { state.continue = resolve; });
  state.pendingCapture = null;
}

try {
  if (backend !== actualBackend) throw new Error(`Requested ${backend}, received ${actualBackend}.`);
  for (const id of [3, 4, 7, 8, 9, 12]) {
    const config = structuredClone(loadEditorConfig().stylizedSurface);
    config.materialBake.enabled = false; config.groundCover.enabled = false;
    config.sky.cloudShadows.enabled = false;
    config.ambientEffects = null; config.contactShade.enabled = false;
    config.dirt.coverage = 0;
    const settings = resolveMeadowGrassConfig(config.grass.meadow);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#92b6bf');
    const camera = new THREE.PerspectiveCamera(52, 1.5, 0.1, 300);
    camera.position.set(5, 2.6, 10); camera.lookAt(0, 0.2, -2); camera.updateMatrixWorld();
    scene.add(new THREE.HemisphereLight('#d9edff', '#716046', 1.3));
    const sun = new THREE.DirectionalLight('#fff2d8', 2.2); sun.position.set(-20, 50, 35); scene.add(sun);
    const maps = [];
    const map = (data, size, format, type = THREE.UnsignedByteType) => {
      const result = new THREE.DataTexture(data, size, size, format, type);
      result.minFilter = result.magFilter = THREE.NearestFilter; result.needsUpdate = true; maps.push(result); return result;
    };
    const rgb = new THREE.Color(TILE_BY_ID.get(id).color).getHex();
    const tileTexture = map(new Uint8Array([rgb >>> 16, (rgb >>> 8) & 255, rgb & 255, id]), 1, THREE.RGBAFormat);
    tileTexture.colorSpace = THREE.SRGBColorSpace;
    const width = 32, meters = 16;
    const pathAt = (x, z) => Math.max(0, 1 - Math.abs(x + 2 - Math.sin(z * 0.4) * 0.6) / 0.9);
    const mask = new Uint8Array((width + 1) ** 2 * 4);
    for (let z = 0; z <= width; z++) for (let x = 0; x <= width; x++) {
      const offset = (z * (width + 1) + x) * 4;
      mask[offset] = Math.round(pathAt((x / width - 0.5) * meters, (0.5 - z / width) * meters) * 255);
      mask[offset + 1] = 255; mask[offset + 3] = 255;
    }
    const heightTexture = map(new Float32Array((width + 1) ** 2), width + 1, THREE.RedFormat, THREE.FloatType);
    const inputs = { tileTexture, heightTexture,
      surfaceMaskTexture: map(mask, width + 1, THREE.RGBAFormat),
      forestFloorTexture: map(new Uint8Array(4), 1, THREE.RGBAFormat), chunkCenter: uniform(new THREE.Vector2()) };
    const groundMaterial = createTerrainMaterial({ ...inputs, width, chunkWorldSize: meters, stylizedConfig: config });
    const geometry = new THREE.PlaneGeometry(meters, meters, width, width);
    const floor = new THREE.Mesh(geometry, groundMaterial); floor.rotation.x = -Math.PI / 2;
    floor.userData[TERRAIN_SLOT_KEY] = inputs; scene.add(floor);
    const uniforms = createMeadowUniforms(settings);
    uniforms.time.value = 12.3;
    const materialOptions = { uniforms, tuning: new GrassTuning(config).uniforms, config,
      sunDirection: uniform(sun.position.clone().normalize()), bandCount: 0, tileSize: 8 };
    const blades = createMeadowBladeMaterial(materialOptions);
    const cards = createMeadowCardMaterial({ ...materialOptions, atlas });
    const template = createMeadowTemplate({ detail: 5, count: 6400, tileSize: 8 });
    const batches = new MeadowGrassBatches({ scene, templates: { high: template }, material: blades, name: 'biome-qa' });
    batches.begin();
    let stems = 0;
    for (const x of [-4, 4]) for (const z of [-4, 4]) {
      const job = createCompaction({ template, centerX: x, centerZ: z, sample: (px, pz, _rank, out) => {
        out.height = 0; out.strength = 1 - pathAt(px, pz);
        out.path = pathAt(px, pz); out.shape = settings.shapeTable[id]; return out.strength > 0.25;
      } });
      job.advance(); stems += job.output.count;
      batches.add('high', { buildId: 1, renderX: x, renderZ: z, output: job.output });
    }
    batches.commit();
    try {
      await draw(scene, camera, `biome-${id}`, { biome: TILE_BY_ID.get(id).label, stems });
      // Every instance and ground sample addresses the same canonical point after rebasing.
      uniforms.origin.value.set(4096, -2048);
      for (const members of batches.members.values()) for (const tile of members) {
        tile.renderX -= 4096; tile.renderZ += 2048;
      }
      batches.commit(); floor.position.set(-4096, 0, 2048);
      camera.position.add(new THREE.Vector3(-4096, 0, 2048)); camera.updateMatrixWorld();
      sun.position.add(new THREE.Vector3(-4096, 0, 2048));
      sun.target.position.set(-4096, 0, 2048); scene.add(sun.target);
      await draw(scene, camera, `biome-${id}-rebased`, { stems });
      // Exercise production cards with the same canonical biome and lighting.
      for (const mesh of batches.meshes) mesh.visible = false;
      const cardTemplate = createMeadowTemplate({ detail: 1, count: 256, tileSize: 16, cards: true });
      const cardJob = createCompaction({ template: cardTemplate, centerX: 0, centerZ: 0,
        sample: (_x, _z, _rank, out) => { out.height = 0; out.strength = 1; out.shape = settings.shapeTable[id]; return true; } });
      cardJob.advance();
      const cardBatches = new MeadowGrassBatches({ scene, templates: { high: cardTemplate }, material: cards, name: 'card-qa' });
      cardBatches.begin(); cardBatches.add('high', { buildId: 1, renderX: -4096, renderZ: 2048, output: cardJob.output });
      cardBatches.commit();
      uniforms.handoff.value.set(0, 0.01); uniforms.farFade.value.set(180, 200);
      try { await draw(scene, camera, `biome-${id}-cards`, { stems: cardJob.output.count }); }
      finally { cardBatches.dispose(); cardTemplate.dispose(); }
    } finally {
      batches.dispose(); template.dispose(); blades.dispose(); cards.dispose();
      groundMaterial.dispose(); geometry.dispose(); maps.forEach(texture => texture.dispose());
    }
  }
} catch (error) { state.report.failure = error.stack; }
finally { atlas.dispose(); pruning.dispose(); state.report.done = true; }
