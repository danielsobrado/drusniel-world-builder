import { attribute } from 'three/tsl';

// The shader-side vertex conform moved to the declarative WSC deformer
// (`worldSurfaceContext/GroundContactDeformer.js`, WSC PR 5).

/**
 * Computes a gentle footprint-settled height and partial slope normal from 5
 * terrain samples (zero extra lookups when called on rock/bush placement).
 */
export function fitFootprintToGround({
  x,
  z,
  reach,
  heightAt,
  sinkShare = 0.65,
  bury = 0.03,
  tiltShare = 0,
  maxTiltSin = 0.45,
}) {
  const r = Math.max(0.25, Number(reach) || 0.25);
  const hC = heightAt(x, z);
  const hE = heightAt(x + r, z);
  const hW = heightAt(x - r, z);
  const hS = heightAt(x, z + r);
  const hN = heightAt(x, z - r);
  if (![hC, hE, hW, hS, hN].every(Number.isFinite)) return null;
  const low = Math.min(hC, hE, hW, hS, hN);
  const high = Math.max(hC, hE, hW, hS, hN);
  const slopeX = (hE - hW) / (2 * r);
  const slopeZ = (hS - hN) / (2 * r);
  let normal = null;
  if (tiltShare > 0) {
    let nx = -slopeX * tiltShare;
    let nz = -slopeZ * tiltShare;
    const horiz = Math.hypot(nx, nz);
    const maxHoriz = maxTiltSin / Math.sqrt(Math.max(1e-4, 1 - maxTiltSin * maxTiltSin));
    if (horiz > maxHoriz && horiz > 1e-6) {
      const k = maxHoriz / horiz;
      nx *= k;
      nz *= k;
    }
    const len = Math.hypot(nx, 1, nz);
    normal = [nx / len, 1 / len, nz / len];
  }
  return {
    height: hC - (hC - low) * sinkShare - bury,
    low,
    high,
    slopeX,
    slopeZ,
    normal,
  };
}

/** Helper to read `instancePlantRoot` only when a material declared it. */
export function plantRootAttribute(material) {
  return material?.userData?.plantMotionAnchor ? attribute('instancePlantRoot', 'vec3') : null;
}
