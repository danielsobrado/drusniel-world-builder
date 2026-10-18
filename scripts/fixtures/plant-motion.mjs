import * as THREE from 'three/webgpu';
import { vec4 } from 'three/tsl';
import { applyPlantMotion } from '/src/editor/stylized/PlantMotionNodes.js';
import { resolvePlantMotion, rotatePlantVector } from '/src/editor/stylized/PlantMotionProfiles.js';
import { createInstancedRenderers, writeInstances } from '/src/editor/stylized/lod/StylizedLodRuntime.js';
import { worldWindUniforms } from '/src/editor/weather/wind/worldWindState.js';

const backend = new URLSearchParams(location.search).get('backend') ?? 'webgpu';
const report = { backend, checks: [], captures: [], done: false, passed: false };
const state = window.__plantMotionFixture = { report, pendingCapture: null,
  continue: () => state.resume?.() };
let renderer;
try {
  renderer = new THREE.WebGPURenderer({ forceWebGL: backend === 'webgl', antialias: false });
  renderer.setSize(384, 384); await renderer.init(); document.body.appendChild(renderer.domElement);
  const target = new THREE.RenderTarget(384, 384);
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-3, 3, 3, -3, .1, 30);
  camera.position.set(2, 1, 12); camera.lookAt(2, 1, 0); camera.updateMatrixWorld();
  worldWindUniforms.windowCenter.value.set(-1e8, -1e8);
  worldWindUniforms.windowCenterCanonical.value.set(-1e8, -1e8);
  worldWindUniforms.prevailing.value.set(1, 0);
  worldWindUniforms.prevailingStrength.value = worldWindUniforms.referenceStrength.value = .18;
  const pixels = async () => {
    renderer.setRenderTarget(target); await renderer.renderAsync(scene, camera);
    const data = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 384, 384);
    renderer.setRenderTarget(null); await renderer.renderAsync(scene, camera); return data;
  };
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  for (const profile of ['broadleaf', 'woody-shrub', 'flexible-stem', 'fern-frond']) {
    for (const [index, [yaw, scale, offset]] of [[0, [0, [1, 1, 1], 0]], [1, [.8, [.6, 1.7, .9], 0]],
      [2, [.8, [.6, 1.7, .9], 1000000]]]) {
      const geometry = new THREE.PlaneGeometry(1.5, 1.8); geometry.translate(0, 1, 0);
      const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
      material.fragmentNode = vec4(1, 1, 1, 1);
      applyPlantMotion(material, { wind: { strength: 0, lean: .6 }, height: 2, profile });
      const root = new THREE.Group(); scene.add(root);
      worldWindUniforms.windowCenterCanonical.value.set(-1e8 + offset, -1e8);
      const renderers = createInstancedRenderers({ root, partsByPrototype: [[{ geometry, material }]],
        capacity: 1, name: 'fixture-plant', renderer });
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(2 + offset, 0, 0),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(...scale));
      writeInstances(renderers, [[{ matrix, fade: 1, seed: .4 }]], { x: offset, z: 0 });
      const actual = await pixels(); root.visible = false;
      const expectedGeometry = geometry.clone().applyMatrix4(matrix.clone().setPosition(2, 0, 0));
      const positions = expectedGeometry.attributes.position, normals = expectedGeometry.attributes.normal;
      const motion = resolvePlantMotion(profile), angle = Math.min(.6 * 2 * motion.give, motion.maximumAngle);
      const before = [];
      for (let i = 0; i < positions.count; i++) {
        const v = [positions.getX(i) - 2, positions.getY(i), positions.getZ(i)]; before.push(v);
        const rotated = rotatePlantVector(v, [1, 0], angle);
        positions.setXYZ(i, rotated[0] + 2, rotated[1], rotated[2]);
        const n = rotatePlantVector([normals.getX(i), normals.getY(i), normals.getZ(i)], [1, 0], angle);
        normals.setXYZ(i, ...n);
      }
      const reference = new THREE.Mesh(expectedGeometry, new THREE.MeshBasicNodeMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
      scene.add(reference); const expected = await pixels();
      let intersection = 0, union = 0;
      for (let p = 0; p < actual.length; p += 4) {
        const a = actual[p] > 128, b = expected[p] > 128;
        if (a || b) union++; if (a && b) intersection++;
      }
      const ratio = intersection / Math.max(1, union);
      report.checks.push({ id: `${profile}-${index}-production-silhouette`, ratio, pixels: union,
        passed: union > 1000 && ratio > .995 });
      const a = [positions.getX(0) - 2, positions.getY(0), positions.getZ(0)];
      const b = [positions.getX(1) - 2, positions.getY(1), positions.getZ(1)];
      report.checks.push({ id: `${profile}-${index}-rigid-leaf`,
        passed: Math.abs(distance(a, b) / distance(before[0], before[1]) - 1) < .00001 });
      scene.remove(reference); root.visible = true; await pixels();
      const id = `${profile}-${index}`; state.pendingCapture = id;
      await new Promise(resolve => { state.resume = resolve; }); state.pendingCapture = null;
      scene.remove(root); expectedGeometry.dispose(); reference.material.dispose();
      for (const mesh of renderers.flat()) { mesh.geometry.dispose(); mesh.material.dispose(); }
      geometry.dispose(); material.dispose();
    }
  }
  target.dispose(); report.passed = report.checks.every(c => c.passed);
} catch (error) { report.failure = error.stack; }
finally { report.done = true; }
