import * as THREE from 'three/webgpu';
import { ShapeMesh, shapeRandom } from './shapes/ShapeMesh.js';
import { shapeGroundExcluded } from './shapes/ShapeGrounding.js';

/** Soft, asymmetric crowns retain smooth normals after bounded radial deformation. */
export function stageCrownGeometry(radius, seed, conifer = false) {
  const geometry = conifer ? new THREE.ConeGeometry(radius, 1.45, 24, 8) : new THREE.IcosahedronGeometry(radius, 3);
  const positions = geometry.getAttribute('position');
  const phase = shapeRandom(seed, 'stage', 'crown', 'phase') * Math.PI * 2;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const noise = 1 + Math.sin(x * 2.7 + phase) * Math.cos(z * 3.1 - y * 1.2) * 0.075 + Math.sin(angle * 7 + y * 4 + phase) * 0.045;
    positions.setXYZ(i, x * noise, y * (conifer ? 1 : noise), z * noise);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createStageGrass(heightAt) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, side: THREE.DoubleSide,
  }));
  mesh.name = 'workshop-contact-grass'; mesh.receiveShadow = true;
  let key;
  return {
    mesh,
    update(plans = []) {
      const masks = plans.flatMap((p) => p.ground?.masks ?? []), next = JSON.stringify(masks);
      if (key === next) return;
      key = next;
      const batch = new ShapeMesh();
      for (let i = 0; i < 2400; i++) {
        const random = (role) => shapeRandom(4817, 'stage-grass', role, i);
        const x = (random('x') - 0.5) * 29, z = (random('z') - 0.5) * 29;
        if (shapeGroundExcluded([x, z], masks)) continue;
        const base = heightAt(x, z), h = 0.08 + random('height') * 0.12, angle = random('angle') * Math.PI * 2;
        for (let blade = 0; blade < 3; blade++) {
          const a = angle + blade * 2.1, w = 0.017;
          const left = [x - Math.cos(a) * w, base, z - Math.sin(a) * w];
          const right = [x + Math.cos(a) * w, base, z + Math.sin(a) * w];
          const middle = [x + Math.sin(a) * h * 0.22, base + h * 0.55, z - Math.cos(a) * h * 0.22];
          const tip = [x + Math.sin(a) * h * 0.45, base + h, z - Math.cos(a) * h * 0.45];
          const tint = [0.16 + random('tint') * 0.06, 0.29 + random('tint') * 0.08, 0.08];
          batch.triangle(left, right, middle, tint); batch.triangle(left, middle, tip, tint);
        }
      }
      const geometry = batch.geometry() ?? new THREE.BufferGeometry();
      mesh.geometry.dispose(); mesh.geometry = geometry;
    },
  };
}
