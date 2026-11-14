import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  finalizeGeometry,
  mergeParts,
  spherifyNormals,
  unitRandom,
} from './proceduralGeometry.js';

/** Mild per-cluster normal softening keeps individual leaf groupings readable. */
const CLUSTER_NORMAL_SPHERIFY = 0.42;
const UP_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Procedural understory prototypes: multi-stemmed woody shrubs with irregular
 * branched leaf groupings and arched tapered fern tufts. Built once at startup
 * and ground-pivoted at y=0.
 */

function distortRadially(geometry, key, channel, amount) {
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const jitter = 1 + (unitRandom(key, channel + index) - 0.5) * amount;
    positions.setXYZ(
      index,
      positions.getX(index) * jitter,
      positions.getY(index) * jitter,
      positions.getZ(index) * jitter,
    );
  }
  positions.needsUpdate = true;
  return geometry;
}

function taperedSegmentGeometry(from, to, baseRadius, tipRadius, radialSegments = 4) {
  const delta = new THREE.Vector3().subVectors(to, from);
  const length = Math.max(1e-4, delta.length());
  const geometry = new THREE.CylinderGeometry(tipRadius, baseRadius, length, radialSegments, 1, true);
  const quat = new THREE.Quaternion().setFromUnitVectors(UP_AXIS, delta.normalize());
  geometry.applyQuaternion(quat);
  geometry.translate(
    (from.x + to.x) * 0.5,
    (from.y + to.y) * 0.5,
    (from.z + to.z) * 0.5,
  );
  return geometry;
}

function rotatedSpreadAngles(key, stemCount) {
  const angles = [];
  const golden = 2.3999632;
  for (let i = 0; i < stemCount; i += 1) {
    // Anchor first two stems asymmetrically along opposite lateral axes so shrubs
    // stay wider than tall without forming a radially symmetric circle.
    const baseAngle = i === 0
      ? 0.08 + (unitRandom(key, 11 + i) - 0.5) * 0.25
      : i === 1
        ? Math.PI + (unitRandom(key, 21 + i) - 0.5) * 0.28
        : i * golden + (unitRandom(key, 31 + i) - 0.5) * 0.48;
    angles.push(baseAngle);
  }
  return angles;
}

/**
 * Multi-stem basal coppice skeleton (never a single vertical tree trunk):
 * diverging curved primary canes split into secondary twigs at varied heights
 * and directions, creating irregular gaps and visible woody interior structure.
 */
function buildWoodyShrubData({
  key,
  stemCount,
  minHeight,
  maxHeight,
  spreadRadius,
  stemThickness,
  clusterRadius,
  subclustersPerNode,
}) {
  const stemParts = [];
  const leafNodes = [];
  const angles = rotatedSpreadAngles(key, stemCount);

  for (let i = 0; i < stemCount; i += 1) {
    const ch = 100 + i * 37;
    const azimuth = angles[i];
    const cosA = Math.cos(azimuth);
    const sinA = Math.sin(azimuth);

    // Vary reach and height sharply across stems for an irregular silhouette:
    // low sprawling canes vs steeper off-center crown shoots.
    const tier = (i + unitRandom(key, ch)) % 3;
    const reachScale = i < 2 ? 1.05 + i * 0.08 : 0.72 + tier * 0.22;
    const heightScale = i === 0
      ? 0.68
      : i === 1
        ? 0.92
        : 0.55 + unitRandom(key, ch + 1) * 0.55;
    const pitch = THREE.MathUtils.clamp(
      0.42 + (1 - heightScale * 0.55) * 0.65 + (unitRandom(key, ch + 2) - 0.5) * 0.22,
      0.38,
      1.18,
    );

    const caneLen = THREE.MathUtils.lerp(minHeight, maxHeight, unitRandom(key, ch + 3)) * heightScale / Math.cos(pitch * 0.72);
    const rootOffset = spreadRadius * (0.08 + unitRandom(key, ch + 4) * 0.09);
    const root = new THREE.Vector3(cosA * rootOffset, 0, sinA * rootOffset);

    const radialDir = new THREE.Vector3(cosA, 0, sinA);
    const tangentDir = new THREE.Vector3(-sinA, 0, cosA);

    // Lower segment rises outward at a steeper basal angle; upper bends slightly.
    const forkT = 0.48 + unitRandom(key, ch + 5) * 0.16;
    const leanMid = Math.sin(pitch * 0.85) * caneLen * forkT * reachScale;
    const riseMid = Math.cos(pitch * 0.75) * caneLen * forkT;
    const sway = (unitRandom(key, ch + 6) - 0.5) * 0.08 * spreadRadius;
    const forkPt = root.clone()
      .addScaledVector(radialDir, leanMid)
      .addScaledVector(tangentDir, sway);
    forkPt.y = Math.max(0.1, riseMid);

    const tipAz = azimuth + (unitRandom(key, ch + 7) - 0.5) * 0.45;
    const leanTip = Math.sin(pitch) * caneLen * (1 - forkT) * reachScale;
    const riseTip = Math.cos(pitch * 0.95) * caneLen * (1 - forkT);
    const tipPt = forkPt.clone()
      .add(new THREE.Vector3(Math.cos(tipAz) * leanTip, riseTip, Math.sin(tipAz) * leanTip));
    tipPt.y = Math.max(forkPt.y + 0.06, tipPt.y);

    stemParts.push(taperedSegmentGeometry(root, forkPt, stemThickness, stemThickness * 0.68, 4));
    stemParts.push(taperedSegmentGeometry(forkPt, tipPt, stemThickness * 0.68, stemThickness * 0.34, 4));

    const mainDir = new THREE.Vector3().subVectors(tipPt, forkPt).normalize();
    leafNodes.push({
      position: tipPt.clone(),
      dir: mainDir,
      radius: clusterRadius * (0.95 + unitRandom(key, ch + 8) * 0.38),
      count: subclustersPerNode,
      channel: 500 + i * 53,
    });

    // Fork 1 or 2 secondary twigs off the main stem at varied directions & heights.
    const twigCount = i % 2 === 0 ? 2 : 1;
    for (let t = 0; t < twigCount; t += 1) {
      const tCh = ch + 20 + t * 9;
      const sideSign = t === 0 ? 1 : -1;
      const anchor = forkPt.clone().lerp(tipPt, 0.15 + t * 0.38);
      const twigAz = azimuth + sideSign * (0.52 + unitRandom(key, tCh) * 0.58);
      const twigLen = caneLen * (0.34 + unitRandom(key, tCh + 1) * 0.22);
      const twigPitch = pitch + (t === 0 ? 0.25 : -0.18) + (unitRandom(key, tCh + 2) - 0.5) * 0.2;
      const twigEnd = anchor.clone().add(new THREE.Vector3(
        Math.cos(twigAz) * Math.sin(twigPitch) * twigLen * reachScale,
        Math.cos(twigPitch) * twigLen * (t === 0 ? 0.65 : 1.05),
        Math.sin(twigAz) * Math.sin(twigPitch) * twigLen * reachScale,
      ));
      twigEnd.y = Math.max(0.14, twigEnd.y);

      stemParts.push(taperedSegmentGeometry(anchor, twigEnd, stemThickness * 0.52, stemThickness * 0.22, 4));
      leafNodes.push({
        position: twigEnd,
        dir: new THREE.Vector3().subVectors(twigEnd, anchor).normalize(),
        radius: clusterRadius * (0.76 + unitRandom(key, tCh + 3) * 0.35),
        count: Math.max(2, subclustersPerNode - 1),
        channel: 900 + i * 71 + t * 29,
      });
    }
  }

  return { stemParts, leafNodes };
}

function foliageGroupingForNode({ key, node }) {
  const groupParts = [];
  const up = new THREE.Vector3(0, 1, 0);
  const lateral = new THREE.Vector3().crossVectors(node.dir, up);
  if (lateral.lengthSq() < 1e-4) lateral.set(1, 0, 0);
  lateral.normalize();
  const upOrtho = new THREE.Vector3().crossVectors(lateral, node.dir).normalize();

  for (let s = 0; s < node.count; s += 1) {
    const sc = node.channel + s * 13;
    const puff = distortRadially(
      new THREE.IcosahedronGeometry(0.5, 0),
      key,
      sc,
      0.24,
    );
    const puffScaleX = node.radius * (1.7 + unitRandom(key, sc + 1) * 0.65);
    const puffScaleY = node.radius * (1.2 + unitRandom(key, sc + 2) * 0.45);
    const puffScaleZ = node.radius * (1.55 + unitRandom(key, sc + 3) * 0.65);
    puff.scale(puffScaleX, puffScaleY, puffScaleZ);
    puff.rotateY(unitRandom(key, sc + 4) * Math.PI * 2);
    puff.rotateX((unitRandom(key, sc + 5) - 0.5) * 0.6);

    const forwardOffset = (s === 0 ? 0.1 : 0.22 + unitRandom(key, sc + 6) * 0.55) * node.radius;
    const sideOffset = (s === 0 ? 0 : (s % 2 === 1 ? 1 : -1) * (0.45 + unitRandom(key, sc + 7) * 0.55)) * node.radius;
    const liftOffset = (s === 0 ? 0.15 : (unitRandom(key, sc + 8) - 0.35) * 0.65) * node.radius;
    const pos = node.position.clone()
      .addScaledVector(node.dir, forwardOffset)
      .addScaledVector(lateral, sideOffset)
      .addScaledVector(upOrtho, liftOffset);
    pos.y = Math.max(node.radius * 0.42, pos.y);
    puff.translate(pos.x, pos.y, pos.z);
    groupParts.push(puff);
  }

  const groupGeo = finalizeGeometry(mergeParts(groupParts));
  // Soften normals toward the local branch grouping rather than a whole-bush sphere,
  // preserving deep facet separation between separate branch leaf clouds.
  spherifyNormals(groupGeo, {
    strength: CLUSTER_NORMAL_SPHERIFY,
    center: node.position,
  });
  return groupGeo;
}

function buildBranchedShrubParts({ key, archetype }) {
  const { stemParts, leafNodes } = buildWoodyShrubData({
    key,
    stemCount: archetype.stemCount,
    minHeight: archetype.minHeight,
    maxHeight: archetype.maxHeight,
    spreadRadius: archetype.spreadRadius,
    stemThickness: archetype.stemThickness,
    clusterRadius: archetype.clusterRadius,
    subclustersPerNode: archetype.subclustersPerNode,
  });
  const stemGeometry = finalizeGeometry(mergeParts(stemParts));
  const leafGroups = leafNodes.map((node) => foliageGroupingForNode({ key, node }));
  const leafGeometry = finalizeGeometry(mergeParts(leafGroups));
  return { stemGeometry, leafGeometry };
}

function createPinnaGeometry({
  length,
  width,
  vCup = 0.22,
}) {
  const halfBase = width * 0.5;
  const halfMid = width * 0.56;
  const xMid = length * 0.42;
  const liftMid = length * 0.05;
  const liftTip = length * 0.12;
  const cupBase = halfBase * vCup * 0.4;
  const cupMid = halfMid * vCup;

  // Two-quad tapered leaflet per side (4 triangles total) with slight upward V-cup
  // and forward arc, tapering cleanly to a fine tip.
  const positions = new Float32Array([
    0, cupBase * 0.1, -halfBase * 0.55,
    xMid, liftMid + cupMid, -halfMid,
    xMid, liftMid, 0,

    0, cupBase * 0.1, -halfBase * 0.55,
    xMid, liftMid, 0,
    0, 0, 0,

    0, 0, 0,
    xMid, liftMid, 0,
    xMid, liftMid + cupMid, halfMid,

    0, 0, 0,
    xMid, liftMid + cupMid, halfMid,
    0, cupBase * 0.1, halfBase * 0.55,

    xMid, liftMid + cupMid, -halfMid,
    length, liftTip, 0,
    xMid, liftMid, 0,

    xMid, liftMid, 0,
    length, liftTip, 0,
    xMid, liftMid + cupMid, halfMid,
  ]);
  const uvs = new Float32Array([
    0, 0, 0.5, 0, 0.5, 0.5,
    0, 0, 0.5, 0.5, 0, 0.5,
    0, 0.5, 0.5, 0.5, 0.5, 1,
    0, 0.5, 0.5, 1, 0, 1,
    0.5, 0, 1, 0.5, 0.5, 0.5,
    0.5, 0.5, 1, 0.5, 0.5, 1,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Naturally arching fern frond with a slender 4-segment central rachis stem,
 * angled lateral pinnae that grow progressively smaller toward the apex, and a
 * tapered pointed tip leaflet.
 */
function fernFrond({
  key,
  channel,
  length,
  maxWidth,
  azimuth,
  archTilt,
  droop,
}) {
  const stemParts = [];
  const leafParts = [];
  const rachisSegments = 4;
  const spinePts = [];

  for (let i = 0; i <= rachisSegments; i += 1) {
    const t = i / rachisSegments;
    const archCurve = Math.pow(t, 1.45);
    const horizontalDist = length * t * (0.28 + 0.72 * archTilt);
    const height = length * (
      t * (1.08 - archTilt * 0.52) * Math.sin(Math.PI * 0.52 * (1 - 0.38 * t))
      - droop * archCurve * archCurve
    );
    const bend = Math.sin(t * Math.PI) * length * 0.03 * (unitRandom(key, channel) - 0.5);
    spinePts.push(new THREE.Vector3(bend, Math.max(0.01 * t, height), horizontalDist));
  }

  for (let i = 0; i < rachisSegments; i += 1) {
    const t0 = i / rachisSegments;
    const t1 = (i + 1) / rachisSegments;
    const r0 = 0.011 * (1 - t0 * 0.72);
    const r1 = 0.011 * (1 - t1 * 0.78);
    stemParts.push(taperedSegmentGeometry(spinePts[i], spinePts[i + 1], r0, r1, 4));
  }

  const evalSpine = (t) => {
    const scaled = THREE.MathUtils.clamp(t, 0, 1) * rachisSegments;
    const idx = Math.min(rachisSegments - 1, Math.floor(scaled));
    const localT = scaled - idx;
    const pos = spinePts[idx].clone().lerp(spinePts[idx + 1], localT);
    const tangent = new THREE.Vector3().subVectors(spinePts[idx + 1], spinePts[idx]).normalize();
    return { pos, tangent };
  };

  // Paired leaflets progressively decreasing toward the tip.
  const pairCount = 7;
  for (let p = 0; p < pairCount; p += 1) {
    const t = 0.16 + (p / (pairCount - 1)) * 0.72;
    const { pos, tangent } = evalSpine(t);
    // Broadest in lower-mid third (~t=0.30), tapering steadily toward t=0.88.
    const envelope = Math.sin(Math.PI * Math.min(1, t * 1.28)) * Math.pow(Math.max(0.08, 1 - t * 0.88), 0.72);
    const pinnaLen = maxWidth * (0.28 + 1.05 * envelope);
    const pinnaWidth = maxWidth * (0.14 + 0.24 * envelope);

    const frameQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent);
    for (const side of [-1, 1]) {
      const leaflet = createPinnaGeometry({ length: pinnaLen, width: pinnaWidth });
      // Yaw forward toward tip (+38 deg from perpendicular) and cup upward slightly.
      leaflet.rotateZ(0.18 - t * 0.12);
      leaflet.rotateY(side * (Math.PI * 0.5 - 0.56));
      leaflet.applyQuaternion(frameQuat);
      leaflet.translate(pos.x, pos.y, pos.z);
      leafParts.push(leaflet);
    }
  }

  // Tapered terminal apex leaflet extending from t=0.86 to frond tip.
  const tipStart = evalSpine(0.86);
  const tipLen = length * 0.19;
  const tipLeaflet = createPinnaGeometry({ length: tipLen, width: maxWidth * 0.24, vCup: 0.15 });
  const tipQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), tipStart.tangent);
  tipLeaflet.applyQuaternion(tipQuat);
  tipLeaflet.translate(tipStart.pos.x, tipStart.pos.y, tipStart.pos.z);
  leafParts.push(tipLeaflet);

  const rotateFrond = (geo) => {
    geo.rotateY(azimuth);
    return geo;
  };
  return {
    stemParts: stemParts.map(rotateFrond),
    leafParts: leafParts.map(rotateFrond),
  };
}

function buildFernParts({ key, archetype }) {
  const stemParts = [];
  const leafParts = [];
  const golden = 2.3999632;

  for (let i = 0; i < archetype.fronds; i += 1) {
    const ch = 200 + i * 19;
    // Asymmetric multi-tier rosette: inner upright young fronds, mid arching, outer low spreading.
    const tier = i < 3 ? 0 : i < 7 ? 1 : 2;
    const lenFactor = tier === 0
      ? 0.62 + unitRandom(key, ch) * 0.18
      : tier === 1
        ? 0.92 + unitRandom(key, ch) * 0.22
        : 0.78 + unitRandom(key, ch) * 0.24;
    const archTilt = tier === 0 ? 0.34 : tier === 1 ? 0.68 : 0.94;
    const droop = tier === 0 ? 0.06 : tier === 1 ? 0.22 : 0.34;
    const azimuth = i * golden + (unitRandom(key, ch + 1) - 0.5) * 0.42;

    const frond = fernFrond({
      key,
      channel: ch + 2,
      length: archetype.length * lenFactor,
      maxWidth: archetype.width * (0.82 + unitRandom(key, ch + 3) * 0.28),
      azimuth,
      archTilt,
      droop,
    });
    stemParts.push(...frond.stemParts);
    leafParts.push(...frond.leafParts);
  }

  return {
    stemGeometry: finalizeGeometry(mergeParts(stemParts)),
    leafGeometry: finalizeGeometry(mergeParts(leafParts)),
  };
}

const BUSH_ARCHETYPES = Object.freeze({
  bush_dome: Object.freeze({
    kind: 'shrub',
    stemCount: 6,
    minHeight: 0.72,
    maxHeight: 0.98,
    spreadRadius: 0.78,
    stemThickness: 0.036,
    clusterRadius: 0.16,
    subclustersPerNode: 3,
  }),
  bush_dome_small: Object.freeze({
    kind: 'shrub',
    stemCount: 5,
    minHeight: 0.48,
    maxHeight: 0.68,
    spreadRadius: 0.52,
    stemThickness: 0.028,
    clusterRadius: 0.125,
    subclustersPerNode: 2,
  }),
  bush_dome_wide: Object.freeze({
    kind: 'shrub',
    stemCount: 7,
    minHeight: 0.62,
    maxHeight: 0.88,
    spreadRadius: 0.96,
    stemThickness: 0.036,
    clusterRadius: 0.16,
    subclustersPerNode: 2,
  }),
  fern_tuft: Object.freeze({
    kind: 'fern',
    fronds: 10,
    length: 0.78,
    width: 0.28,
  }),
});

export const FOREST_BUSH_PROTOTYPES = Object.freeze([
  'bush_dome',
  'bush_dome_small',
  'bush_dome_wide',
]);

/** Optional fern tuft for denser understory floors; opt-in via prototype list. */
export const FOREST_UNDERSTORY_PROTOTYPES = Object.freeze([
  ...FOREST_BUSH_PROTOTYPES,
  'fern_tuft',
]);

function paintPartColors(geometry, key, { isStem, bounds }) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(positions.count * 3);
  const height = Math.max(Number.EPSILON, bounds.max.y - bounds.min.y);

  for (let index = 0; index < positions.count; index += 1) {
    const normalizedHeight = (positions.getY(index) - bounds.min.y) / height;
    const upwardLight = Math.max(0, normals.getY(index));
    const noise = (unitRandom(key, (isStem ? 2000 : 4000) + index) - 0.5) * 0.10;
    if (isStem) {
      const shade = THREE.MathUtils.clamp(
        0.42 + normalizedHeight * 0.14 + noise * 0.6,
        0.38,
        0.58,
      );
      colors[index * 3] = shade * 1.06;
      colors[index * 3 + 1] = shade * 0.90;
      colors[index * 3 + 2] = shade * 0.72;
    } else {
      const intensity = THREE.MathUtils.clamp(
        0.72 + normalizedHeight * 0.28 + upwardLight * 0.12 + noise,
        0.66,
        1.14,
      );
      colors[index * 3] = intensity * 0.92;
      colors[index * 3 + 1] = intensity * 1.06;
      colors[index * 3 + 2] = intensity * 0.94;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function assembleShrubOrFern({ prototypeId, stemGeometry, leafGeometry }) {
  const stemBox = new THREE.Box3().setFromBufferAttribute(stemGeometry.getAttribute('position'));
  const leafBox = new THREE.Box3().setFromBufferAttribute(leafGeometry.getAttribute('position'));
  const totalBox = stemBox.union(leafBox);
  const minY = totalBox.min.y;

  stemGeometry.translate(0, -minY, 0);
  leafGeometry.translate(0, -minY, 0);
  totalBox.translate(new THREE.Vector3(0, -minY, 0));

  paintPartColors(stemGeometry, prototypeId, { isStem: true, bounds: totalBox });
  paintPartColors(leafGeometry, prototypeId, { isStem: false, bounds: totalBox });

  const geometry = mergeGeometries([stemGeometry, leafGeometry], false);
  stemGeometry.dispose();
  leafGeometry.dispose();
  finalizeGeometry(geometry);
  return geometry;
}

export function createBushPrototypeGeometry(prototypeId) {
  const archetype = BUSH_ARCHETYPES[prototypeId];
  if (!archetype) {
    throw new Error(`No bush archetype is defined for "${prototypeId}".`);
  }
  const { stemGeometry, leafGeometry } = archetype.kind === 'shrub'
    ? buildBranchedShrubParts({ key: prototypeId, archetype })
    : buildFernParts({ key: prototypeId, archetype });

  const geometry = assembleShrubOrFern({ prototypeId, stemGeometry, leafGeometry });
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  return {
    prototypeId,
    doubleSided: archetype.kind === 'fern',
    height: size.y,
    width: Math.max(size.x, size.z),
    geometry,
  };
}

export function createForestBushPrototypeGeometry(
  prototypeIds = FOREST_BUSH_PROTOTYPES,
) {
  return prototypeIds.map((prototypeId) => createBushPrototypeGeometry(prototypeId));
}
