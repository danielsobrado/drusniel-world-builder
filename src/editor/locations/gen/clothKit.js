import * as THREE from 'three/webgpu';
import { createRng, fbm3 } from './noise.js';

/**
 * World-space cloth, draped hides, hand-hewn crooked stakes, and iron/rawhide
 * hardware for Frostgard waystations and glacier trail markers.
 *
 * Cloth meshes carry:
 *   - `uv` (metres along cloth U/V so wool weave and fur grain stay true-to-scale)
 *   - `clothData` (`vec4`: x = pinWeight 0..1, y = windPhase, z = borderTrim 0..1, w = flutterScale)
 */

const TAU = Math.PI * 2;
const P = (x, y, z) => ({ x, y, z });

function normalize3(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Builds a subdivided wind-animated cloth flag or swallowtail storm pennant
 * attached along `[hoistBottom .. hoistTop]` and streaming toward `flyDir`.
 *
 * @param {{x:number,y:number,z:number}} hoistTop
 * @param {{x:number,y:number,z:number}} hoistBottom
 * @param {{x:number,y:number,z:number}} flyDir
 * @param {number} length metres from hoist to trailing tip
 * @param {{ style?: 'swallowtail'|'pennant'|'banner', seed?: number, cols?: number, rows?: number, droop?: number, flutter?: number }} [options]
 */
export function windFlagMesh(hoistTop, hoistBottom, flyDir, length, {
  style = 'swallowtail',
  seed = 1,
  cols = 18,
  rows = 8,
  droop = 0.14,
  flutter = 1.0,
} = {}) {
  const rng = createRng(seed * 4999 + Math.round(length * 1009) + 17);
  const phase = rng() * 24;
  const upVec = {
    x: hoistTop.x - hoistBottom.x,
    y: hoistTop.y - hoistBottom.y,
    z: hoistTop.z - hoistBottom.z,
  };
  const hoistH = Math.hypot(upVec.x, upVec.y, upVec.z) || 0.35;
  const up = normalize3(upVec);
  const flyRaw = normalize3(flyDir);
  // Orthogonalize fly against hoist axis, then derive sheet normal.
  const dotFU = flyRaw.x * up.x + flyRaw.y * up.y + flyRaw.z * up.z;
  const fly = normalize3({
    x: flyRaw.x - up.x * dotFU,
    y: flyRaw.y - up.y * dotFU,
    z: flyRaw.z - up.z * dotFU,
  });
  const normal = normalize3(cross3(fly, up));

  const vCount = (cols + 1) * (rows + 1);
  const positions = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const clothData = new Float32Array(vCount * 4);
  const tints = new Float32Array(vCount * 3);
  const indices = [];

  for (let c = 0; c <= cols; c += 1) {
    const u = c / cols;
    // Slight organic sway/billow baked into rest state so even static thumbnails look alive.
    const restBillow = Math.sin(u * Math.PI * 2.1 + phase * 0.4) * 0.055 * length * Math.pow(u, 1.15);
    const catenaryDroop = -droop * length * Math.pow(u, 1.55);

    for (let r = 0; r <= rows; r += 1) {
      const v = r / rows;
      const vCentered = (v - 0.5) * 2; // -1 bottom .. +1 top

      // Silhouette shaping: swallowtail fork, tapered pennant, or weathered trailing banner.
      let reach = length;
      let halfH = hoistH * 0.5;
      if (style === 'swallowtail') {
        // Deep forked notch at mid-height on the fly edge, slight taper along the tails.
        const notch = Math.exp(-((vCentered / 0.46) ** 2)) * 0.34 * length;
        const fray = (fbm3(v * 7.5 + seed, u * 2.5, 0.4, seed + 13, 2) - 0.5) * 0.045 * length;
        reach = length - notch * Math.pow(u, 1.8) + fray * Math.pow(u, 2.2);
        halfH = hoistH * 0.5 * (1 - u * 0.16);
      } else if (style === 'pennant') {
        reach = length * (1 + (fbm3(v * 6.0, seed * 0.3, 0.2, seed + 7, 2) - 0.5) * 0.04 * u);
        halfH = hoistH * 0.5 * (1 - u * 0.72);
      } else {
        const fray = (fbm3(v * 8.2 + seed, 1.3, 0.5, seed + 23, 2) - 0.5) * 0.06 * length;
        reach = length + fray * Math.pow(u, 2.0);
        halfH = hoistH * 0.5 * (1 - u * 0.08);
      }

      const dist = u * reach;
      const vPos = 0.5 * hoistH + vCentered * halfH;
      // Extra micro-fold across the vertical hoist profile near the trailing edge.
      const vertRipple = Math.sin(v * Math.PI * 2.4 + u * 5.2 + phase) * 0.018 * length * u;
      const outN = restBillow + vertRipple;

      const idx = c * (rows + 1) + r;
      positions[idx * 3] = hoistBottom.x + up.x * vPos + fly.x * dist + normal.x * outN;
      positions[idx * 3 + 1] = hoistBottom.y + up.y * vPos + fly.y * dist + normal.y * outN + catenaryDroop;
      positions[idx * 3 + 2] = hoistBottom.z + up.z * vPos + fly.z * dist + normal.z * outN;

      uvs[idx * 2] = u * length;
      uvs[idx * 2 + 1] = v * hoistH;

      // Pin strictly at u = 0 (hoist pole attachment), ramping smoothly to full wind freedom at tip.
      const pinWeight = Math.pow(u, 1.35);
      // Woven border trim band along top/bottom hems + stitched hoist sleeve.
      const edgeDist = Math.min(v, 1 - v);
      const borderBand = edgeDist > 0.07 && edgeDist < 0.17 ? 1 : 0;
      const hoistSleeve = u < 0.09 ? 0.65 : 0;
      const borderTrim = Math.max(borderBand, hoistSleeve);

      clothData[idx * 4] = pinWeight;
      clothData[idx * 4 + 1] = phase;
      clothData[idx * 4 + 2] = borderTrim;
      clothData[idx * 4 + 3] = flutter;

      // Subtle weathered fade toward sun-bleached fly tips and darker creases near hoist.
      const shade = 0.88 + u * 0.12 - (1 - Math.abs(vCentered)) * 0.04;
      tints[idx * 3] = shade;
      tints[idx * 3 + 1] = shade * (0.98 + u * 0.03);
      tints[idx * 3 + 2] = shade * (0.97 + u * 0.04);
    }
  }

  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const a = c * (rows + 1) + r;
      const b = a + 1;
      const d = (c + 1) * (rows + 1) + r;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('clothData', new THREE.BufferAttribute(clothData, 4));
  geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Builds an organic contoured animal pelt/hide draped over a horizontal drying
 * rail from `topLeft` to `topRight`, hanging `drop` metres down with sculpted
 * gravity folds, tapered shoulder/leg silhouette, and gentle breeze sway.
 */
export function drapedHideMesh(topLeft, topRight, drop, {
  seed = 1,
  cols = 12,
  rows = 10,
} = {}) {
  const rng = createRng(seed * 3571 + 29);
  const phase = rng() * 18;
  const spanVec = {
    x: topRight.x - topLeft.x,
    y: topRight.y - topLeft.y,
    z: topRight.z - topLeft.z,
  };
  const width = Math.hypot(spanVec.x, spanVec.y, spanVec.z) || 0.8;
  const right = normalize3(spanVec);
  const front = normalize3(cross3(right, P(0, 1, 0)));

  const vCount = (cols + 1) * (rows + 1);
  const positions = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const clothData = new Float32Array(vCount * 4);
  const tints = new Float32Array(vCount * 3);
  const indices = [];

  for (let c = 0; c <= cols; c += 1) {
    const u = c / cols;
    const uCentered = (u - 0.5) * 2; // -1 .. +1
    // Pelt bottom contour: shoulder flares, narrowed waist, twin leg flaps + tail drop in center.
    const legLobes = Math.exp(-(((Math.abs(uCentered) - 0.68) / 0.24) ** 2)) * 0.16;
    const tailTip = Math.exp(-((uCentered / 0.18) ** 2)) * 0.11;
    const sideTrim = Math.pow(Math.abs(uCentered), 2.4) * 0.18;
    const localDrop = drop * (0.86 + legLobes + tailTip - sideTrim);

    for (let r = 0; r <= rows; r += 1) {
      const v = r / rows; // 0 top rail .. 1 bottom hanging edge
      // Organic hourglass width curve of a cured hide (narrower at waist, wider at shoulders & haunches).
      const waistPinch = 1 - Math.sin(v * Math.PI) * 0.17 + Math.exp(-(((v - 0.8) / 0.22) ** 2)) * 0.08;
      const edgeNoise = (fbm3(u * 4.5 + seed, v * 4.5, 0.3, seed + 17, 2) - 0.5) * 0.05;
      const along = (0.5 + (u - 0.5) * waistPinch + edgeNoise * v) * width;

      // Draped vertical pleats + subtle outward roll at bottom hem + gentle wrap over top rail.
      const pleat = Math.sin(u * Math.PI * 3.2 + phase) * 0.048 * Math.sin(v * Math.PI * 0.85)
        + Math.cos(u * Math.PI * 5.6 - phase * 0.7) * 0.02 * v;
      const topArch = Math.exp(-v * 9.0) * 0.045;
      const bottomCurl = Math.pow(v, 2.5) * (0.045 * Math.cos(uCentered * Math.PI));
      const outFront = pleat + topArch + bottomCurl;

      const idx = c * (rows + 1) + r;
      positions[idx * 3] = topLeft.x + right.x * along + front.x * outFront;
      positions[idx * 3 + 1] = topLeft.y + right.y * along - v * localDrop + Math.sin(v * 0.3) * 0.015;
      positions[idx * 3 + 2] = topLeft.z + right.z * along + front.z * outFront;

      uvs[idx * 2] = u * width;
      uvs[idx * 2 + 1] = v * drop;

      // Heavy leather/fur sways gently from the top rail (`flutterScale = 0.22`).
      clothData[idx * 4] = Math.pow(v, 1.55) * 0.75;
      clothData[idx * 4 + 1] = phase;
      // Darkened spine & lighter belly flanks typical of elk/caribou/wolf hides.
      const rimEdge = Math.max(Math.abs(uCentered), v) > 0.84 ? 1 : 0;
      clothData[idx * 4 + 2] = rimEdge * 0.7;
      clothData[idx * 4 + 3] = 0.22;

      const spineDark = 1 - Math.exp(-((uCentered / 0.38) ** 2)) * 0.24;
      const frostTip = Math.pow(v, 2.0) * 0.08;
      tints[idx * 3] = Math.min(1.08, spineDark + frostTip);
      tints[idx * 3 + 1] = Math.min(1.08, spineDark * 0.98 + frostTip);
      tints[idx * 3 + 2] = Math.min(1.08, spineDark * 0.95 + frostTip * 1.15);
    }
  }

  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const a = c * (rows + 1) + r;
      const b = a + 1;
      const d = (c + 1) * (rows + 1) + r;
      const e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('clothData', new THREE.BufferAttribute(clothData, 4));
  geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Hand-barked, organically bowed spruce pole/post from `base` to `tip`.
 * Replaces rigid straight 6-sided sticks on trail stakes, drying racks, and banner standards.
 */
export function hewnPole(base, tip, rBase, rTip, {
  seed = 1,
  segments = 6,
  sides = 9,
  bow = 0.055,
} = {}) {
  const rng = createRng(seed * 6133 + 11);
  const dx = tip.x - base.x, dy = tip.y - base.y, dz = tip.z - base.z;
  const len = Math.hypot(dx, dy, dz) || 1e-4;
  const ax = dx / len, ay = dy / len, az = dz / len;
  const ref = Math.abs(ay) < 0.9 ? P(0, 1, 0) : P(1, 0, 0);
  const u = normalize3(cross3(P(ax, ay, az), ref));
  const v = normalize3(cross3(P(ax, ay, az), u));

  const bowAng = rng() * TAU;
  const bowU = Math.cos(bowAng) * bow * Math.min(1.6, len * 0.45);
  const bowV = Math.sin(bowAng) * bow * Math.min(1.6, len * 0.45);
  const twistRate = (rng() - 0.5) * 0.9;
  const knotT = 0.25 + rng() * 0.5;
  const knotAng = rng() * TAU;

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let s = 0; s <= segments; s += 1) {
    const t = s / segments;
    const camber = Math.sin(t * Math.PI);
    const wiggle = Math.sin(t * Math.PI * 2.2 + seed) * bow * 0.28 * camber;
    const cx = base.x + dx * t + u.x * (bowU * camber + wiggle) + v.x * (bowV * camber - wiggle * 0.7);
    const cy = base.y + dy * t + u.y * (bowU * camber + wiggle) + v.y * (bowV * camber - wiggle * 0.7);
    const cz = base.z + dz * t + u.z * (bowU * camber + wiggle) + v.z * (bowV * camber - wiggle * 0.7);
    const r = rBase + (rTip - rBase) * t;

    for (let k = 0; k <= sides; k += 1) {
      const ang = (k / sides) * TAU + t * twistRate;
      const flute = 1 + Math.sin(ang * 3 + seed) * 0.055 + Math.cos(ang * 5 - t * 4) * 0.03;
      const knot = Math.exp(-(((t - knotT) / 0.08) ** 2)) * Math.max(0, Math.cos(ang - knotAng)) * 0.14;
      const rk = r * (flute + knot);
      const ca = Math.cos(ang) * rk;
      const sa = Math.sin(ang) * rk;
      positions.push(cx + u.x * ca + v.x * sa, cy + u.y * ca + v.y * sa, cz + u.z * ca + v.z * sa);
      uvs.push(k / sides, t * len);
    }
  }

  const stride = sides + 1;
  for (let s = 0; s < segments; s += 1) {
    for (let k = 0; k < sides; k += 1) {
      const a = s * stride + k;
      const b = a + stride;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  // Cap tip cleanly so top never looks hollow.
  const tipCenterIdx = positions.length / 3;
  positions.push(tip.x, tip.y, tip.z);
  uvs.push(0.5, len);
  const topRingStart = segments * stride;
  for (let k = 0; k < sides; k += 1) {
    indices.push(topRingStart + k, topRingStart + k + 1, tipCenterIdx);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Forged iron collar band or rawhide lashing wrap encircling a pole/joint at `at`.
 */
export function collarRing(at, axisDir, radius, height = 0.045, sides = 10) {
  const ax = normalize3(axisDir);
  const ref = Math.abs(ax.y) < 0.9 ? P(0, 1, 0) : P(1, 0, 0);
  const u = normalize3(cross3(ax, ref));
  const v = normalize3(cross3(ax, u));
  const positions = [];
  const indices = [];
  const halfH = height * 0.5;
  const rings = [-halfH, 0, halfH];
  const radii = [radius * 0.94, radius * 1.12, radius * 0.94];

  for (let r = 0; r < rings.length; r += 1) {
    const h = rings[r];
    const rad = radii[r];
    for (let k = 0; k <= sides; k += 1) {
      const ang = (k / sides) * TAU;
      const ca = Math.cos(ang) * rad;
      const sa = Math.sin(ang) * rad;
      positions.push(
        at.x + ax.x * h + u.x * ca + v.x * sa,
        at.y + ax.y * h + u.y * ca + v.y * sa,
        at.z + ax.z * h + u.z * ca + v.z * sa,
      );
    }
  }

  const stride = sides + 1;
  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let k = 0; k < sides; k += 1) {
      const a = r * stride + k;
      const b = a + stride;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Draped vertical royal heraldic banner / tapestry hanging from `[topLeft .. topRight]`
 * with sculpted vertical velvet/wool pleats, tapered V-pointed hem, baked Dwarven
 * heraldry (crimson outer field, obsidian central pale, gilded border stripes & diamond
 * mountain crest), and GPU wind/draft sway (`clothData`).
 */
export function hangingBannerMesh(topLeft, topRight, drop, {
  style = 'heraldic',
  seed = 1,
  cols = 20,
  rows = 22,
  flutter = 0.42,
  primaryHex = 0x621510,
  paleHex = 0x16151a,
  goldHex = 0xa8823c,
} = {}) {
  const rng = createRng(seed * 4129 + Math.round(drop * 733) + 19);
  const phase = rng() * 22;
  const spanVec = {
    x: topRight.x - topLeft.x,
    y: topRight.y - topLeft.y,
    z: topRight.z - topLeft.z,
  };
  const width = Math.hypot(spanVec.x, spanVec.y, spanVec.z) || 1.6;
  const right = normalize3(spanVec);
  const front = normalize3(cross3(P(0, 1, 0), right));

  const cPrimary = new THREE.Color(primaryHex);
  const cPale = new THREE.Color(paleHex);
  const cGold = new THREE.Color(goldHex);
  const tmpColor = new THREE.Color();
  const smooth = (e0, e1, x) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  const vCount = (cols + 1) * (rows + 1);
  const positions = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const clothData = new Float32Array(vCount * 4);
  const tints = new Float32Array(vCount * 3);
  const indices = [];

  for (let c = 0; c <= cols; c += 1) {
    const u = c / cols;
    const uCentered = (u - 0.5) * 2; // -1 .. +1
    const absU = Math.abs(uCentered);
    const tipDrop = style === 'heraldic'
      ? drop * (1 - absU * 0.25)
      : drop * (0.94 + Math.cos(uCentered * Math.PI * 0.5) * 0.06);

    for (let r = 0; r <= rows; r += 1) {
      const v = r / rows; // 0 top bar .. 1 bottom hem
      const edgeTaper = 1 - v * 0.05;
      const along = (0.5 + (u - 0.5) * edgeTaper) * width;
      const down = v * tipDrop;

      // Sculpted vertical drapery folds pinned cleanly along the top crossbar & deepening gracefully downward.
      const foldEnv = Math.sin(Math.min(1, v * 1.25) * Math.PI * 0.85);
      const pleat = Math.sin(u * Math.PI * 3.5 + phase * 0.2) * 0.072 * width * foldEnv
        + Math.cos(u * Math.PI * 6.5 - v * 2.1 + phase * 0.35) * 0.022 * width * v;
      const gentleBelly = Math.sin(v * Math.PI) * 0.05 * Math.min(2.2, drop * 0.22);
      const outN = pleat + gentleBelly;

      const idx = c * (rows + 1) + r;
      positions[idx * 3] = topLeft.x + right.x * along + front.x * outN;
      positions[idx * 3 + 1] = topLeft.y + right.y * along - down;
      positions[idx * 3 + 2] = topLeft.z + right.z * along + front.z * outN;

      uvs[idx * 2] = down;
      uvs[idx * 2 + 1] = along;

      const pinWeight = Math.pow(v, 1.45) * 0.88;
      // Smoothly antialiased woven heraldic embroidery (zero jagged vertex aliasing!).
      const paleMask = style === 'heraldic'
        ? (1 - smooth(0.38, 0.46, absU)) * smooth(0.14, 0.20, v) * (1 - smooth(0.76 - absU * 0.24, 0.84 - absU * 0.24, v))
        : 0;
      const borderBand = smooth(0.74, 0.80, absU) * (1 - smooth(0.88, 0.94, absU)) * (1 - smooth(0.84, 0.92, v));
      const topHeader = 1 - smooth(0.03, 0.07, v);
      const dxCrest = uCentered / 0.26;
      const dyCrest = (v - 0.42) / 0.10;
      const diamondDist = Math.abs(dxCrest) + Math.abs(dyCrest);
      const goldCrest = style === 'heraldic'
        ? (1 - smooth(0.45, 0.78, diamondDist))
        : 0;
      const goldWeight = Math.min(1, Math.max(borderBand, topHeader, goldCrest));

      tmpColor.copy(cPrimary).lerp(cPale, paleMask).lerp(cGold, goldWeight);
      // Fold cavity shading accentuates sculpted pleats.
      const pleatShade = 0.82 + Math.sin(u * Math.PI * 3.5 + phase * 0.2) * 0.16 * foldEnv;
      tints[idx * 3] = tmpColor.r * pleatShade;
      tints[idx * 3 + 1] = tmpColor.g * pleatShade;
      tints[idx * 3 + 2] = tmpColor.b * pleatShade;

      clothData[idx * 4] = pinWeight;
      clothData[idx * 4 + 1] = phase;
      clothData[idx * 4 + 2] = (absU > 0.92 || v > 0.94) ? 0.72 : 0;
      clothData[idx * 4 + 3] = flutter;
    }
  }

  for (let c = 0; c < cols; c += 1) {
    const mirrorRight = c >= cols * 0.5;
    for (let r = 0; r < rows; r += 1) {
      const a = c * (rows + 1) + r;
      const b = a + 1;
      const d = (c + 1) * (rows + 1) + r;
      const e = d + 1;
      if (mirrorRight) indices.push(a, b, e, a, e, d);
      else indices.push(a, b, d, b, e, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('clothData', new THREE.BufferAttribute(clothData, 4));
  geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
