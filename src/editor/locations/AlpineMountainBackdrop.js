import * as THREE from 'three/webgpu';
import {
  attribute, clamp, color, dot, float, mix, normalize, positionLocal, pow, smoothstep,
  texture, vec2, vec3,
} from 'three/tsl';
import { fbm3 } from './gen/noise.js';
import { noiseTap } from './LocationEffects.js';

/**
 * Multi-range 3D alpine massif backdrop for open-air mountain locations.
 *
 * Replaces the former 1D 180-column sawtooth strip with three concentric 3D
 * displaced mountain rings (far high spires → main glacial massif → near rocky
 * foothills) sculpted with broad pyramidal alpine ridges, diagonally descending
 * rock buttresses, recessed glacial cirques, analytic 3D normals, diagonal
 * couloir snow veins, sun-raked alpine lighting, and layered aerial perspective.
 */

const TAU = Math.PI * 2;
const PEAK_NOISE_METRES = 1100;

/** Depth-ordered mountain ranges drawn back-to-front behind scene terrain (`depthWrite: false`). */
const RANGE_LAYERS = Object.freeze([
  Object.freeze({
    name: 'far-spires',
    radiusScale: 1.52,
    heightScale: 1.36,
    columns: 420,
    rows: 16,
    freq: 1.55,
    ridgeFreq: 3.1,
    spurAmp: 0.055,
    hazeAdd: 0.28,
    snowBias: 0.16,
    seedOffset: 73,
    renderOrder: -1.6,
  }),
  Object.freeze({
    name: 'main-massif',
    radiusScale: 1.10,
    heightScale: 1.12,
    columns: 384,
    rows: 16,
    freq: 1.35,
    ridgeFreq: 2.65,
    spurAmp: 0.064,
    hazeAdd: 0.08,
    snowBias: 0.04,
    seedOffset: 17,
    renderOrder: -1.4,
  }),
  Object.freeze({
    name: 'near-foothills',
    radiusScale: 0.82,
    heightScale: 0.78,
    columns: 320,
    rows: 12,
    freq: 1.85,
    ridgeFreq: 3.6,
    spurAmp: 0.055,
    hazeAdd: -0.1,
    snowBias: -0.1,
    seedOffset: 131,
    renderOrder: -1.2,
  }),
]);

const unitVec3 = (dir) => {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return [dir[0] / len, dir[1] / len, dir[2] / len];
};

/**
 * Broad, sweeping pyramidal alpine skyline evaluated on a closed circle `(cx, cz)`.
 * Uses low-frequency continental massifs + 4-octave ridged multifractal arêtes
 * with moderate frequency so slopes sweep naturally at ~35°–50° instead of
 * forming skinny vertical spikes.
 */
function ridgedAlpineCrest(angle, layer, seed) {
  const cx = Math.cos(angle);
  const cz = Math.sin(angle);
  const warp = (fbm3(cx * 1.1 + 4.2, cz * 1.1 - 2.7, 0.4, seed + 5, 3) - 0.5) * 0.34;
  const wx = Math.cos(angle + warp);
  const wz = Math.sin(angle + warp);

  // Broad massif domes & wide U-shaped glacial passes.
  const massif = fbm3(wx * layer.freq + 8.3, wz * layer.freq + 3.1, 0.35, seed + 11, 4);
  const massifCurve = Math.pow(Math.max(0, Math.min(1, massif * 1.12 - 0.04)), 1.25);

  // 4-octave ridged multifractal with gentle frequency step -> broad pyramidal horns & shoulders.
  let sum = 0;
  let amp = 0.52;
  let freq = layer.ridgeFreq;
  let weight = 1.0;
  for (let oct = 0; oct < 4; oct += 1) {
    const n = fbm3(wx * freq + 12.1 + oct * 3.7, wz * freq - 5.4 + oct * 2.3, 0.5 + oct * 0.25, seed + 29 + oct * 13, 1);
    let signal = 1 - Math.abs(n * 2 - 1);
    signal = Math.pow(signal, 1.55) * weight;
    weight = Math.max(0.24, Math.min(1.0, signal * 1.65));
    sum += signal * amp;
    freq *= 1.92;
    amp *= 0.45;
  }

  // Subtle high-crest alpine serrations so silhouettes are crisp and natural without needle spikes.
  const crag = 1 - Math.abs(fbm3(wx * 10.5 + 1.9, wz * 10.5 - 7.1, 0.7, seed + 97, 2) * 2 - 1);
  return Math.max(0.22, 0.28 + massifCurve * 0.58 + sum * 0.42 + crag * 0.055);
}

/**
 * Builds one 3D alpine massif ring geometry with diagonally descending rock
 * buttresses, recessed glacial cirque bowls, analytic 3D finite-difference
 * vertex normals, and per-vertex `mtnAttr` (`[normRow, normHeight, spurCurvature, wrapU]`).
 */
export function buildAlpineMassifRingGeometry(peaks, layer) {
  const radius = peaks.radius * layer.radiusScale;
  const height = peaks.height * layer.heightScale;
  const seed = (peaks.seed ?? 1) + layer.seedOffset;
  const cols = layer.columns;
  const rows = layer.rows;
  const baseY = -height * 0.24;
  const tilesAround = Math.max(2, Math.round((TAU * radius) / PEAK_NOISE_METRES));

  const crestH = new Float32Array(cols + 1);
  let maxCrest = 0.001;
  for (let c = 0; c <= cols; c += 1) {
    const angle = ((c % cols) / cols) * TAU;
    const h = height * ridgedAlpineCrest(angle, layer, seed);
    crestH[c] = h;
    if (h > maxCrest) maxCrest = h;
  }

  const vCount = (cols + 1) * (rows + 1);
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const mtnAttr = new Float32Array(vCount * 4);
  const indices = [];

  for (let c = 0; c <= cols; c += 1) {
    const cWrap = c % cols;
    const angle = (cWrap / cols) * TAU;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const topY = crestH[cWrap];
    const spanY = topY - baseY;
    const uWrap = (c / cols) * tilesAround;

    // Local crest slope & prominence drive diagonal descending ridge spurs (not vertical pleats).
    const hPrev = crestH[(cWrap + cols - 2) % cols];
    const hNext = crestH[(cWrap + 2) % cols];
    const slopeDir = Math.max(-1, Math.min(1, (hNext - hPrev) / (height * 0.14)));
    const crestCurv = Math.max(-1, Math.min(1, (topY - (hPrev + hNext) * 0.5) / (height * 0.03)));

    for (let r = 0; r <= rows; r += 1) {
      const v = r / rows;
      const vEase = 1 - Math.pow(1 - v, 1.32);
      const y = baseY + spanY * vEase;

      // Diagonal 3D spur sampling: ridge ribs sweep obliquely down-and-outward from each peak.
      const diagAngle = angle - slopeDir * (1 - vEase) * 0.085;
      const dx = Math.cos(diagAngle);
      const dz = Math.sin(diagAngle);
      const elevCoord = (y / height) * 1.45;
      const spur3D = fbm3(dx * 4.4 + 3.1, elevCoord + 1.2, dz * 4.4 + 6.7, seed + 41, 3) - 0.5;
      const cirque3D = fbm3(dx * 8.2 - 4.3, elevCoord * 1.6, dz * 8.2 + 1.9, seed + 61, 2) - 0.5;

      // Broad base buttress apron + diagonal mid-slope rock spurs pinching cleanly to the ridge arête.
      const flankProfile = Math.sin(Math.PI * Math.pow(vEase, 0.8));
      const baseFlare = (1 - vEase) * (1 - vEase) * 0.14;
      const rib = (spur3D * 0.8 + cirque3D * 0.25 + crestCurv * 0.18) * layer.spurAmp * flankProfile;
      const rVertex = radius * (1 - baseFlare - rib);

      const idx = c * (rows + 1) + r;
      positions[idx * 3] = ca * rVertex;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = sa * rVertex;

      const normHeight = Math.max(0, Math.min(1, y / maxCrest));
      const curv = Math.max(-1, Math.min(1, crestCurv * 0.45 + spur3D * 1.35));
      mtnAttr[idx * 4] = vEase;
      mtnAttr[idx * 4 + 1] = normHeight;
      mtnAttr[idx * 4 + 2] = curv;
      mtnAttr[idx * 4 + 3] = uWrap;
    }
  }

  // Analytic 3D finite-difference normals pointing inward toward the valley viewer.
  for (let c = 0; c <= cols; c += 1) {
    const cPrev = (c === 0 ? cols - 1 : c - 1);
    const cNext = (c === cols ? 1 : c + 1);
    for (let r = 0; r <= rows; r += 1) {
      const rPrev = Math.max(0, r - 1);
      const rNext = Math.min(rows, r + 1);
      const iL = (cPrev * (rows + 1) + r) * 3;
      const iR = (cNext * (rows + 1) + r) * 3;
      const iD = (c * (rows + 1) + rPrev) * 3;
      const iU = (c * (rows + 1) + rNext) * 3;

      const tux = positions[iR] - positions[iL];
      const tuy = positions[iR + 1] - positions[iL + 1];
      const tuz = positions[iR + 2] - positions[iL + 2];
      const tvx = positions[iU] - positions[iD];
      const tvy = positions[iU + 1] - positions[iD + 1];
      const tvz = positions[iU + 2] - positions[iD + 2];

      let nx = tuy * tvz - tuz * tvy;
      let ny = tuz * tvx - tux * tvz;
      let nz = tux * tvy - tuy * tvx;
      const idx = c * (rows + 1) + r;
      const px = positions[idx * 3];
      const pz = positions[idx * 3 + 2];
      if (nx * px + nz * pz > 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[idx * 3] = nx / len;
      normals[idx * 3 + 1] = ny / len;
      normals[idx * 3 + 2] = nz / len;
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
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('mtnAttr', new THREE.BufferAttribute(mtnAttr, 4));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Photorealistic alpine mountain material: analytic 3D sun-raked shading,
 * diagonal erosion couloirs, slope/altitude snowline, dark striated gneiss rock
 * faces, crisp sunlit arêtes, and depth-layered atmospheric aerial perspective.
 */
function createAlpineMassifMaterial(sky, layer, alpinePack = null) {
  const material = new THREE.MeshBasicNodeMaterial({
    name: `location-peaks-${layer.name}`,
    side: THREE.DoubleSide,
    fog: false,
    depthWrite: false,
  });

  const [sx, sy, sz] = unitVec3(sky.sun.direction);
  const sunDir = vec3(sx, sy, sz);
  const n3 = normalize(attribute('normal', 'vec3'));
  const attr = attribute('mtnAttr', 'vec4');
  const normRow = attr.x;
  const normHeight = attr.y;
  const curvature = attr.z;
  const wrapU = attr.w;

  // Sample erosion couloirs & snow turbulence along diagonal mountain-flank coordinates (zero vertical striping).
  const diagU = wrapU.mul(1.35).add(normRow.mul(0.55));
  const diagV = positionLocal.y.div(PEAK_NOISE_METRES * 0.55).sub(wrapU.mul(0.18));
  const packA = alpinePack ? texture(alpinePack, vec2(diagU, diagV)) : null;
  const packB = alpinePack ? texture(alpinePack, vec2(wrapU.mul(0.75).sub(normRow.mul(0.35)), positionLocal.y.div(PEAK_NOISE_METRES * 0.35))) : null;
  const fallbackMeso = noiseTap(vec2(diagV, wrapU), 'meso');

  const couloir = packA ? packA.r : fallbackMeso.b;
  const driftNoise = packB ? packB.g : fallbackMeso.g;
  const strataGrain = packB ? packB.b : fallbackMeso.r;

  // Subtle normal detail perturbation from rock strata & erosion gullies.
  const ribPerturb = couloir.sub(0.5).mul(0.22).add(strataGrain.sub(0.5).mul(0.12));
  const shadeN = normalize(vec3(
    n3.x.add(ribPerturb.mul(0.45)),
    n3.y.add(strataGrain.sub(0.5).mul(0.16)),
    n3.z.sub(ribPerturb.mul(0.45)),
  ));

  // Direct alpine sunlight + soft wrapped snow scatter + cool sky-dome shadow fill.
  const ndotl = dot(shadeN, sunDir);
  const rockSun = clamp(ndotl, 0, 1);
  const snowSun = pow(clamp(ndotl.mul(0.76).add(0.24), 0, 1), 0.92);
  const cirqueAO = clamp(curvature.mul(0.24).add(0.86), 0.62, 1.08);

  // Dark banded alpine gneiss/slate rock exposed on steep faces.
  const rockBase = color(sky.peaks.rock).mul(mix(float(0.76), float(1.16), strataGrain));
  const rockLit = mix(
    rockBase.mul(color(sky.peaks.shade)).mul(0.84),
    rockBase.mul(color(sky.sun.color)).mul(1.18).add(rockBase.mul(0.3)),
    smoothstep(0.05, 0.72, rockSun),
  ).mul(cirqueAO);

  // Natural snow accumulation: gentle slopes, hanging cirques, upper snowfields, and diagonal couloirs.
  const slopeSnow = smoothstep(0.24, 0.66, shadeN.y.add(driftNoise.sub(0.5).mul(0.26)));
  const couloirVein = smoothstep(0.48, 0.78, couloir.add(curvature.mul(-0.2))).mul(smoothstep(0.12, 0.55, normHeight));
  const altitudeSnow = smoothstep(0.16, 0.72, normHeight.add(float(layer.snowBias)).add(driftNoise.sub(0.5).mul(0.22)));
  const snowCover = clamp(
    slopeSnow.mul(0.66).add(altitudeSnow.mul(0.5)).add(couloirVein.mul(0.52)).sub(0.24),
    0,
    1,
  );
  const snowMask = smoothstep(0.22, 0.68, snowCover);

  // Snow shading: crisp bright sun-facing snowfields vs. rich alpine blue shadowed flanks.
  const snowLit = mix(
    color(sky.peaks.shade).mul(mix(float(0.8), float(1.0), cirqueAO)),
    color(sky.peaks.snow).mul(mix(float(0.96), float(1.08), driftNoise)),
    smoothstep(0.16, 0.78, snowSun),
  );

  const viewDir = normalize(positionLocal);
  const sunAlign = pow(clamp(dot(viewDir, sunDir), 0, 1), 5.0);
  const crestRim = smoothstep(0.72, 0.98, normRow).mul(clamp(curvature.mul(0.5).add(0.5), 0, 1));
  let mountain = mix(rockLit, snowLit, snowMask);
  mountain = mountain.add(color(sky.sun.color).mul(crestRim.mul(0.1).add(sunAlign.mul(0.08))));

  // Depth-layered atmospheric aerial perspective + smooth valley-floor mist fade.
  const baseHaze = clamp(float((sky.peaks.haze ?? 0.3) + layer.hazeAdd), 0.08, 0.82);
  const elevHaze = mix(float(1), float(0.46), smoothstep(0.08, 0.86, normRow));
  const hazeTint = mix(color(sky.ground), color(sky.horizon), smoothstep(0.1, 0.75, normRow))
    .add(color(sky.sun.color).mul(sunAlign.mul(0.1)));
  const aerial = clamp(baseHaze.mul(elevHaze), 0, 0.86);
  const shaded = mix(mountain, hazeTint, aerial);
  const footFade = smoothstep(0.0, 0.24, normRow);
  material.colorNode = mix(color(sky.ground), shaded, footFade);
  return material;
}

/**
 * Creates a `THREE.Group` holding the three depth-ordered 3D alpine massif rings.
 *
 * @param {object} sky resolved `lightingProfiles.*.sky`
 * @param {THREE.Texture | null} [alpinePack] optional on-demand CC0 alpine noise pack
 */
export function createAlpineMountainBackdrop(sky, alpinePack = null) {
  const group = new THREE.Group();
  group.name = 'location-alpine-massif';
  for (const layer of RANGE_LAYERS) {
    const geometry = buildAlpineMassifRingGeometry(sky.peaks, layer);
    const material = createAlpineMassifMaterial(sky, layer, alpinePack);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `location-peaks-${layer.name}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = layer.renderOrder;
    group.add(mesh);
  }
  return group;
}
