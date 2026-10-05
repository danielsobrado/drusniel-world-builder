// Ported from Gods' End LakeFlora.js; original authored vertex colours.
import * as THREE from 'three/webgpu';

export function colored(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
  const colors = new Float32Array(g.attributes.position.count * 3);
  const top = new THREE.Color(color.top ?? color);
  const base = new THREE.Color(color.base ?? color);
  const scratch = new THREE.Color();
  for (let i = 0; i < g.attributes.position.count; i += 1) {
    scratch.copy(base).lerp(top, THREE.MathUtils.clamp(g.attributes.position.getY(i), 0, 1));
    colors.set([scratch.r, scratch.g, scratch.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function ribbon(width, segments, lean, twist) {
  const positions = [];
  const point = (t, side) => {
    const bend = lean * t * t;
    const w = width * (1 - t * 0.7) * side;
    const angle = twist * t;
    return [Math.cos(angle) * w + bend, t, Math.sin(angle) * w];
  };
  for (let s = 0; s < segments; s += 1) {
    const a = s / segments, b = (s + 1) / segments;
    const [p0, p1, p2, p3] = [point(a, -1), point(a, 1), point(b, -1), point(b, 1)];
    positions.push(...p0, ...p1, ...p2, ...p2, ...p1, ...p3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
