import * as THREE from 'three/webgpu';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PREVAILING_WIND } from '../../materials/SnowAccumulation.js';

const BANK_SEGMENTS = 24;

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Extracts a smooth, rounded volumetric snow pillow resting ONLY on true upper
 * horizontal ledges (`ny > 0.52`), tapering cleanly into the rock surface along
 * its perimeter so there are zero jagged sawtooth cutouts or slab cliffs.
 *
 * `uv.x` encodes local pillow thickness (0 at tucked rim -> 1 at crown); `uv.y = 0`.
 */
function buildUpperSnowCap(welded, { groundY, above, capThickness }) {
  const srcPos = welded.getAttribute('position');
  const srcNorm = welded.getAttribute('normal');
  const index = welded.getIndex();
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(srcPos.count / 3);
  const vertexAt = (i) => (index ? index.getX(i) : i);

  // Keep only true upward-facing upper crown & shelf triangles so vertical rock faces stay exposed.
  const keptTris = [];
  for (let t = 0; t < triCount; t += 1) {
    const a = vertexAt(t * 3);
    const b = vertexAt(t * 3 + 1);
    const c = vertexAt(t * 3 + 2);
    const nyMin = Math.min(srcNorm.getY(a), srcNorm.getY(b), srcNorm.getY(c));
    const nyAvg = (srcNorm.getY(a) + srcNorm.getY(b) + srcNorm.getY(c)) / 3;
    const yAvg = (srcPos.getY(a) + srcPos.getY(b) + srcPos.getY(c)) / 3;
    if (nyAvg > 0.56 && nyMin > 0.25 && yAvg > groundY + above * 0.42) {
      keptTris.push([a, b, c]);
    }
  }
  if (keptTris.length === 0) return null;

  const remap = new Map();
  const srcForCap = [];
  const indices = [];
  const edgeSet = new Set();

  const mapVertex = (srcIndex) => {
    const existing = remap.get(srcIndex);
    if (existing !== undefined) return existing;
    const outIdx = srcForCap.length;
    srcForCap.push(srcIndex);
    remap.set(srcIndex, outIdx);
    return outIdx;
  };

  for (const [sa, sb, sc] of keptTris) {
    const a = mapVertex(sa);
    const b = mapVertex(sb);
    const c = mapVertex(sc);
    indices.push(a, b, c);
    edgeSet.add(`${a}:${b}`);
    edgeSet.add(`${b}:${c}`);
    edgeSet.add(`${c}:${a}`);
  }

  // Detect boundary vertices & build 1-ring adjacency for smooth pillow relaxation.
  const isBoundary = new Uint8Array(srcForCap.length);
  const neighbors = Array.from({ length: srcForCap.length }, () => new Set());
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]];
    for (let e = 0; e < 3; e += 1) {
      const u = tri[e];
      const v = tri[(e + 1) % 3];
      neighbors[u].add(v);
      neighbors[v].add(u);
      if (!edgeSet.has(`${v}:${u}`)) {
        isBoundary[u] = 1;
        isBoundary[v] = 1;
      }
    }
  }

  // Smooth vertex distance-from-boundary weight (0 at perimeter -> 1 in cap core)
  // so thickness domes organically and tucks flush inside the rock at the edge.
  let edgeWeight = new Float32Array(srcForCap.length);
  for (let i = 0; i < srcForCap.length; i += 1) edgeWeight[i] = isBoundary[i] ? 0 : 1;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = new Float32Array(edgeWeight);
    for (let i = 0; i < srcForCap.length; i += 1) {
      if (isBoundary[i]) { next[i] = 0; continue; }
      let sum = edgeWeight[i];
      let count = 1;
      for (const n of neighbors[i]) { sum += edgeWeight[n]; count += 1; }
      next[i] = sum / count;
    }
    edgeWeight = next;
  }

  const positions = new Float32Array(srcForCap.length * 3);
  const uvs = new Float32Array(srcForCap.length * 2);
  const tuckDepth = Math.max(0.012, capThickness * 0.22);

  for (let i = 0; i < srcForCap.length; i += 1) {
    const s = srcForCap[i];
    const x = srcPos.getX(s);
    const y = srcPos.getY(s);
    const z = srcPos.getZ(s);
    const nx = srcNorm.getX(s);
    const ny = srcNorm.getY(s);
    const nz = srcNorm.getZ(s);

    const relY = (y - groundY) / above;
    const slopeW = smoothstep(0.45, 0.86, ny) * smoothstep(0.36, 0.62, relY);
    const w = slopeW * edgeWeight[i];
    const pillow = 0.86 + 0.24 * Math.sin(x * 3.1 + z * 2.3) * Math.cos(z * 2.5 - x * 1.9);

    if (isBoundary[i]) {
      // Tuck boundary slightly inside rock face: zero floating rim, zero sawtooth cliff.
      positions[i * 3] = x - nx * tuckDepth;
      positions[i * 3 + 1] = y - ny * tuckDepth * 0.6;
      positions[i * 3 + 2] = z - nz * tuckDepth;
      uvs[i * 2] = 0.05;
      uvs[i * 2 + 1] = 0;
    } else {
      const lift = capThickness * (0.12 + 0.88 * Math.sqrt(w)) * pillow;
      // Subtle rounded pillow loft mostly upward with gentle outward roll over ledges.
      const dx = nx * 0.28;
      const dy = Math.max(0.65, ny * 0.6 + 0.7);
      const dz = nz * 0.28;
      const len = Math.hypot(dx, dy, dz) || 1;
      positions[i * 3] = x + (dx / len) * lift;
      positions[i * 3 + 1] = y + (dy / len) * lift;
      positions[i * 3 + 2] = z + (dz / len) * lift;
      uvs[i * 2] = Math.min(1, 0.25 + 0.75 * w);
      uvs[i * 2 + 1] = 0;
    }
  }

  // One Laplacian relaxation pass on interior cap vertices rounds snow pillows organically.
  const relaxed = new Float32Array(positions);
  for (let i = 0; i < srcForCap.length; i += 1) {
    if (isBoundary[i] || neighbors[i].size === 0) continue;
    let sx = 0, sy = 0, sz = 0;
    for (const n of neighbors[i]) {
      sx += positions[n * 3];
      sy += positions[n * 3 + 1];
      sz += positions[n * 3 + 2];
    }
    const inv = 1 / neighbors[i].size;
    relaxed[i * 3] = positions[i * 3] * 0.68 + sx * inv * 0.32;
    relaxed[i * 3 + 1] = positions[i * 3 + 1] * 0.68 + sy * inv * 0.32;
    relaxed[i * 3 + 2] = positions[i * 3 + 2] * 0.68 + sz * inv * 0.32;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(relaxed, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  // Soften snow-cap normals gently toward sky-up so drifted pillows shade smoothly.
  const norm = geom.getAttribute('normal');
  for (let i = 0; i < norm.count; i += 1) {
    const bx = norm.getX(i) * 0.72;
    const by = norm.getY(i) * 0.72 + 0.28;
    const bz = norm.getZ(i) * 0.72;
    const len = Math.hypot(bx, by, bz) || 1;
    norm.setXYZ(i, bx / len, by / len, bz / len);
  }
  return geom;
}

/**
 * Builds a low, ground-hugging basal snowbank drift collar tightly contouring
 * the rock's ground line (`RockSnowCapMaterial` clamps its real-world height so
 * scaled 8x formation keystones grow natural knee-high snowbanks, never pyramids).
 *
 * `uv.x` encodes drift crest->feather weight (1..0); `uv.y = 1` marks basal drift.
 */
function buildBasalSnowbank(welded, { groundY, above, cx, cz }) {
  const pos = welded.getAttribute('position');
  const radii = new Float32Array(BANK_SEGMENTS);
  const counts = new Uint32Array(BANK_SEGMENTS);
  const yLow = groundY - above * 0.16;
  const yHigh = groundY + above * 0.28;

  let fallbackR = 0.45;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const r = Math.hypot(pos.getX(i) - cx, pos.getZ(i) - cz);
    if (r > fallbackR) fallbackR = r * 0.65;
    if (y < yLow || y > yHigh) continue;
    const angle = Math.atan2(pos.getZ(i) - cz, pos.getX(i) - cx);
    const bin = ((Math.floor(((angle + Math.PI) / (Math.PI * 2)) * BANK_SEGMENTS) % BANK_SEGMENTS) + BANK_SEGMENTS) % BANK_SEGMENTS;
    if (r > radii[bin]) radii[bin] = r;
    counts[bin] += 1;
  }

  for (let i = 0; i < BANK_SEGMENTS; i += 1) {
    if (counts[i] === 0) {
      const prev = radii[(i - 1 + BANK_SEGMENTS) % BANK_SEGMENTS];
      const next = radii[(i + 1) % BANK_SEGMENTS];
      radii[i] = Math.max(prev, next) || fallbackR;
    }
  }
  const smoothR = new Float32Array(radii);
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < BANK_SEGMENTS; i += 1) {
      const a = smoothR[(i - 1 + BANK_SEGMENTS) % BANK_SEGMENTS];
      const b = smoothR[i];
      const c = smoothR[(i + 1) % BANK_SEGMENTS];
      radii[i] = a * 0.25 + b * 0.5 + c * 0.25;
    }
    smoothR.set(radii);
  }

  const windLen = Math.hypot(PREVAILING_WIND[0], PREVAILING_WIND[1]) || 1;
  const wx = PREVAILING_WIND[0] / windLen;
  const wz = PREVAILING_WIND[1] / windLen;

  // Compact, wind-sculpted snow fillet banked snugly against the boulder foot so
  // it transitions naturally into the snowfield without forming a wide flat apron.
  const rings = [
    { rMul: 0.86, hMul: 0.96, yBias: 0, uvX: 0.94 },
    { rMul: 0.98, hMul: 0.68, yBias: 0, uvX: 1.0 },
    { rMul: 1.06, hMul: 0.22, yBias: 0, uvX: 0.48 },
    { rMul: 1.13, hMul: 0.0, yBias: -0.025, uvX: 0.0 },
  ];
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let rIdx = 0; rIdx < rings.length; rIdx += 1) {
    const ring = rings[rIdx];
    for (let s = 0; s < BANK_SEGMENTS; s += 1) {
      const angle = ((s + 0.5) / BANK_SEGMENTS) * Math.PI * 2 - Math.PI;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const facing = cosA * wx + sinA * wz;
      const lee = Math.max(0, facing);
      const scour = Math.max(0, -facing);
      const lobe = 0.78 + 0.24 * Math.sin(angle * 3 + 0.9) + 0.14 * Math.cos(angle * 5 - 0.5);
      const driftH = Math.min(0.18, Math.max(0.06, above * (0.075 + 0.06 * lee - 0.028 * scour) * lobe));
      const rReach = radii[s] * ring.rMul + (rIdx >= 2 ? driftH * (rIdx === 2 ? 0.20 : 0.42) * (0.65 + 0.60 * lee) : 0);
      const y = groundY + driftH * ring.hMul + ring.yBias;
      positions.push(cx + cosA * rReach, y, cz + sinA * rReach);
      uvs.push(ring.uvX, 1);
    }
  }

  for (let rIdx = 0; rIdx < rings.length - 1; rIdx += 1) {
    const rowA = rIdx * BANK_SEGMENTS;
    const rowB = (rIdx + 1) * BANK_SEGMENTS;
    for (let s = 0; s < BANK_SEGMENTS; s += 1) {
      const sn = (s + 1) % BANK_SEGMENTS;
      const a0 = rowA + s;
      const a1 = rowA + sn;
      const b0 = rowB + s;
      const b1 = rowB + sn;
      indices.push(a0, a1, b0, a1, b1, b0);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Generates a compact near-LOD volumetric snow-cap + wind-sculpted basal
 * snowbank geometry matched to a specific rock prototype.
 *
 * Keeps total vertex attributes to 3 (`position`, `normal`, `uv`) so instanced
 * pipelines stay comfortably inside WebGPU's 8-vertex-buffer limit.
 */
export function createRockSnowCapGeometry(rockGeometry, {
  groundY = 0,
  capThickness = null,
  basalDrift = true,
} = {}) {
  const clone = rockGeometry.clone();
  for (const name of Object.keys(clone.attributes)) {
    if (name !== 'position') clone.deleteAttribute(name);
  }
  const welded = mergeVertices(clone, 1e-4);
  clone.dispose();
  welded.computeVertexNormals();
  welded.computeBoundingBox();

  const { min, max } = welded.boundingBox;
  const above = Math.max(0.2, max.y - groundY);
  const cx = (min.x + max.x) * 0.5;
  const cz = (min.z + max.z) * 0.5;
  const thickness = capThickness ?? Math.min(0.11, Math.max(0.035, above * 0.052));

  const parts = [];
  const cap = buildUpperSnowCap(welded, { groundY, above, capThickness: thickness });
  if (cap) parts.push(cap);
  if (basalDrift) {
    const bank = buildBasalSnowbank(welded, { groundY, above, cx, cz });
    if (bank) parts.push(bank);
  }
  welded.dispose();
  if (parts.length === 0) return null;

  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (parts.length > 1) {
    for (const part of parts) part.dispose();
  }
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
