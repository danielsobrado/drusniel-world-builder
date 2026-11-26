import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { OrganicMeshBuilder } from '../src/editor/stylized/flora/floraMeshPrimitives.js';

/** Signed volume of the builder's raw triangles: positive when every face winds outward. */
function signedVolume(builder) {
  const p = builder.positions;
  let volume = 0;
  for (let i = 0; i < builder.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => builder.indices[i + k] * 3);
    volume += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return volume;
}

/** Every triangle faces away from the blob's centre. */
function allFacesOutward(builder, center) {
  const p = builder.positions;
  const v = i => new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  for (let i = 0; i < builder.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => v(builder.indices[i + k]));
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const centroid = a.add(b).add(c).divideScalar(3).sub(new THREE.Vector3(...center));
    if (normal.dot(centroid) <= 0) return false;
  }
  return true;
}

const color = new THREE.Color('#5d4d3e');

test('a blob is wound outward, caps included, so FrontSide stumps do not show their inside', () => {
  const builder = new OrganicMeshBuilder();
  const center = [0, 0.08, 0];
  builder.addBlob({ center, radiusX: 0.26, radiusY: 0.12, radiusZ: 0.24, rings: 4, sides: 10, ribAmp: 0, colorBase: color });
  const ellipsoid = (4 / 3) * Math.PI * 0.26 * 0.12 * 0.24;
  const volume = signedVolume(builder);
  assert.ok(volume > ellipsoid * 0.5 && volume < ellipsoid, `signed volume ${volume} vs ellipsoid ${ellipsoid}`);
  assert.ok(allFacesOutward(builder, center));
});

test('a root collar (a blob) is wound outward too', () => {
  const builder = new OrganicMeshBuilder();
  builder.addRootCollar({ radius: 0.34, height: 0.08, sides: 10, colorBase: color });
  // The collar's blob sits a quarter of its height below the given centre.
  assert.ok(allFacesOutward(builder, [0, -0.02, 0]));
});
