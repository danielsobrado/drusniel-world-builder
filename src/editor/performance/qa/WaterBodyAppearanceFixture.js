import * as THREE from 'three/webgpu';
import { float, positionWorld, uniform, uv, vec2, vec3 } from 'three/tsl';
import { loadEditorConfig } from '../../../config/loadEditorConfig.js';
import { WaterReflectionController } from '../../../render/reflections/WaterReflectionController.js';
import { createStylizedWaterMaterial } from '../../stylized/StylizedWaterMaterial.js';
import { createWaterPatternOrigins } from '../../stylized/WaterPatternOrigins.js';
import { createCoastPatternOrigins, createCoastSwashNodes } from '../../stylized/CoastSwashShading.js';
import { createCoastSandNodes } from '../../stylized/CoastSandShading.js';
import { seaSwellPhaseOrigin } from '../../water/SeaSwell.js';
import { configureSea, updateSeaState } from '../../water/seaState.js';
import { UnderwaterCausticsPostProcess } from '../../water/UnderwaterCausticsPostProcess.js';

/** Production water and coastal response over a fixed sand shelf, at canonical planet scale. */
export async function runWaterBodyAppearanceFixture(renderer, capture) {
  const config = structuredClone(loadEditorConfig().stylizedSurface);
  config.water.rainRipples.enabled = false;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#81a8b4');
  const camera = new THREE.PerspectiveCamera(52, 4 / 3, 0.1, 400);
  const meters = 96, size = 97, center = [-4226432, 278528];
  const clock = uniform(12.3), level = uniform(0), oceanMask = uniform(1), owned = [];
  const patterns = createWaterPatternOrigins(config.water); patterns.update(...center);
  const coast = createCoastPatternOrigins(); coast.update(...center);
  const geometry = new THREE.PlaneGeometry(meters, meters, size - 1, size - 1);
  const bed = geometry.clone();
  const field = new Float32Array(size * size * 4), flow = new Float32Array(field.length);
  const coverage = new Uint8Array(field.length);
  const makeTexture = (data, type) => {
    const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, type);
    map.minFilter = map.magFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
  };
  const maps = [makeTexture(field, THREE.FloatType), makeTexture(flow, THREE.FloatType),
    makeTexture(coverage, THREE.UnsignedByteType)];
  const updateBed = (height, deep = false) => {
    for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
      const x = col - meters / 2, index = row * size + col;
      const depth = deep ? 28 : Math.max(0, x * 0.18);
      bed.attributes.position.setZ(index, height + (deep ? -28 : -x * 0.18));
      const pixel = ((size - 1 - row) * size + col) * 4;
      field.set([deep || x > 0 ? 1 : 0, height, depth, deep ? 96 : Math.max(0, x)], pixel);
      flow.set([0.5, 0.5, 0, 0], pixel);
      coverage.set([0, 0, deep || x > 0 ? 255 : 0, 255], pixel);
    }
    bed.attributes.position.needsUpdate = true; bed.computeVertexNormals();
    maps.forEach(map => { map.needsUpdate = true; });
  };
  const sand = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, side: THREE.DoubleSide });
  const localXZ = vec2(uv().x.sub(0.5).mul(meters), float(0.5).sub(uv().y).mul(meters));
  const swash = createCoastSwashNodes({ localXZ, patternOrigins: coast, groundHeight: positionWorld.y,
    config: config.water.coast, clock, oceanMask });
  const grain = localXZ.x.mul(5.1).sin().mul(localXZ.y.mul(4.7).sin()).mul(0.04).add(1);
  const sandColor = new THREE.Color('#d6be96');
  const coastSand = config.water.coast.sand && createCoastSandNodes({ localXZ, patterns: coast,
    groundHeight: positionWorld.y, sandMask: float(1), waterCoverage: float(1), config: config.water.coast.sand, clock, oceanMask });
  const base = coastSand ? coastSand.apply(vec3(sandColor.r, sandColor.g, sandColor.b).mul(grain), float(0.95))
    : { color: vec3(sandColor.r, sandColor.g, sandColor.b).mul(grain), roughness: float(0.95) };
  const response = swash.apply(base.color, base.roughness);
  sand.colorNode = response.color; sand.roughnessNode = response.roughness;
  const ground = new THREE.Mesh(bed, sand); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  scene.add(new THREE.HemisphereLight('#d9edff', '#716046', 2.3));
  const sun = new THREE.DirectionalLight('#fff2d8', 2.2); sun.position.set(-20, 50, 35); scene.add(sun);
  scene.add(sun.target);
  const mesh = new THREE.Mesh(geometry); mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 2; scene.add(mesh);
  let height = 0;
  const view = { scene, renderer, worldStore: { generator: {}, revision: 0 }, chunkWorldSize: meters,
    floatingOrigin: { getState: () => ({ x: 0, z: 0 }) },
    getCanonicalWater: () => ({ kind: height ? 2 : 1, coverage: 1, surfaceHeight: height }) };
  const surface = { waterSlots: [{ mesh, hasWaterCoverage: true,
    terrainSlot: { descriptor: { centerWorldX: 0, centerWorldZ: 0 } } }], detailViews: [] };
  const reflections = new WaterReflectionController(view, { resolution: 128, intervalMs: 250, reachMeters: 96, planar: true });
  const origin = { x: center[0], z: center[1] };
  const underwater = new UnderwaterCausticsPostProcess({ renderer, scene, config: config.water.projectedCaustics,
    optics: loadEditorConfig().player.water.underwater.optics, clock,
    floatingOrigin: { getState: () => origin } });
  const build = reflective => {
    const material = createStylizedWaterMaterial({ config, surfaceMaskTexture: maps[2], waterFieldTexture: maps[0],
      waterFlowTexture: maps[1], waterFieldSize: size, waterSurfaceOrigin: level,
      chunkCenter: uniform(new THREE.Vector2(...center)), chunkWorldSize: meters, time: clock,
      surfacePatterns: patterns, seaPhaseOrigin: seaSwellPhaseOrigin(...center).map(phase => uniform(phase)),
      sunDirection: uniform(new THREE.Vector3(-0.4, 0.8, 0.3).normalize()), reflections: reflective ? reflections : null });
    material.side = THREE.DoubleSide; owned.push(material); return material;
  };
  const draw = async id => {
    updateSeaState({ timeSeconds: clock.value, seaLevel: 0, storm: seaStorm, rain: 0 });
    await renderer.compileAsync(scene, camera); renderer.render(scene, camera);
    if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone();
    await capture(id, { time: clock.value, planarValid: reflections.planarValid.value });
  };
  let seaStorm = 0;
  try {
    configureSea(config.water.sea); updateBed(0);
    camera.position.set(-9, 13, 35); camera.lookAt(12, 0, -7); camera.updateMatrixWorld();
    mesh.material = build(false); await draw('beach');
    clock.value += 0.8; await draw('beach-moving'); clock.value -= 0.8;
    const offset = new THREE.Vector3(-4096, 0, 4096);
    ground.position.copy(offset); mesh.position.copy(offset); camera.position.add(offset); camera.updateMatrixWorld();
    await draw('beach-rebased'); ground.position.set(0, 0, 0); mesh.position.set(0, 0, 0); camera.position.sub(offset);
    updateBed(0, true); camera.position.set(4, 3, 38); camera.lookAt(4, 0, -30); camera.updateMatrixWorld();
    await draw('deep-sea'); seaStorm = 1; await draw('deep-sea-storm'); seaStorm = 0;
    height = 4; oceanMask.value = 0; updateBed(height); camera.position.set(5, 6, 35); camera.lookAt(13, height, -22); camera.updateMatrixWorld();
    // Distinct colored shoreline objects expose whether production lake water samples its planar capture.
    for (const [x, z, color] of [[8, -24, '#254e29'], [16, -28, '#375f2e'], [24, -20, '#763d24']]) {
      const island = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 12), new THREE.MeshStandardNodeMaterial({ color: '#baa77d' }));
      island.scale.set(1, 0.25, 1); island.position.set(x, height, z); scene.add(island);
      const tree = new THREE.Mesh(new THREE.ConeGeometry(2.5, 7, 10), new THREE.MeshStandardNodeMaterial({ color }));
      tree.position.set(x, height + 4, z); scene.add(tree);
    }
    mesh.material = build(true); await draw('lake-reflections-off');
    reflections.prewarm(camera, surface);
    reflections.planarValid.value = 0; await draw('lake-planar-off');
    reflections.planarValid.value = 1; await draw('lake');
    clock.value += 2.4; await draw('lake-moving');
    height = 0; oceanMask.value = 1; updateBed(0); mesh.material = build(false);
    underwater.update({ blend: 1, surfaceHeight: 0, waterKind: 1 });
    const submerged = async id => {
      updateSeaState({ timeSeconds: clock.value, seaLevel: 0, storm: 0, rain: 0 });
      underwater.render(camera);
      if (renderer.backend.isWebGPUBackend) await renderer.backend.device.queue.onSubmittedWorkDone();
      await capture(id, { time: clock.value, eyeDepth: underwater.opticsState.depth.value });
    };
    camera.position.set(12, -1.1, 25); camera.lookAt(20, -3, -5); camera.updateMatrixWorld();
    underwater.prewarm(camera); await submerged('underwater-shelf');
    camera.lookAt(12, 12, 0); camera.updateMatrixWorld(); await submerged('underwater-snell');
    updateBed(0, true); camera.position.set(8, -9, 26); camera.lookAt(16, -10, -8); camera.updateMatrixWorld();
    await submerged('underwater-deep');
    scene.position.copy(offset); camera.position.add(offset); camera.updateMatrixWorld();
    origin.x -= offset.x; origin.z -= offset.z;
    await submerged('underwater-rebased');
  } finally {
    underwater.dispose();
    reflections.dispose(); owned.forEach(material => material.dispose()); maps.forEach(map => map.dispose());
    scene.traverse(object => { if (object !== mesh) { object.geometry?.dispose(); object.material?.dispose(); } });
    geometry.dispose(); configureSea(null);
  }
}
