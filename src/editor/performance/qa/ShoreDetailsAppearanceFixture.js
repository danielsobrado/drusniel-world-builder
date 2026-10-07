import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { loadEditorConfig } from '../../../config/loadEditorConfig.js';
import { createStylizedWaterMaterial } from '../../stylized/StylizedWaterMaterial.js';
import { createWaterPatternOrigins } from '../../stylized/WaterPatternOrigins.js';
import { createAquaticFloraPrototypes } from '../../stylized/aquaticFloraPrototypes.js';
import { createShoreLifePrototypes } from '../../stylized/shoreLifePrototypes.js';
import { StylizedGroundDetailView } from '../../stylized/StylizedGroundDetailView.js';
import { StylizedRockView } from '../../stylized/StylizedRockView.js';
import { createInstancedRenderers, writeInstances, disposeInstancedRenderers } from '../../stylized/lod/StylizedLodRuntime.js';
import { applyRockWeathering, resolveRockWeathering } from '../../stylized/rockWeathering.js';
import { lakeWavePhases } from '../../water/LakeSurfaceWaves.js';
import { installSurfaceAnisotropy } from '../../../render/SurfaceAnisotropyController.js';

const CENTER = [-4226432, 278528];
const matrix = (x, y, z, scale = 1) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));

function setSurfaceData(meshes, records) {
  // Also makes the fixture renderable against the frozen pre-change runtime.
  for (let i = 0; i < meshes.length; i++) for (const mesh of meshes[i]) {
    if (!mesh.geometry.hasAttribute('instanceSurface')) mesh.geometry.setAttribute('instanceSurface',
      new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3), 3));
    const attribute = mesh.geometry.getAttribute('instanceSurface');
    for (let n = 0; n < records[i].length; n++) attribute.setXYZ(n, ...records[i][n].surfaceData);
    attribute.needsUpdate = true;
  }
}

/** Actual water, flora, beach manifests and rock shaders at a raised lake. */
export async function runShoreDetailsAppearanceFixture(renderer, capture) {
  const config = structuredClone(loadEditorConfig().stylizedSurface);
  // Fixture canvas is small, but this pass exercises the desktop policy.
  if (config.enhancements.surfaceAnisotropy) config.enhancements.surfaceAnisotropy.level = 16;
  const filtering = config.enhancements.surfaceAnisotropy
    ? installSurfaceAnisotropy(renderer, config.enhancements.surfaceAnisotropy) : null;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#81a8b4');
  scene.add(new THREE.HemisphereLight('#d9edff', '#716046', 2));
  const sun = new THREE.DirectionalLight('#fff2d8', 3); sun.position.set(-3, 8, 5); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(48, 4 / 3, 0.1, 100);
  const root = new THREE.Group(); scene.add(root);
  const clock = uniform(12.3);
  const draw = async (id, extra = {}) => {
    await renderer.compileAsync(scene, camera); renderer.render(scene, camera);
    if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone();
    await capture(id, { time: clock.value, ...extra });
  };
  const disposeScene = () => {
    root.traverse(object => { object.geometry?.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose(); });
    root.clear(); root.position.set(0, 0, 0);
  };
  const maps = [];
  try {
    config.water.sea.enabled = false; config.water.qualityTier = 'medium';
    config.water.rainRipples.enabled = false;
    const size = 33, meters = 8;
    const field = new Float32Array(size * size * 4), flow = new Float32Array(field.length), coverage = new Uint8Array(field.length);
    for (let i = 0; i < field.length; i += 4) {
      field.set([1, 40, 2, 5], i); flow.set([0.5, 0.5, 0, 0], i); coverage.set([0, 0, 255, 255], i);
    }
    const makeMap = (data, type) => {
      const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, type);
      map.minFilter = map.magFilter = THREE.LinearFilter; map.needsUpdate = true; maps.push(map); return map;
    };
    const patterns = createWaterPatternOrigins(config.water); patterns.update(...CENTER);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(meters, meters, size - 1, size - 1), createStylizedWaterMaterial({
      config, waterFieldTexture: makeMap(field, THREE.FloatType), waterFlowTexture: makeMap(flow, THREE.FloatType),
      surfaceMaskTexture: makeMap(coverage, THREE.UnsignedByteType), waterFieldSize: size,
      waterSurfaceOrigin: uniform(0), chunkWorldSize: meters, chunkCenter: uniform(new THREE.Vector2(...CENTER)),
      surfacePatterns: patterns, time: clock, sunDirection: uniform(new THREE.Vector3(-0.3, 0.8, 0.5).normalize()),
      enableRefraction: false,
    }));
    water.rotation.x = -Math.PI / 2; water.material.side = THREE.DoubleSide; water.renderOrder = 2;
    // Production slots pad their bounds for the displaced water field. This
    // isolated plane has no slot and its undisplaced bounds sit at sea level.
    water.frustumCulled = false; root.add(water);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardNodeMaterial({ color: '#a59b7a' }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = 38; root.add(ground);
    const flora = createAquaticFloraPrototypes({ ...config.aquaticPlants,
      proceduralVariants: { lilyPad: { kind: 'lilyPad' }, floweringLilyPad: { kind: 'floweringLilyPad' } } }, config.water, { clock });
    const meshes = createInstancedRenderers({ root, renderer, partsByPrototype: flora.map(p => p.parts), capacity: 12, name: 'lake-pads' });
    const records = flora.map(() => []);
    for (let n = 0; n < 16; n++) {
      const x = (n % 4 - 1.5) * 1.35, z = (Math.floor(n / 4) - 1.5) * 1.35;
      records[n % 2].push({ matrix: matrix(x, 40 + flora[n % 2].heightOffset, z, 1.4), fade: 1,
        seed: n / 16, surfaceData: [...lakeWavePhases(CENTER[0] + x, CENTER[1] + z), 1] });
    }
    writeInstances(meshes, records); setSurfaceData(meshes, records);
    camera.position.set(5, 44, 7); camera.lookAt(0, 40, 0); camera.updateMatrixWorld();
    await draw('lake-pads'); clock.value += 4; await draw('lake-pads-moving'); clock.value -= 4;
    const offset = new THREE.Vector3(-4096, 0, 4096);
    root.position.copy(offset); camera.position.add(offset); camera.updateMatrixWorld(); await draw('lake-pads-rebased');
    camera.position.sub(offset); disposeInstancedRenderers(root, meshes);
    for (const p of flora) for (const part of p.parts) { part.geometry.dispose(); part.material.dispose(); }
    disposeScene();

    const rockGeometry = new THREE.IcosahedronGeometry(1.25, 1);
    const rockMaterial = applyRockWeathering(new THREE.MeshStandardNodeMaterial({ color: '#d6c4a6', roughness: 0.95 }), {
      settings: resolveRockWeathering(config.rocks.weathering), seaLevel: 0, localWater: true,
    });
    const rocks = createInstancedRenderers({ root, renderer, partsByPrototype: [[{
      geometry: rockGeometry, material: rockMaterial, kind: 'rock', instanceSurface: true,
    }]], capacity: 2, name: 'shore-rocks' });
    const rockRecords = [[{ matrix: matrix(-1.65, 40.45, 0), fade: 1, seed: 0.4, surfaceData: [40, 1, 0] },
      { matrix: matrix(1.65, 40.45, 0), fade: 1, seed: 0.4, surfaceData: [40, 0, 0] }]];
    writeInstances(rocks, rockRecords); setSurfaceData(rocks, rockRecords);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardNodeMaterial({ color: '#a59b7a' }));
    floor.position.y = 39.4; floor.rotation.x = -Math.PI / 2; root.add(floor);
    camera.position.set(0, 43, 8); camera.lookAt(0, 40.3, 0); camera.updateMatrixWorld();
    await draw('local-wet-rocks'); root.position.copy(offset); camera.position.add(offset); camera.updateMatrixWorld();
    await draw('local-wet-rocks-rebased'); camera.position.sub(offset);
    disposeInstancedRenderers(root, rocks); rockGeometry.dispose(); rockMaterial.dispose(); disposeScene();

    const supportHeight = x => x * 0.3 + (x > 6 ? 4 : 0);
    const candidates = [-3, 0, 3, 6].map((x, index) => ({ x, z: 0,
      height: supportHeight(x), scale: 1, prototypeIndex: 0, priority: index / 4, radius: 1.25 }));
    const fitter = Object.create(StylizedRockView.prototype);
    fitter.prototypeFootprints = [2.5]; fitter.rockWeatheringSettings = null;
    fitter.terrainView = { getCanonicalHeight: supportHeight, getCanonicalWater: () => ({ kind: 0 }) };
    let fitted = candidates;
    if (fitter.resolveGroundPlacements) {
      const iterator = fitter.resolveGroundPlacements(candidates);
      let step; do { step = iterator.next(); } while (!step.done); fitted = step.value;
    }
    const supportGeometry = new THREE.PlaneGeometry(22, 14, 88, 28);
    for (let n = 0; n < supportGeometry.attributes.position.count; n++) {
      supportGeometry.attributes.position.setZ(n, supportHeight(supportGeometry.attributes.position.getX(n)));
    }
    supportGeometry.computeVertexNormals();
    const support = new THREE.Mesh(supportGeometry, new THREE.MeshStandardNodeMaterial({ color: '#8d9671', side: THREE.DoubleSide }));
    support.rotation.x = -Math.PI / 2; root.add(support);
    const seatedGeometry = new THREE.IcosahedronGeometry(1.25, 1); seatedGeometry.translate(0, 1.25, 0);
    const seatedMaterial = new THREE.MeshStandardNodeMaterial({ color: '#aa9f8a', roughness: 0.9, flatShading: true });
    const seated = createInstancedRenderers({ root, renderer, partsByPrototype: [[{ geometry: seatedGeometry,
      material: seatedMaterial, kind: 'rock' }]], capacity: 4, name: 'fitted-boulders' });
    writeInstances(seated, [fitted.map(p => ({ matrix: matrix(p.x, p.height - 0.375, p.z), fade: 1, seed: p.priority }))]);
    camera.position.set(-6, 8, 15); camera.lookAt(1, 1.5, 0); camera.updateMatrixWorld();
    await draw('fitted-boulders', { candidates: candidates.length, fitted: fitted.length });
    root.position.copy(offset); camera.position.add(offset); camera.updateMatrixWorld();
    await draw('fitted-boulders-rebased', { fitted: fitted.length }); camera.position.sub(offset);
    disposeInstancedRenderers(root, seated); seatedGeometry.dispose(); seatedMaterial.dispose(); disposeScene();

    // Both coasts have identical heights and water tiles. Only the body's kind
    // differs, exposing height-only placement accidentally dressing lake banks.
    const origin = { x: CENTER[0], z: CENTER[1] };
    let kind = 1;
    const heightAt = x => 0.15 + (x - origin.x) * 0.075;
    const sampleWater = x => ({ kind: x < origin.x ? kind : 0, coverage: x < origin.x ? 1 : 0, surfaceHeight: 0 });
    const view = { scene, renderer, floatingOrigin: { getState: () => origin }, getCanonicalHeight: heightAt,
      getCanonicalWater: sampleWater, tileMap: { get: x => x < origin.x ? 0 : 6 },
      worldStore: { tileSize: 1, chunkSize: 16, revision: 0,
        generator: { seaLevel: 0, sampleWater }, } };
    const groundGeometry = new THREE.PlaneGeometry(16, 16, 16, 16);
    for (let i = 0; i < groundGeometry.attributes.position.count; i++) {
      const x = groundGeometry.attributes.position.getX(i) + 8;
      groundGeometry.attributes.position.setZ(i, heightAt(origin.x + x));
    }
    groundGeometry.computeVertexNormals();
    const sand = new THREE.Mesh(groundGeometry, new THREE.MeshStandardNodeMaterial({ color: '#d6be96', roughness: 0.95 }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(8, 0, -8); root.add(sand);
    const layer = { ...config.shoreLife, residentRadius: 0, perChunk: 512 };
    const revisions = { signature: () => String(kind), windowSignature: () => String(kind) };
    const detail = new StylizedGroundDetailView({ terrainView: view, config, revisionTracker: revisions,
      layerName: 'shoreLife', layerConfig: layer, priorityChannel: 73 });
    detail.appendProceduralPrototypes(createShoreLifePrototypes(layer));
    const focus = { chunkX: origin.x / 16, chunkZ: -origin.z / 16 };
    const rebuild = () => { for (const ignored of detail.iterateRebuild(focus)) void ignored; };
    camera.position.set(4, 3.5, 1); camera.lookAt(6, 0.5, -5); camera.updateMatrixWorld();
    rebuild(); const oceanInstances = detail.meshes.flat().reduce((sum, mesh) => sum + mesh.count, 0);
    await draw('beach-details', { oceanInstances });
    origin.x += 4096; // Only render-space translation changes for the rebase.
    detail.instanceAnchor.place(detail.root, origin); sand.position.x -= 4096; camera.position.x -= 4096;
    camera.updateMatrixWorld(); await draw('beach-details-rebased', { oceanInstances });
    origin.x -= 4096; sand.position.x += 4096; camera.position.x += 4096; camera.updateMatrixWorld();
    kind = 2; view.worldStore.revision++; rebuild();
    const lakeInstances = detail.meshes.flat().reduce((sum, mesh) => sum + mesh.count, 0);
    await draw('lake-bank-details', { lakeInstances }); detail.dispose(); disposeScene();

    const bytes = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const v = ((x >> 2) + (y >> 2)) % 2 ? 220 : 65; bytes.set([v, v, v, 255], (y * 256 + x) * 4);
    }
    const map = new THREE.DataTexture(bytes, 256, 256); map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(12, 12); map.generateMipmaps = true;
    map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter; map.anisotropy = 8;
    map.needsUpdate = true; maps.push(map);
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardNodeMaterial({ map, roughness: 1 }));
    surface.rotation.x = -Math.PI / 2; root.add(surface);
    camera.position.set(0, 2, 15); camera.lookAt(0, 0, -12); camera.updateMatrixWorld();
    await renderer.compileAsync(scene, camera);
    await draw('surface-filtering', { anisotropy: map.anisotropy, maximum: renderer.getMaxAnisotropy() });
  } finally { disposeScene(); maps.forEach(map => map.dispose()); filtering?.dispose(); }
}
