import * as THREE from 'three/webgpu';

const SMOOTH_MIN_DOT = 0.15;

export function smoothstep(edge0, edge1, x) {
  if (edge1 === edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function countGeometryTriangles(geometry) {
  if (!geometry) return 0;
  if (geometry.index) return Math.floor(geometry.index.count / 3);
  const pos = geometry.attributes?.position;
  return pos ? Math.floor(pos.count / 3) : 0;
}

function posKey(x, y, z) {
  return `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
}

function edgeKey(a, b) {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

function triAreaSq(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const cxp = uy * vz - uz * vy;
  const cyp = uz * vx - ux * vz;
  const czp = ux * vy - uy * vx;
  return (cxp * cxp + cyp * cyp + czp * czp) * 0.25;
}

function noise3(x, y, z, seed = 1, freq = 9.0) {
  const s = seed * 0.173;
  const n1 = Math.sin(x * freq + y * (freq * 0.67) + z * (freq * 0.53) + s)
    * Math.cos(y * (freq * 1.13) - z * (freq * 0.89) + s * 0.6);
  const n2 = Math.sin(x * (freq * 2.11) - z * (freq * 1.77) + y * (freq * 1.37) + s * 1.4) * 0.45;
  const n3 = Math.cos(y * (freq * 3.43) + x * (freq * 2.91) + z * (freq * 2.57) - s * 1.1) * 0.22;
  return (n1 + n2 + n3) / 1.67;
}

/**
 * Conformal 1->4 / 1->2 / 1->3 midpoint subdivision keeping every shared geometric edge
 * watermark-matched across indexed or non-indexed triangles (zero cracks / T-junctions).
 */
export function subdivideGeometryRedGreen(geometry, targetTris, { maxTris = 32000 } = {}) {
  const posAttr = geometry.attributes?.position;
  if (!posAttr || posAttr.count < 3) return geometry;

  const isIndexed = Boolean(geometry.index);
  const attrNames = Object.keys(geometry.attributes).filter((k) => k !== 'normal');
  const currentTris = countGeometryTriangles(geometry);
  if (currentTris <= 0 || currentTris >= targetTris) return geometry;

  // Extract triangle index list (converting non-indexed to temporary sequential indices).
  let indices = isIndexed
    ? Array.from(geometry.index.array)
    : Array.from({ length: posAttr.count }, (_, i) => i);

  const arrays = {};
  const itemSizes = {};
  for (const name of attrNames) {
    const a = geometry.attributes[name];
    arrays[name] = Array.from(a.array);
    itemSizes[name] = a.itemSize;
  }

  let triCount = Math.floor(indices.length / 3);
  let guard = 0;

  while (triCount < targetTris && triCount < maxTris && guard < 6) {
    guard += 1;
    const pos = arrays.position;
    const vCount = pos.length / 3;
    const pKeys = new Array(vCount);
    for (let v = 0; v < vCount; v += 1) {
      const p3 = v * 3;
      pKeys[v] = posKey(pos[p3], pos[p3 + 1], pos[p3 + 2]);
    }

    let splitMask;
    if (triCount * 4 <= maxTris) {
      splitMask = new Uint8Array(triCount);
      splitMask.fill(1);
    } else {
      const ranked = new Array(triCount);
      for (let t = 0; t < triCount; t += 1) {
        const i0 = indices[t * 3] * 3;
        const i1 = indices[t * 3 + 1] * 3;
        const i2 = indices[t * 3 + 2] * 3;
        ranked[t] = {
          t,
          area: triAreaSq(
            pos[i0], pos[i0 + 1], pos[i0 + 2],
            pos[i1], pos[i1 + 1], pos[i1 + 2],
            pos[i2], pos[i2 + 1], pos[i2 + 2],
          ),
        };
      }
      ranked.sort((a, b) => b.area - a.area);
      const needed = targetTris - triCount;
      const pick = Math.max(1, Math.min(triCount, Math.ceil(needed / 1.9) + 64));
      splitMask = new Uint8Array(triCount);
      for (let k = 0; k < pick; k += 1) splitMask[ranked[k].t] = 1;
    }

    // Track marked edges by position key so non-welded faces share split boundaries identically.
    const markedEdges = new Set();
    for (let t = 0; t < triCount; t += 1) {
      if (!splitMask[t]) continue;
      const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
      markedEdges.add(edgeKey(pKeys[a], pKeys[b]));
      markedEdges.add(edgeKey(pKeys[b], pKeys[c]));
      markedEdges.add(edgeKey(pKeys[c], pKeys[a]));
    }

    // Key midpoints by vertex-index pair (keeps distinct hard/UV/color values per seam while sharing XYZ).
    const midCache = new Map();
    const getMid = (va, vb) => {
      const key = va <= vb ? `${va}_${vb}` : `${vb}_${va}`;
      let idx = midCache.get(key);
      if (idx !== undefined) return idx;
      idx = arrays.position.length / 3;
      for (const name of attrNames) {
        const arr = arrays[name];
        const sz = itemSizes[name];
        const aOff = va * sz;
        const bOff = vb * sz;
        for (let k = 0; k < sz; k += 1) {
          arr.push((arr[aOff + k] + arr[bOff + k]) * 0.5);
        }
      }
      midCache.set(key, idx);
      return idx;
    };

    const nextIndices = [];
    for (let t = 0; t < triCount; t += 1) {
      const v0 = indices[t * 3], v1 = indices[t * 3 + 1], v2 = indices[t * 3 + 2];
      const m01 = markedEdges.has(edgeKey(pKeys[v0], pKeys[v1]));
      const m12 = markedEdges.has(edgeKey(pKeys[v1], pKeys[v2]));
      const m20 = markedEdges.has(edgeKey(pKeys[v2], pKeys[v0]));
      const count = (m01 ? 1 : 0) + (m12 ? 1 : 0) + (m20 ? 1 : 0);

      if (count === 0) {
        nextIndices.push(v0, v1, v2);
      } else if (count === 3) {
        const mA = getMid(v0, v1);
        const mB = getMid(v1, v2);
        const mC = getMid(v2, v0);
        nextIndices.push(
          v0, mA, mC,
          mA, v1, mB,
          mC, mB, v2,
          mA, mB, mC,
        );
      } else if (count === 1) {
        const [a, b, c] = m01 ? [v0, v1, v2] : m12 ? [v1, v2, v0] : [v2, v0, v1];
        const m = getMid(a, b);
        nextIndices.push(a, m, c, m, b, c);
      } else {
        const [a, b, c] = !m12 ? [v0, v1, v2] : !m20 ? [v1, v2, v0] : [v2, v0, v1];
        const mab = getMid(a, b);
        const mac = getMid(a, c);
        nextIndices.push(a, mab, mac, mab, b, c, mab, c, mac);
      }
    }

    indices = nextIndices;
    triCount = Math.floor(indices.length / 3);
  }

  let out;
  if (isIndexed) {
    out = new THREE.BufferGeometry();
    for (const name of attrNames) {
      out.setAttribute(name, new THREE.Float32BufferAttribute(arrays[name], itemSizes[name]));
    }
    const use32 = (arrays.position.length / 3) > 65535;
    out.setIndex(use32 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
  } else {
    // Expand back to non-indexed buffer so LocationBuilder's pipeline gets consistent non-indexed geometry.
    const triVerts = indices.length;
    out = new THREE.BufferGeometry();
    for (const name of attrNames) {
      const src = arrays[name];
      const sz = itemSizes[name];
      const dst = new Float32Array(triVerts * sz);
      for (let i = 0; i < triVerts; i += 1) {
        const srcOff = indices[i] * sz;
        const dstOff = i * sz;
        for (let k = 0; k < sz; k += 1) dst[dstOff + k] = src[srcOff + k];
      }
      out.setAttribute(name, new THREE.BufferAttribute(dst, sz));
    }
  }
  out.computeVertexNormals();
  return out;
}

/**
 * Adds seamless quantized-position micro-relief along averaged vertex normals so flat faces
 * and sharp box corners gain organic/hewn surface texture without ever cracking seams.
 */
export function sculptPositionKeyedRelief(geometry, {
  amplitude = 0.008,
  freq = 9.0,
  seed = 1,
  groundY = 0,
  groundFade = true,
  weightFn = null,
} = {}) {
  const posAttr = geometry.attributes?.position;
  if (!posAttr || amplitude <= 1e-6) return geometry;

  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const nAttr = geometry.attributes.normal;
  const vCount = posAttr.count;

  const accumN = new Map();
  for (let i = 0; i < vCount; i += 1) {
    const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
    const key = posKey(x, y, z);
    let rec = accumN.get(key);
    if (!rec) {
      rec = [0, 0, 0, x, y, z];
      accumN.set(key, rec);
    }
    rec[0] += nAttr.getX(i);
    rec[1] += nAttr.getY(i);
    rec[2] += nAttr.getZ(i);
  }

  const dispByKey = new Map();
  for (const [key, rec] of accumN.entries()) {
    const nx = rec[0], ny = rec[1], nz = rec[2];
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-5) {
      dispByKey.set(key, [0, 0, 0]);
      continue;
    }
    const x = rec[3], y = rec[4], z = rec[5];
    const fade = groundFade ? smoothstep(-0.06, 0.14, y - groundY) : 1.0;
    const w = weightFn ? weightFn(x, y, z) : 1.0;
    const d = amplitude * fade * w * noise3(x, y, z, seed, freq);
    dispByKey.set(key, [(nx / len) * d, (ny / len) * d, (nz / len) * d]);
  }

  for (let i = 0; i < vCount; i += 1) {
    const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
    const d = dispByKey.get(posKey(x, y, z));
    if (d) posAttr.setXYZ(i, x + d[0], y + d[1], z + d[2]);
  }
  posAttr.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Generates an irregular, multi-lobed 3D soil/rubble/ice/humus skirt centered around `origin`
 * so flora, trunks, and architectural props bed organically into uneven terrain & neighbours.
 */
export function buildBasalSoilSkirtGeometry({
  origin = { x: 0, y: 0, z: 0 },
  radiusX = 0.55,
  radiusZ = 0.55,
  height = 0.12,
  sides = 14,
  rings = 5,
  seed = 1,
  colorHex = 0x5d5244,
  indexed = true,
  withUv = true,
} = {}) {
  const col = new THREE.Color(colorHex);
  const darkCol = col.clone().multiplyScalar(0.68);
  const topCol = col.clone().multiplyScalar(1.06);
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];

  const pushMound = (cx, cy, cz, rx, ry, rz, phase, mSides, mRings) => {
    const start = positions.length / 3;
    for (let r = 0; r < mRings; r += 1) {
      const rt = r / (mRings - 1);
      const rProf = Math.cos(rt * Math.PI * 0.46);
      const yProf = Math.sin(rt * Math.PI * 0.5);
      const c = darkCol.clone().lerp(topCol, rt);
      for (let s = 0; s < mSides; s += 1) {
        const a = (s / mSides) * Math.PI * 2;
        const wob = 1.0 + 0.18 * Math.sin(a * 3 + phase) + 0.11 * Math.cos(a * 5 - phase * 0.8);
        const px = cx + Math.cos(a) * rx * rProf * wob;
        const pz = cz + Math.sin(a) * rz * rProf * wob;
        const py = cy - 0.055 + yProf * (ry + 0.055) * (0.9 + 0.14 * Math.sin(a * 2 + phase));
        positions.push(px, py, pz);
        colors.push(c.r, c.g, c.b);
        uvs.push(0.5 + (px - cx) / Math.max(0.1, rx * 2.2), 0.5 + (pz - cz) / Math.max(0.1, rz * 2.2));
      }
    }
    for (let r = 0; r + 1 < mRings; r += 1) {
      for (let s = 0; s < mSides; s += 1) {
        const sn = (s + 1) % mSides;
        const a = start + r * mSides + s;
        const b = start + r * mSides + sn;
        const cIdx = a + mSides;
        const dIdx = b + mSides;
        indices.push(a, cIdx, b, b, cIdx, dIdx);
      }
    }
    const topIdx = positions.length / 3;
    positions.push(cx, cy + ry * 0.88, cz);
    colors.push(topCol.r, topCol.g, topCol.b);
    uvs.push(0.5, 0.5);
    const lastRow = start + (mRings - 1) * mSides;
    for (let s = 0; s < mSides; s += 1) {
      indices.push(topIdx, lastRow + ((s + 1) % mSides), lastRow + s);
    }
  };

  pushMound(origin.x, origin.y, origin.z, radiusX, height, radiusZ, seed * 0.37, sides, rings);
  const satCount = 5;
  for (let i = 0; i < satCount; i += 1) {
    const a = (i / satCount) * Math.PI * 2 + (seed % 7) * 0.23;
    const dist = 0.72 + 0.14 * Math.sin(i * 2.1 + seed);
    pushMound(
      origin.x + Math.cos(a) * radiusX * dist,
      origin.y - 0.01,
      origin.z + Math.sin(a) * radiusZ * dist,
      radiusX * (0.28 + 0.06 * (i % 2)),
      height * (0.56 + 0.12 * (i % 3)),
      radiusZ * (0.26 + 0.05 * ((i + 1) % 2)),
      seed + i * 1.9,
      8,
      3,
    );
  }

  let geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (withUv) geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  if (!indexed) {
    const nonIdx = geom.toNonIndexed();
    geom.dispose();
    geom = nonIdx;
  }
  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds a spatial hash cell map (cell = 0.14 m) from one or more geometries so multi-part
 * props and dense clusters can evaluate inter-part cavity & proximity occlusion quickly.
 */
export function buildSpatialSampleGrid(geometries, cellSize = 0.14) {
  const cells = new Map();
  const seen = new Set();
  for (const geo of geometries) {
    const pos = geo.attributes?.position;
    if (!pos) continue;
    const stride = pos.count > 6000 ? 2 : 1;
    for (let i = 0; i < pos.count; i += stride) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const qk = `${Math.round(x * 20)},${Math.round(y * 20)},${Math.round(z * 20)}`;
      if (seen.has(qk)) continue;
      seen.add(qk);
      const cx = Math.floor(x / cellSize);
      const cy = Math.floor(y / cellSize);
      const cz = Math.floor(z / cellSize);
      const ck = `${cx},${cy},${cz}`;
      let list = cells.get(ck);
      if (!list) {
        list = [];
        cells.set(ck, list);
      }
      list.push(x, y, z);
    }
  }
  return { cells, cellSize };
}

/**
 * Bakes soil-contact ramp, peripheral neighbour feathering, and spatial-hash cavity AO
 * into vertex `color` or `tint`, plus optional upward normal blending right at ground level.
 */
export function bakeContactAndNeighbourAO(geometry, {
  groundY = 0,
  origin = null,
  radiusXZ = null,
  attrName = 'color',
  sampleGrid = null,
  strength = 0.44,
  minAO = 0.36,
  preserveUpNormals = false,
  blendBasalNormals = true,
} = {}) {
  const posAttr = geometry.attributes?.position;
  if (!posAttr) return geometry;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const nAttr = geometry.attributes.normal;
  const colAttr = geometry.attributes?.[attrName];

  const vCount = posAttr.count;
  const ox = origin ? origin.x : 0;
  const oz = origin ? origin.z : 0;

  let maxR = radiusXZ ?? 0;
  if (!maxR) {
    for (let i = 0; i < vCount; i += 1) {
      const r = Math.hypot(posAttr.getX(i) - ox, posAttr.getZ(i) - oz);
      if (r > maxR) maxR = r;
    }
    maxR = Math.max(0.25, maxR);
  }

  const grid = sampleGrid ?? buildSpatialSampleGrid([geometry]);
  const cellSize = grid.cellSize;

  if (colAttr) {
    const cache = new Map();
    for (let i = 0; i < vCount; i += 1) {
      const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
      const nx = nAttr.getX(i), ny = nAttr.getY(i), nz = nAttr.getZ(i);
      const k = `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)},${Math.round(nx * 2)},${Math.round(ny * 2)},${Math.round(nz * 2)}`;
      let ao = cache.get(k);
      if (ao === undefined) {
        const dy = y - groundY;
        const soilAO = 0.56 + 0.44 * smoothstep(-0.04, 0.36, dy);
        const radU = Math.hypot(x - ox, z - oz) / maxR;
        const periphAO = 1.0 - 0.12 * smoothstep(0.72, 1.08, radU) * (1.0 - smoothstep(0.0, 0.24, dy));
        const skyAO = 0.88 + 0.12 * Math.max(-0.2, Math.min(1.0, ny));

        let occ = 0;
        const gx = Math.floor(x / cellSize);
        const gy = Math.floor(y / cellSize);
        const gz = Math.floor(z / cellSize);
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dyy = -1; dyy <= 1; dyy += 1) {
            for (let dz = -1; dz <= 1; dz += 1) {
              const bucket = grid.cells.get(`${gx + dx},${gy + dyy},${gz + dz}`);
              if (!bucket) continue;
              for (let j = 0; j < bucket.length; j += 3) {
                const vx = bucket[j] - x, vy = bucket[j + 1] - y, vz = bucket[j + 2] - z;
                const d2 = vx * vx + vy * vy + vz * vz;
                if (d2 < 0.0012 || d2 > 0.11) continue;
                const dist = Math.sqrt(d2);
                const dot = (vx * nx + vy * ny + vz * nz) / dist;
                if (dot > SMOOTH_MIN_DOT) occ += dot * (1.0 - dist / 0.34);
              }
            }
          }
        }
        const cavityAO = Math.max(0.62, 1.0 - Math.min(0.38, occ * 0.036));
        ao = Math.max(minAO, Math.min(1.0, 1.0 - strength + strength * (soilAO * periphAO * skyAO * cavityAO)));
        cache.set(k, ao);
      }
      colAttr.setXYZ(
        i,
        Math.min(1.0, colAttr.getX(i) * ao),
        Math.min(1.0, colAttr.getY(i) * ao),
        Math.min(1.0, colAttr.getZ(i) * ao),
      );
    }
    colAttr.needsUpdate = true;
  }

  if (blendBasalNormals && !preserveUpNormals) {
    for (let i = 0; i < vCount; i += 1) {
      const y = posAttr.getY(i);
      const blend = 0.72 * (1.0 - smoothstep(-0.02, 0.11, y - groundY));
      if (blend > 0.01) {
        const nx = nAttr.getX(i) * (1 - blend);
        const ny = nAttr.getY(i) * (1 - blend) + blend;
        const nz = nAttr.getZ(i) * (1 - blend);
        const l = Math.hypot(nx, ny, nz) || 1;
        nAttr.setXYZ(i, nx / l, ny / l, nz / l);
      }
    }
    nAttr.needsUpdate = true;
  }

  return geometry;
}
