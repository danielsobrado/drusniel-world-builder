// Original Gods' End LakeFlora.js recipes.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { colored, ribbon } from './geometryPrimitives.js';

export function eelgrass(blades, segments, random) {
  const parts = [];
  for (let i = 0; i < blades; i += 1) {
    const blade = ribbon(0.035, segments, (random() - 0.5) * 0.5, (random() - 0.5) * 1.2);
    blade.scale(1, 0.75 + random() * 0.25, 1);
    blade.rotateY((i / blades) * Math.PI * 2 + random() * 0.6);
    blade.translate((random() - 0.5) * 0.12, 0, (random() - 0.5) * 0.12);
    parts.push(colored(blade, { base: '#2f4a1c', top: '#7f9a3a' }));
  }
  return mergeGeometries(parts);
}

export function waterweed(whorls, leaves) {
  const parts = [];
  const stalk = new THREE.CylinderGeometry(0.012, 0.018, 1, 4, 1, true);
  stalk.translate(0, 0.5, 0);
  parts.push(colored(stalk, { base: '#35491f', top: '#56702c' }));
  for (let w = 0; w < whorls; w += 1) {
    const y = 0.12 + (w / whorls) * 0.85;
    const length = 0.26 * (1 - (w / whorls) * 0.45);
    for (let l = 0; l < leaves; l += 1) {
      const angle = (l / leaves) * Math.PI * 2 + w * 0.5;
      const leaf = new THREE.BufferGeometry();
      const tip = [Math.cos(angle) * length, y + 0.07, Math.sin(angle) * length];
      const side = [Math.cos(angle + 1.57) * 0.02, 0, Math.sin(angle + 1.57) * 0.02];
      leaf.setAttribute('position', new THREE.Float32BufferAttribute([
        side[0], y, side[2], -side[0], y, -side[2], ...tip], 3));
      leaf.computeVertexNormals();
      parts.push(colored(leaf, { base: '#3d5a22', top: '#6f8f35' }));
    }
  }
  return mergeGeometries(parts);
}

export function pondweed(leafCount, leafSegments, random) {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.01, 0.015, 1, 4, 1, true);
  stem.translate(0, 0.5, 0);
  parts.push(colored(stem, { base: '#3b4a1d', top: '#5b6b28' }));
  for (let i = 0; i < leafCount; i += 1) {
    const y = 0.35 + (i / leafCount) * 0.6;
    const leaf = new THREE.CircleGeometry(0.17, leafSegments);
    leaf.scale(1, 0.42, 1);
    leaf.rotateX(-Math.PI / 2 + 0.5 + random() * 0.4);
    leaf.translate(0, 0, 0.1);
    leaf.rotateY((i / leafCount) * Math.PI * 2 + random() * 0.8);
    leaf.translate(0, y, 0);
    parts.push(colored(leaf, { base: '#4a6326', top: '#5f7a2c' }));
  }
  return mergeGeometries(parts);
}

export function lilyPad(segments) {
  const shape = new THREE.Shape();
  const notch = 0.35;
  shape.moveTo(0, 0);
  for (let i = 0; i <= segments; i += 1) {
    const angle = notch / 2 + (i / segments) * (Math.PI * 2 - notch);
    shape.lineTo(Math.cos(angle), Math.sin(angle));
  }
  shape.lineTo(0, 0);
  const pad = new THREE.ShapeGeometry(shape, 1);
  pad.rotateX(-Math.PI / 2);
  return colored(pad, { base: '#2e5a1e', top: '#2e5a1e' });
}

export function flower(petals) {
  const parts = [];
  for (let ring = 0; ring < 2; ring += 1) {
    for (let p = 0; p < petals; p += 1) {
      const angle = (p / petals) * Math.PI * 2 + ring * (Math.PI / petals);
      const length = ring ? 0.3 : 0.42;
      const petal = new THREE.BufferGeometry();
      const lift = ring ? 0.26 : 0.13;
      petal.setAttribute('position', new THREE.Float32BufferAttribute([
        Math.cos(angle + 0.25) * 0.05, 0.04, Math.sin(angle + 0.25) * 0.05,
        Math.cos(angle - 0.25) * 0.05, 0.04, Math.sin(angle - 0.25) * 0.05,
        Math.cos(angle) * length, 0.04 + lift, Math.sin(angle) * length], 3));
      petal.computeVertexNormals();
      parts.push(colored(petal, ring ? '#f7e9ef' : '#f2c9d8'));
    }
  }
  const heart = new THREE.ConeGeometry(0.05, 0.08, 5);
  heart.translate(0, 0.08, 0);
  parts.push(colored(heart, '#e8c33a'));
  return mergeGeometries(parts);
}
