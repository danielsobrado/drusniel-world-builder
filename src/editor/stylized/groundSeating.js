import { attribute, clamp, float, modelWorldMatrix, positionGeometry, smoothstep, vec3, vec4 } from 'three/tsl';
import { frameUniform } from '../../render/FrameUniforms.js';
import { sampleGroundContactAt } from './groundContact/GroundContactState.js';

/**
 * Pure-shader vertex ground conforming for standing bushes, ferns, and ground
 * details: lower vertices hug the exact terrain height from `GroundContactField`
 * (even across slopes, humps, and hollows) while upper foliage stays upright.
 *
 * Uses `frameUniform` for height so prototypes share one compiled WGSL pipeline,
 * zero CPU terrain queries, zero readbacks, and zero extra vertex buffers.
 *
 * @param {object} positionNode post-wind local vertex position node
 * @param {object} options
 * @param {number} options.height prototype height in local metres
 * @param {object | null} [options.rootNode] local root position (`instancePlantRoot`)
 * @param {number} [options.conformShare] fraction of height over which conforming fades out
 * @param {number} [options.bury] subtle downward ground tuck in metres
 * @param {number} [options.maxOffset] clamp on vertical terrain conformance in metres
 */
export function applyShaderGroundConform(positionNode, {
  height = 1,
  rootNode = null,
  conformShare = 0.55,
  bury = 0.03,
  maxOffset = 0.65,
} = {}) {
  const conformHeight = frameUniform(Math.max(0.12, Number(height) * conformShare));
  const weight = smoothstep(0, conformHeight, positionGeometry.y).oneMinus();
  const vertexWorld = modelWorldMatrix.mul(vec4(positionNode, 1));
  const vertexGround = sampleGroundContactAt(vertexWorld.xz, { includeBase: false, includeEco: false });
  if (rootNode) {
    const rootWorld = modelWorldMatrix.mul(vec4(rootNode, 1));
    const rootGround = sampleGroundContactAt(rootWorld.xz, { includeBase: false, includeEco: false });
    const active = vertexGround.inside.mul(rootGround.inside);
    const delta = clamp(vertexGround.height.sub(rootGround.height), -maxOffset, maxOffset);
    const dy = delta.sub(float(bury)).mul(weight).mul(active);
    return positionNode.add(vec3(0, dy, 0));
  }
  const dy = float(bury).negate().mul(weight).mul(vertexGround.inside);
  return positionNode.add(vec3(0, dy, 0));
}

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
