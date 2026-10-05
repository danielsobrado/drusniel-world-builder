import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { aquaticRandom } from '../aquatic/aquaticGeometry.js';

function valueNoise3(random) {
  const table = Array.from({ length: 256 }, () => random() * 2 - 1);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const at = (x, y, z) => table[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
    const lerp = THREE.MathUtils.lerp;
    const plane = (k) => lerp(
      lerp(at(ix, iy, iz + k), at(ix + 1, iy, iz + k), fx),
      lerp(at(ix, iy + 1, iz + k), at(ix + 1, iy + 1, iz + k), fx),
      fy,
    );
    return lerp(plane(0), plane(1), fz);
  };
}

function boulder(detail, random) {
  const noise = valueNoise3(random);
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  const squash = 0.5 + random() * 0.25;
  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i);
    const radius = 1 + noise(v.x * 1.6 + 3, v.y * 1.6, v.z * 1.6) * 0.28
      + noise(v.x * 4.1, v.y * 4.1 + 7, v.z * 4.1) * 0.08;
    v.multiplyScalar(radius);
    v.y *= squash;
    // Settled into the sand: a flattened underside.
    v.y = Math.max(v.y, -0.18);
    position.setXYZ(i, v.x, v.y + 0.12, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createSeabedRockGeometry(variant = 0, lod = 'near') {
  if (!Number.isInteger(variant) || variant < 0 || variant > 2) throw new Error('Unknown seabed boulder variant.');
  return boulder(lod === 'near' ? 2 : 1, aquaticRandom(61241 + variant * 17));
}
