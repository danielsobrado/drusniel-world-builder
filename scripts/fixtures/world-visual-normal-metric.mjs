import * as THREE from 'three/webgpu';
import { float, positionWorld, vec4 } from 'three/tsl';
import { createTerrainSurfaceNormal } from '/src/editor/materials/TerrainMaterialSurfaceGradientNodes.js';

/** An analytic ramp has one physical normal at every projected pixel size. */
export async function runTerrainNormalMetric({ scene, camera, draw, state }) {
  const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), zoom: camera.zoom };
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const normal = createTerrainSurfaceNormal({ encodedNormal: vec4(0),
    detailHeight: positionWorld.x.mul(.12).add(positionWorld.z.mul(.06)), detailStrength: float(1) });
  material.fragmentNode = vec4(normal.mul(.5).add(.5), 1);
  const geometry = new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material); scene.add(mesh);
  camera.position.set(0, 20, 12); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const expected = new THREE.Vector3(-.12, 1, -.06).normalize().transformDirection(camera.matrixWorldInverse).toArray();
  try {
    for (const zoom of [.5, 1, 2]) {
      camera.zoom = zoom; camera.updateProjectionMatrix();
      const id = `terrain-normal-metric-${zoom}`;
      const pixels = await draw(id, { zoom, expected });
      const offset = (300 * 800 + 400) * 4;
      const actual = Array.from(pixels.subarray(offset, offset + 3), value => value * 2 - 1);
      const error = Math.max(...actual.map((value, i) => Math.abs(value - expected[i])));
      state.report.checks.push({ id, expected, actual, error, passed: error < .002 });
    }
  } finally {
    scene.remove(mesh); geometry.dispose(); material.dispose();
    camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion); camera.zoom = saved.zoom;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }
}
