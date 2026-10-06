import {
  dot,
  float,
  fwidth,
  length,
  max,
  oneMinus,
  smoothstep,
  texture,
  vec2,
} from 'three/tsl';
import { getWaterfallStrandTexture } from './waterfallStrandTexture.js';
import { getWaterDetailTexture } from './RiverSurfaceShading.js';

/** Half-width of the threshold band that turns strand detail into whitewater. */
const STRAND_EDGE = 0.08;
const CHURN_EDGE = 0.12;

/**
 * Strands are centimetre-scale texture detail (a 10 m tile over 256 texels), so
 * their coordinates never come from raw canonical metres: on a planet-scale
 * world float32 steps those by a quarter to half a metre, eight or more
 * texels, and the strands stair-step. Instead a water chunk's centre is wrapped
 * to this period in double precision (`waterfallPatternOrigin`) and the shader
 * adds only the chunk-local offset, which keeps every coordinate below 2^17 m
 * and within a centimetre.
 *
 * Where a wrap falls between two chunks the pattern shifts once. The period is
 * a whole number of the default strand and churn tiles (10 m and 4 m, 12 m and
 * 3 m) and of the chunk, so a fall flowing along an axis carries straight over
 * it; any other one shows a seam there, one line every 123 km.
 */
export const WATERFALL_PATTERN_PERIOD_METERS = 122_880;

function wrapPattern(value) {
  const period = WATERFALL_PATTERN_PERIOD_METERS;
  return value - Math.floor(value / period) * period;
}

/**
 * A water chunk's pattern origin: its canonical centre wrapped to the pattern
 * period, computed here in double precision for the chunk's uniform.
 */
export function waterfallPatternOrigin(centerX, centerZ) {
  return [wrapPattern(centerX), wrapPattern(centerZ)];
}

/**
 * Whitewater on a river fall and the churn in its plunge pool.
 *
 * A fall here is the water sheet itself stepping down across the face (see
 * RiverFalls), so there is no separate waterfall mesh: the sheet's own flow
 * gives the fall a direction, the strand texture streaks along it and
 * scrolls at `fallSpeed`, and the flow texture's fall weight decides how much
 * of it turns white. Below the face the plunge weight whitens slow, drifting
 * patches instead. Two strand samples and two samples of the shared river
 * detail texture, built only into materials that draw foam.
 *
 * @param {object} options
 * @param {object} options.fallPlunge vec2 node: fall and plunge weights, 0..1
 * @param {object} options.flow vec2 node: the current, any length
 * @param {object} options.patternXZ vec2 node: metres on canonical axes, from the
 *   chunk's `waterfallPatternOrigin` plus its local offset
 * @param {object} options.time seconds uniform
 * @param {object} options.config `stylizedSurface.water.waterfall`
 * @returns {object} foam amount node, 0..1
 */
export function createWaterfallFoamNode({ fallPlunge, flow, patternXZ, time, config }) {
  const strandTexture = getWaterfallStrandTexture();
  const direction = flow.div(max(length(flow), 1e-4));
  const along = dot(patternXZ, direction);
  const across = dot(patternXZ, vec2(direction.y.negate(), direction.x));

  const fall = fallPlunge.x;
  const face = texture(strandTexture, vec2(
    across.div(config.strandWidthMeters),
    along.sub(time.mul(config.fallSpeed)).div(config.strandLengthMeters),
  ));
  const sheets = texture(strandTexture, vec2(
    across.div(config.strandWidthMeters).mul(0.5).add(0.37),
    along.sub(time.mul(config.fallSpeed * 0.8)).div(config.strandLengthMeters).mul(0.5).add(0.53),
  ));
  const faceDetail = face.r.mul(0.6).add(sheets.g.mul(0.4));
  const thickness = sheets.b.mul(0.7).add(0.55);
  const faceThreshold = oneMinus(fall.mul(config.faceCoverage).mul(thickness).clamp(0, 1));
  const strandEdge = max(float(STRAND_EDGE), fwidth(faceDetail));
  const strands = smoothstep(
    faceThreshold.sub(strandEdge),
    faceThreshold.add(strandEdge),
    faceDetail,
  ).mul(smoothstep(0, 0.2, fall));
  const veil = smoothstep(0.15, 0.85, sheets.g).mul(fall).mul(config.faceAeration);
  const faceFoam = max(strands, veil);

  const plunge = fallPlunge.y;
  const churnScale = float(config.plungeScaleMeters);
  const churnUv = vec2(
    across.div(churnScale),
    along.sub(time.mul(config.plungeSpeed)).div(churnScale),
  );
  // The strand texture's B channel is broad coverage variation, not bubbles.
  // Two moving octaves of the river's isotropic noise break the pool into
  // small patches with clear water between them as the plunge dissipates.
  const detail = getWaterDetailTexture();
  const churn = texture(detail, churnUv).b.mul(0.55).add(texture(detail,
    vec2(across.div(churnScale).mul(2).add(0.3),
      along.sub(time.mul(config.plungeSpeed * 0.7)).div(churnScale).mul(2).add(0.6)),
  ).b.mul(0.45));
  const churnThreshold = oneMinus(plunge.mul(config.plungeCoverage));
  const churnEdge = max(float(CHURN_EDGE), fwidth(churn));
  const plungeFoam = smoothstep(
    churnThreshold.sub(churnEdge),
    churnThreshold.add(churnEdge),
    churn,
  ).mul(smoothstep(0, 0.15, plunge));

  return max(faceFoam, plungeFoam);
}
