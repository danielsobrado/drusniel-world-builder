import { Fn, If, clamp, dot, float, modelWorldMatrix, positionGeometry, smoothstep, vec3, vec4 } from 'three/tsl';
import { frameUniform } from '../../../render/FrameUniforms.js';
import { sampleWorldSurfaceContextAt } from './WorldSurfaceContextState.js';
import { resolveContactProfile, worldSurfaceContactConfig } from './WorldSurfaceContactConfig.js';

const GEO_ONLY = Object.freeze({ includeBase: false, includeEco: false });
/** Floor on the root normal's Y so a cliff-edge texel cannot blow the plane slope up. */
const MIN_NORMAL_Y = 0.2;

/** Conform band in prototype metres above the ground line. */
export function conformBandMeters(conform, height = 0) {
  return Math.max(conform.minBandMeters, Math.max(0, Number(height) || 0) * conform.bandShare);
}

/**
 * Declarative WSC ground-contact vertex morph (PR 5; evolves `groundSeating`'s
 * shader conform). Lower vertices of an instanced prototype are moved vertically
 * by the profile's `conform` mode (see `WSC_CONFORM_MODES`); the morph fades out
 * over the profile band, is clamped to `maxOffsetMeters`, and is gated by WSC
 * validity at both the vertex and the root, so unloaded slots never pull a base.
 *
 * It lives in `positionNode`, which three's shadow override copies, so shadow
 * depth matches the drawn surface. PR 4's contact blend reads `positionWorld`
 * after this morph, so material and geometry agree on the ground line.
 *
 * @param {object} positionNode post-instance local position node
 * @param {object} options
 * @param {string | object} options.profile WSC contact profile name or override
 * @param {number} [options.height] prototype height (scales `bandShare`)
 * @param {number} [options.groundY] prototype ground line in geometry units
 * @param {object | null} [options.rootNode] post-instance root (`instancePlantRoot`)
 * @param {object} [options.config] resolved `worldSurfaceContext.contact`
 */
export function applyGroundContactDeform(positionNode, {
  profile,
  height = 0,
  groundY = 0,
  rootNode = null,
  config = worldSurfaceContactConfig(),
} = {}) {
  const cfg = config ?? worldSurfaceContactConfig();
  const conform = resolveContactProfile(profile, cfg).conform;
  if (!cfg.enabled || !conform.enabled) return positionNode;
  // A uniform, so prototypes of one profile share a compiled pipeline.
  const band = frameUniform(conformBandMeters(conform, height));
  const weight = smoothstep(0, band, positionGeometry.y.sub(groundY)).oneMinus();
  if (!rootNode) {
    // Without a root only the plain bury of `hug` is defined.
    if (conform.mode !== 'hug' || conform.buryMeters === 0) return positionNode;
    const vertexGround = sampleWorldSurfaceContextAt(modelWorldMatrix.mul(vec4(positionNode, 1)).xz, GEO_ONLY);
    return positionNode.add(vec3(0, float(-conform.buryMeters).mul(weight).mul(vertexGround.validity), 0));
  }
  const max = conform.maxOffsetMeters;
  return Fn(() => {
    // Hoisted so a wind/sway position is not first emitted inside the branch scope.
    const position = vec3(positionNode).toVar('groundContactDeformPosition');
    const dy = float(0).toVar('groundContactDeformDy');
    // Only band vertices pay for the two WSC fetches; most of a boulder or plant is above it.
    If(weight.greaterThan(0), () => {
      const vertexWorld = modelWorldMatrix.mul(vec4(position, 1));
      const rootWorld = modelWorldMatrix.mul(vec4(rootNode, 1));
      const vertexGround = sampleWorldSurfaceContextAt(vertexWorld.xz, GEO_ONLY);
      const rootGround = sampleWorldSurfaceContextAt(rootWorld.xz, GEO_ONLY);
      let delta;
      if (conform.mode === 'hug') {
        delta = clamp(vertexGround.height.sub(rootGround.height), -max, max);
      } else {
        const n = rootGround.normal;
        const gradient = n.xz.div(n.y.max(MIN_NORMAL_Y)).negate();
        const plane = rootGround.height.add(dot(gradient, vertexWorld.xz.sub(rootWorld.xz)));
        delta = clamp(vertexGround.height.sub(plane), -max, 0);
      }
      const active = vertexGround.validity.mul(rootGround.validity);
      dy.assign(delta.sub(conform.buryMeters).mul(weight).mul(active));
    });
    return position.add(vec3(0, dy, 0));
  })();
}

/**
 * CPU mirror of `applyGroundContactDeform`'s vertical offset, for tests and
 * diagnostics. Heights in metres; `normal` is the WSC terrain normal at the root.
 */
export function groundContactDeformOffset({
  conform, vertexHeight, rootHeight, normal = [0, 1, 0], dx = 0, dz = 0,
  localY = 0, groundY = 0, height = 0, validity = 1,
}) {
  if (!conform.enabled) return 0;
  const band = conformBandMeters(conform, height);
  const t = Math.min(1, Math.max(0, (localY - groundY) / band));
  const weight = 1 - t * t * (3 - 2 * t);
  const max = conform.maxOffsetMeters;
  let delta;
  if (conform.mode === 'hug') {
    delta = Math.min(max, Math.max(-max, vertexHeight - rootHeight));
  } else {
    const ny = Math.max(MIN_NORMAL_Y, normal[1]);
    const plane = rootHeight - (normal[0] / ny) * dx - (normal[2] / ny) * dz;
    delta = Math.min(0, Math.max(-max, vertexHeight - plane));
  }
  return (delta - conform.buryMeters) * weight * validity;
}
