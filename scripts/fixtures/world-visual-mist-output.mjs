import * as THREE from 'three/webgpu';
import { float, vec3 } from 'three/tsl';
import { applyValleyFogOutput } from '/src/editor/stylized/mist/ValleyFogOutput.js';

/** The same air contributes the same radiance over dark and bright surfaces.
 * An albedo blend fails this relation as soon as surface illumination changes.
 */
export async function runMistOutputContract({ scene, camera, sun, fill, draw, state }) {
  const plain = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide });
  plain.colorNode = vec3(.2, .3, .1);
  const misted = plain.clone(), fogColor = [.12, .18, .24], amount = .35;
  applyValleyFogOutput(misted, { color: vec3(...fogColor), amount: float(amount) });
  const geometry = new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, plain); scene.add(mesh);
  const lighting = [sun.intensity, fill.intensity];
  const pose = [camera.position.clone(), camera.quaternion.clone()];
  camera.position.set(0, 8, 12); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  try {
    for (const intensity of [0, 1, 4]) {
      sun.intensity = intensity; fill.intensity = intensity * .4;
      const samples = [];
      for (const [id, material] of [['plain', plain], ['mist', misted]]) {
        mesh.material = material;
        const pixels = await draw(`mist-output-${intensity}-${id}`, { intensity, amount, fogColor });
        samples.push(Array.from(pixels.subarray((300 * 800 + 400) * 4, (300 * 800 + 400) * 4 + 3)));
      }
      const expected = samples[0].map((value, i) => value * (1 - amount) + fogColor[i] * amount);
      const error = Math.max(...expected.map((value, i) => Math.abs(value - samples[1][i])));
      state.report.checks.push({ id: `mist-radiance-independent-of-light-${intensity}`, expected,
        actual: samples[1], error, passed: error < .00001 });
    }
  } finally {
    scene.remove(mesh); geometry.dispose(); plain.dispose(); misted.dispose();
    [sun.intensity, fill.intensity] = lighting;
    camera.position.copy(pose[0]); camera.quaternion.copy(pose[1]); camera.updateMatrixWorld();
  }
}
