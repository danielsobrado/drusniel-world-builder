import * as THREE from 'three/webgpu';
import { fitFootprintToGround } from './groundSeating.js';

const BUSH_UP = new THREE.Vector3(0, 1, 0);
const BUSH_SCRATCH = {
  position: new THREE.Vector3(),
  yawQuat: new THREE.Quaternion(),
  leanQuat: new THREE.Quaternion(),
  slopeQuat: new THREE.Quaternion(),
  quaternion: new THREE.Quaternion(),
  normal: new THREE.Vector3(),
  leanAxis: new THREE.Vector3(),
  scale: new THREE.Vector3(),
};

/** Max fractional XZ spread variation; Y compensates inversely to keep crown volume balanced. */
export const BUSH_ASPECT_VARIATION = 0.13;
/** Max organic lean off vertical in radians (~4°), independent of terrain slope. */
export const BUSH_ORGANIC_LEAN_RAD = 0.07;
/** Max warm/cool per-instance RGB shift folded into `instanceBiomeLook` (zero shader cost). */
export const BUSH_HUE_SHIFT = 0.055;

/** Deterministic [0, 1) hash from placement coordinates and salt (allocation-free). */
export function bushVariationHash(x, z, salt = 0) {
  const xi = Math.imul(Math.floor(x * 13.37), 374761393);
  const zi = Math.imul(Math.floor(z * 17.89), 668265263);
  const si = Math.imul(Math.floor(salt * 9973), 2147483647);
  let h = (xi ^ zi ^ si) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * Seats an accepted bush on sloped terrain: sinks roots slightly downhill so no
 * cane hovers, and computes a gentle 24% ground-normal tilt capped near 16°.
 */
export function fitBushToGround(placement, radius, heightAt) {
  if (typeof heightAt !== 'function') return null;
  const reach = Math.max(0.35, radius * (placement.scale ?? 1) * 0.55);
  const fit = fitFootprintToGround({
    x: placement.x,
    z: placement.z,
    reach,
    heightAt,
    sinkShare: 0.35,
    bury: 0.02,
    tiltShare: 0.24,
    maxTiltSin: 0.28,
  });
  if (!fit) return null;
  return {
    groundFitHeight: fit.height,
    groundNormal: fit.normal ? Object.freeze(fit.normal) : null,
  };
}

/**
 * Deterministic instance matrix with non-uniform XZ/Y proportion variation,
 * subtle organic lean, and gentle terrain-slope seating.
 */
export function composeBushMatrix(placement) {
  const baseScale = placement.scale ?? 1;
  const aspectDelta = (bushVariationHash(placement.x, placement.z, 11 + (placement.priority ?? 0)) * 2 - 1)
    * BUSH_ASPECT_VARIATION;
  const xzScale = baseScale * (1 + aspectDelta);
  const yScale = baseScale * (1 - aspectDelta * 0.85);

  BUSH_SCRATCH.yawQuat.setFromAxisAngle(BUSH_UP, placement.rotationY ?? 0);

  const leanAngle = bushVariationHash(placement.x, placement.z, 23 + (placement.priority ?? 0)) * BUSH_ORGANIC_LEAN_RAD;
  const leanAz = bushVariationHash(placement.x, placement.z, 37 + (placement.priority ?? 0)) * Math.PI * 2;
  BUSH_SCRATCH.leanAxis.set(Math.cos(leanAz), 0, Math.sin(leanAz));
  BUSH_SCRATCH.leanQuat.setFromAxisAngle(BUSH_SCRATCH.leanAxis, leanAngle);

  BUSH_SCRATCH.quaternion.copy(BUSH_SCRATCH.leanQuat).multiply(BUSH_SCRATCH.yawQuat);

  const gn = placement.groundNormal;
  if (gn && gn.length === 3) {
    BUSH_SCRATCH.normal.set(gn[0], gn[1], gn[2]).normalize();
    BUSH_SCRATCH.slopeQuat.setFromUnitVectors(BUSH_UP, BUSH_SCRATCH.normal);
    BUSH_SCRATCH.quaternion.premultiply(BUSH_SCRATCH.slopeQuat);
  }

  return new THREE.Matrix4().compose(
    BUSH_SCRATCH.position.set(placement.x, placement.groundFitHeight ?? placement.height, placement.z),
    BUSH_SCRATCH.quaternion,
    BUSH_SCRATCH.scale.set(xzScale, yScale, xzScale),
  );
}

/**
 * Subtle warm/cool botanical hue variation folded into the instance's packed
 * `[r, g, b, w]` biome look. Leaves `w` (saturation + snow steps) intact.
 */
export function varyBushBiomeLook(baseLook, placement) {
  if (!baseLook || baseLook.length < 4) return baseLook;
  const warmth = (bushVariationHash(placement.x, placement.z, 53 + (placement.priority ?? 0)) * 2 - 1)
    * BUSH_HUE_SHIFT;
  return new Float32Array([
    baseLook[0] * (1 + warmth),
    baseLook[1] * (1 + warmth * 0.25),
    baseLook[2] * (1 - warmth * 0.85),
    baseLook[3],
  ]);
}
