import {
  Fn,
  If,
  abs,
  attribute,
  cameraPosition,
  clamp,
  cos,
  exp,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  oneMinus,
  positionLocal,
  pow,
  sin,
  smoothstep,
  sqrt,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

import { sampleWorldWindCanonical } from '../../weather/wind/worldWindState.js';
import { groundDeformationNode } from '../deformation/groundDeformationNode.js';
import { stylizedDirtMask, stylizedPathWearMask } from '../StylizedNoiseNodes.js';
import { MEADOW_BLADE_SHAPE_TUNING, MEADOW_SHAPE_COUNT } from './meadowGrassShapes.js';
import { MAX_MEADOW_PALETTES } from './meadowPalettes.js';
import { MEADOW_MAX_BODY_BEND } from './meadowInteractionBend.js';
import { meadowGrowthNodes } from './meadowGrowthNodes.js';
import { meadowBentNormalNode, meadowBladeWorldNormal } from './meadowBladeNormals.js';
import { meadowTipFlutterNode, meadowWindFrontNodes } from './meadowWindNodes.js';
import { sampleGroundContactAt } from '../groundContact/GroundContactState.js';

const HALF_PI = Math.PI * 0.5;
const HIDDEN = 1e9;
/** The donor's hash and its guard for a degenerate fold direction. */
/** Donor units per metre, the conversion meadowGrassConfig's defaults were built on. */

/**
 * The instance inputs every meadow stage reads. Each call builds fresh nodes:
 * TSL emits a shared node where it is first built, so one first used inside an
 * `If` would leave every later reader an unassigned variable.
 */
export function meadowInstance(originUniform, { cards = false } = {}) {
  const position = attribute('instancePosition', 'vec4');
  const publication = attribute('instanceTile', 'vec4');
  const tile = publication.xy;
  const data = attribute('instanceData', 'vec4');
  const base = vec3(tile.x.add(position.x), position.y, tile.y.add(position.z));
  // The look code: shape + 3 × (palette + MAX_MEADOW_PALETTES × growth).
  const code = cards ? floor(data.x.div(4)) : floor(data.x);
  const combined = floor(code.div(MEADOW_SHAPE_COUNT));
  const growth = floor(combined.div(MAX_MEADOW_PALETTES));
  const palette = combined.mod(MAX_MEADOW_PALETTES);
  const shape = code.mod(MEADOW_SHAPE_COUNT);
  return {
    base,
    tile,
    revealTime: publication.z,
    revealRank: publication.w,
    local: position.xz,
    canonical: base.xz.add(originUniform),
    strength: position.w,
    rotation: attribute('instanceRotation', 'vec2'),
    // Blades: look code + path mask in the fraction. Cards: look code × 4 +
    // variant; `cell` is the atlas cell, shape × 4 + variant, palette peeled off.
    shape,
    palette,
    growth,
    cell: cards ? shape.mul(4).add(data.x.mod(4)) : float(0),
    path: cards ? float(0) : fract(data.x),
    rank: data.y,
    phase: data.z,
    variation: data.w,
  };
}

/**
 * Footprint depth under a stem (groundDeformationNode), addressed from the tile's
 * exact whole-metre corner: tile centres sit on whole metres, so rounding the
 * float32 render + origin sum recovers them exactly at planet scale.
 */
export function meadowTrodden(blade, originUniform, tileSize) {
  const half = tileSize / 2;
  const center = blade.tile.add(originUniform).round();
  const corner = vec2(center.x.sub(half), center.y.negate().sub(half));
  return groundDeformationNode(corner, vec2(blade.local.x.add(half), blade.local.y.negate().add(half)));
}

/** The silhouette's half-width factor at height ratio r (meadowGrassShapes.js, in TSL). */
function silhouette(shape, primaryShape, r, taperSeed) {
  const t = MEADOW_BLADE_SHAPE_TUNING;
  const slender = pow(oneMinus(r), mix(float(t.slenderTaperMin), float(t.slenderTaperMax), taperSeed));
  // Slender-biome tall reed accents read as delicate stalks with fusiform seed heads;
  // wetland primary reeds keep their upright sedge silhouette with varied taper.
  const stalk = mix(float(t.seedHeadStalkBase), float(t.seedHeadStalkTop), r);
  const seedPeak = mix(float(t.seedHeadPeakMin), float(t.seedHeadPeakMax), taperSeed);
  const seedDist = r.sub(seedPeak).div(t.seedHeadSpread);
  const seedHeadBody = exp(seedDist.mul(seedDist).negate())
    .mul(mix(float(t.seedHeadWidthMin), float(t.seedHeadWidthMax), taperSeed));
  const seedTipFade = oneMinus(r.sub(0.90).div(0.10).clamp(0, 1));
  const seedHead = stalk.add(seedHeadBody).mul(seedTipFade.mul(0.8).add(0.2));
  const wetReed = oneMinus(pow(r, mix(float(4.2), float(5.8), taperSeed)))
    .mul(mix(float(0.50), float(0.58), taperSeed));
  const reed = primaryShape.lessThan(0.5).select(seedHead, wetReed);

  const broadleafTip = pow(oneMinus(r.mul(0.22)), mix(float(1.05), float(1.38), taperSeed));
  const broadleaf = sqrt(max(float(0), oneMinus(r.mul(r)))).mul(broadleafTip).mul(0.85);

  // Accent-only silhouettes (MEADOW_PLANT_SHAPES): a fine stalked leaf and a supple strap.
  const leafPeak = mix(float(t.fineLeafPeakMin), float(t.fineLeafPeakMax), taperSeed);
  const leafRise = r.div(leafPeak.max(0.05)).clamp(0, 1);
  const leafFall = oneMinus(r).div(oneMinus(leafPeak).max(0.05)).clamp(0, 1);
  const leafBody = pow(leafRise, 0.72)
    .mul(pow(leafFall, t.fineLeafTipPower))
    .mul(mix(float(t.fineLeafWidthMin), float(t.fineLeafWidthMax), taperSeed));
  const petiole = float(t.fineLeafBaseWidth).mul(oneMinus(r));
  const lance = max(petiole, leafBody);

  const strap = oneMinus(pow(r, mix(float(2.2), float(3.6), taperSeed)))
    .mul(mix(float(0.56), float(0.72), taperSeed));
  return shape.lessThan(0.5).select(slender, shape.lessThan(1.5).select(reed,
    shape.lessThan(2.5).select(broadleaf, shape.lessThan(3.5).select(lance, strap))));
}

/**
 * Stems a band retires across its width, by rank (the donor's `#lodCoverage`).
 * `bands` is a uniformArray of vec4 (end, count, next count, window). A stem
 * ranked in a band's retiring range fades out as the band's phase passes its
 * order, and the survivors widen by the share already retired (capped), so the
 * count drops without the meadow going bald.
 */
function lodCoverage({ bands, bandCount, distance, rank, appearance, ratio }) {
  const coverage = float(1).toVar();
  const standing = bands.element(bandCount - 1).z.toVar();
  const targets = attribute('bladeProfile', 'vec4').yzw;
  for (let index = 0; index < bandCount; index += 1) {
    const band = bands.element(index);
    const progress = smoothstep(band.x.sub(band.w), band.x, distance).toVar();
    if (index < 3) ratio.assign(mix(ratio, targets.element(index), progress));
    const phase = progress.mul(1.2).toVar();
    standing.addAssign(band.y.sub(band.z).mul(float(1.1).sub(phase).clamp(0, 1)));
    If(rank.greaterThanEqual(band.z).and(rank.lessThan(band.y)), () => {
      const order = band.y.sub(rank).div(band.y.sub(band.z).max(1));
      coverage.assign(float(1).sub(smoothstep(order, order.add(0.2), phase)));
    });
  }
  const widen = min(
    mix(float(1), bands.element(0).y.div(standing.max(1)), appearance.lodCompensation),
    max(appearance.lodWidenMax, float(1)),
  );
  return {
    coverage,
    width: mix(float(1), coverage, appearance.lodThinning).mul(widen),
    shrink: mix(coverage, float(1), appearance.lodThinning),
  };
}

/**
 * The player's body pressing the meadow over (grass-test's `#sampleInteractionBlade`).
 * A blade folds in a direction hashed from its own base — stable per blade and
 * scattered across the trail, *not* radial from the body — and stands back up as the
 * stamp decays behind the player. Read from the interaction map's render-space
 * window, so it needs no floating-origin conversion.
 *
 * The donor adds the arc to a unit-local blade of 1.5 units and scales it by the
 * blade's width afterwards; in metres that is exactly `bladeHeight × width`, with the
 * height read in donor units. The arc itself is the donor's, unchanged.
 */
function pressAt(base, map) {
  const windowUv = base.xz.sub(map.center).div(map.worldSize).add(0.5);
  let inside = windowUv.x.greaterThanEqual(0).and(windowUv.x.lessThanEqual(1))
    .and(windowUv.y.greaterThanEqual(0)).and(windowUv.y.lessThanEqual(1));
  // The spell map is read only while a spell has ink in it.
  if (map.active) inside = inside.and(map.active.greaterThan(0));
  const press = float(0).toVar();
  If(inside, () => {
    press.assign(texture(map.texture, windowUv.clamp(0, 1)).r);
  });
  return press;
}

function foldUnderBody(blade, local, ribbon, height, ratio, uniforms, interaction) {
  const press = (uniforms.spellGround
    ? max(pressAt(blade.base,interaction),pressAt(blade.base,uniforms.spellGround))
    : pressAt(blade.base,interaction)).clamp(0,1);
  const angle = press.mul(MEADOW_MAX_BODY_BEND);
  const safeAngle = angle.max(1e-4);
  const upright = angle.lessThan(1e-4);
  const horizontal = upright.select(float(0),height.mul(oneMinus(cos(angle.mul(ratio)))).div(safeAngle));
  const vertical = upright.select(height.mul(ratio),height.mul(sin(angle.mul(ratio))).div(safeAngle)).clamp(0,height);
  // phase is baked from canonical stem identity in double precision, unchanged by rebases.
  const direction = vec2(cos(blade.phase),sin(blade.phase));
  const arc = vec3(direction.x.mul(horizontal),vertical,direction.y.mul(horizontal));
  const centre = local.sub(ribbon);
  const folded = mix(centre,arc,smoothstep(0,.15,press)).toVar();
  folded.y.assign(folded.y.clamp(0,height));
  local.assign(folded.add(ribbon));
}

/**
 * The blade's render-space position (the batch mesh has an identity transform).
 *
 * @param {object} options
 * @param {object} options.uniforms createMeadowUniforms()
 * @param {object} options.tuning GrassTuning uniforms (wind, lengths)
 * @param {object} options.config stylizedSurface (dirt, path)
 * @param {number} options.bandCount bands that retire stems (3 when far cards take over)
 * @param {number} options.tileSize metres, for the footprint lookup
 * @param {object | null} [options.interaction] uniforms.interaction, when the field
 *   has an interaction map; without it the fold is not built at all
 */
export function createMeadowBladePosition({
  uniforms, tuning, config, bandCount, tileSize, interaction = null,
  normalOutput = null, gustOutput = null, heightOutput = null,
}) {
  return Fn(() => {
    const blade = meadowInstance(uniforms.origin);
    const bladeUv = uv();
    const r = bladeUv.y.clamp(0, 1).toVar();
    const local = vec3(0).toVar();
    if (normalOutput) normalOutput.assign(vec3(0, 1, 0));
    if (gustOutput) gustOutput.assign(float(0));
    const distance = blade.base.xz.sub(cameraPosition.xz).length();
    const lod = lodCoverage({
      bands: uniforms.lodBands, bandCount, distance, rank: blade.rank, appearance: uniforms.appearance, ratio: r,
    });
    if (heightOutput) heightOutput.assign(r);
    const hidden = distance.greaterThan(uniforms.maxDistance)
      .or(blade.strength.lessThanEqual(0))
      .or(lod.coverage.lessThanEqual(0));
    If(hidden, () => {
      local.assign(vec3(HIDDEN));
    });
    If(hidden.not(), () => {
      // Worn ground: tracks and the broad bare pockets cut the stand back.
      const pathWear = stylizedPathWearMask(blade.path, blade.canonical, {
        vergeWidth: float(config.path?.vergeWidth ?? 0.45),
        vergeCut: float(config.path?.vergeCut ?? 0.72),
        edgeScale: float(config.path?.edgeScale ?? 0.42),
        edgeWarp: float(config.path?.edgeWarp ?? 0.18),
      });
      const dirt = max(pathWear.wear, stylizedDirtMask(blade.canonical, {
        scale: float(config.dirt.scale),
        coverage: float(config.dirt.coverage),
        softness: float(config.dirt.softness),
        warp: float(config.dirt.warp),
      }));
      // Trodden by the player: blades press down under a print and rise as it fades.
      const trodden = meadowTrodden(blade, uniforms.origin, tileSize);
      const growth = blade.strength.mul(oneMinus(dirt.mul(config.dirt.bladeCut))).mul(oneMinus(trodden.mul(0.75)));
      // Thin dirt margins and sparse woodland pockets probabilistically instead of
      // compressing every stem into a tiny vertical spike out of soil.
      const growthKeep = growth.sub(0.14).div(0.44).clamp(0, 1);
      const sparseHide = growth.lessThan(0.58).and(blade.variation.greaterThanEqual(growthKeep));
      // Patchy stand height, as the donor's cinematic meadow: a slow noise sets
      // each patch's scale so the field has swells and hollows, not one level.
      const profile = meadowGrowthNodes(uniforms,blade);
      const tufts = uniforms.tufts;
      const occupancy = profile.tuft.occupancy.toVar();
      const plant = profile.plant;
      const height = profile.height.mul(mix(float(0.62), float(1), growth)).mul(plant.height).toVar();
      // A short plant is a narrow one: width follows the stem's own height, so
      // short growth and worn ground read as slender blades, not broad wedges.
      const stature = height.div(profile.tallHeight.max(1e-3)).clamp(0, 1).toVar();
      const proportion = pow(stature, tufts.widthPower).max(tufts.widthFloor);
      // Deterministic per-stem taper and curvature seeds (rebase-invariant).
      const taperSeed = fract(blade.phase.mul(1.371).add(blade.variation.mul(2.13)));
      const curveSeed = fract(blade.phase.mul(2.193).add(blade.variation.mul(1.61)));
      const isSlenderBiome = blade.shape.lessThan(0.5);
      const isSeedAccent = isSlenderBiome.and(plant.shape.greaterThanEqual(0.5)).and(plant.shape.lessThan(1.5));
      const isFineLeafAccent = isSlenderBiome.and(plant.shape.greaterThanEqual(2.5)).and(plant.shape.lessThan(3.5));
      const isBroadleafCluster = blade.shape.greaterThan(1.5)
        .or(plant.shape.greaterThan(1.5).and(plant.shape.lessThan(2.5)));
      const width = profile.width
        .mul(proportion)
        .mul(tuning.widthScale)
        .mul(sqrt(blade.strength))
        .mul(uniforms.widthScale)
        .mul(mix(float(1), uniforms.taper, r))
        .mul(mix(0.88, 1.12, blade.variation))
        .mul(plant.width)
        .mul(profile.speciesWidth)
        .mul(silhouette(plant.shape, blade.shape, r, taperSeed))
        .mul(lod.width);
      const t = MEADOW_BLADE_SHAPE_TUNING;
      const lateralSweep = isBroadleafCluster.select(
        r.mul(r).mul(height).mul(curveSeed.sub(0.5).mul(t.broadleafAsymmetry)),
        isFineLeafAccent.select(r.mul(r).mul(height).mul(curveSeed.sub(0.5).mul(0.14)), float(0)),
      );
      local.x.assign(positionLocal.x.mul(width).add(lateralSweep));
      const baseCurve = r.mul(r).mul(height).mul(uniforms.curve).mul(profile.curve)
        .mul(profile.speciesCurve).mul(mix(0.65, 1.45, curveSeed));
      const accentNod = isSeedAccent.select(
        pow(r, 2.4).mul(height).mul(mix(0.08, 0.22, curveSeed)),
        isFineLeafAccent.select(pow(r, 1.9).mul(height).mul(mix(0.10, 0.24, curveSeed)), float(0)),
      );
      const broadleafReach = isBroadleafCluster.select(
        pow(r, 2.05).mul(height).mul(mix(float(t.broadleafReachMin), float(t.broadleafReachMax), curveSeed)),
        float(0),
      );
      local.z.assign(baseCurve.add(accentNod).add(broadleafReach));
      const tipDroop = isBroadleafCluster.select(
        pow(r, 2.65).mul(height).mul(mix(float(t.broadleafDroopMin), float(t.broadleafDroopMax), curveSeed)),
        isSeedAccent.select(
          pow(r, 2.8).mul(height).mul(mix(0.04, 0.11, curveSeed)),
          isFineLeafAccent.select(pow(r, 2.4).mul(height).mul(mix(0.05, 0.13, curveSeed)), float(0)),
        ),
      );
      local.y.assign(max(r.mul(height).mul(0.28), r.mul(height).sub(tipDroop)));
      // Face the blade. Snapshot both components: `local.x` is a live reference,
      // and reading it after the first assignment would rotate the rotated value.
      const x = local.x.toVar();
      const z = local.z.toVar();
      local.x.assign(x.mul(blade.rotation.y).sub(z.mul(blade.rotation.x)));
      local.z.assign(x.mul(blade.rotation.x).add(z.mul(blade.rotation.y)));

      const ribbon = vec3(positionLocal.x.mul(width).mul(blade.rotation.y),0,
        positionLocal.x.mul(width).mul(blade.rotation.x)).toVar();

      // A resting bend toward the stem's own random side.
      const bendPower = pow(r, uniforms.stiffness);
      // A tuft's stems share a lean and splay together; stragglers and broadleaf clusters arch asymmetrically.
      const shoulder = profile.tuft.shoulder.mul(plant.shape.lessThan(.5).or(isBroadleafCluster).select(1, 0));
      const flowWeight = tufts.lean.add(tufts.moundFlow.mul(shoulder).mul(oneMinus(tufts.lean))).clamp(0, 1);
      const stemSide = isBroadleafCluster.select(
        vec2(cos(blade.phase.add(curveSeed.mul(2.4))), sin(blade.phase.add(curveSeed.mul(2.4)))),
        vec2(cos(blade.phase), sin(blade.phase)),
      );
      const restMix = mix(stemSide, profile.tuft.lean, isBroadleafCluster.select(flowWeight.mul(0.45), flowWeight)).toVar();
      const restDirection = restMix.div(restMix.length().max(1e-3));
      // Keep a gentle resting splay even on shaded woodland stems so short blades
      // arch naturally instead of standing vertically like little pointed spikes.
      const strengthArch = blade.strength.mul(0.35).add(0.65);
      const shapeBendScale = isBroadleafCluster.select(
        mix(float(1.18), float(1.62), curveSeed),
        isSeedAccent.or(isFineLeafAccent).select(mix(float(0.88), float(1.42), taperSeed), mix(float(0.88), float(1.14), curveSeed)),
      );
      const restAngle = uniforms.baseBend.mul(strengthArch).mul(HALF_PI).mul(bendPower)
        .mul(mix(tufts.bendIsolated, tufts.bendCore, occupancy)).mul(profile.rest)
        .mul(float(1).add(tufts.moundSplay.mul(shoulder))).mul(profile.speciesRest)
        .mul(shapeBendScale).clamp(0, HALF_PI);
      local.x.addAssign(restDirection.x.mul(height.mul(sin(restAngle)).mul(r)));
      local.z.addAssign(restDirection.y.mul(height.mul(sin(restAngle)).mul(r)));
      local.y.subAssign(abs(height.mul(cos(restAngle).sub(1)).mul(r)));

      // The weather's advected field determines the local direction and strength.
      // Coherent fronts travel downwind; an independent high-frequency tip flutter
      // avoids forcing every blade in a tuft to move in lockstep.
      const wind = sampleWorldWindCanonical(blade.canonical);
      const direction = wind.direction;
      const gust = wind.envelope.clamp(0.35, 3.5);
      const across = vec2(direction.y.negate(), direction.x);
      const { wave, phase, front, pressure } = meadowWindFrontNodes(blade, uniforms, tuning, wind);
      if (gustOutput) {
        gustOutput.assign(pressure.clamp(0, 1).mul(wind.envelope.clamp(0, 2).mul(0.5)));
      }
      const secondary = sin(phase.mul(2.25)
        .add(wave.across.mul(tuning.windFrequency.mul(0.42))).add(1.3))
        .mul(uniforms.wind.secondaryStrength);
      const turbulence = sin(wave.across.mul(tuning.windFrequency.mul(1.9))
        .sub(uniforms.time.mul(tuning.windSpeed.mul(0.7))).add(blade.phase.mul(0.6)).add(2.6))
        .mul(tuning.windTurbulence);
      // Pressure crests lean downwind; the negative half-cycle provides recovery.
      const waveLean = front.mul(0.28).add(secondary).add(turbulence).add(pressure.mul(0.72));
      const compliance = oneMinus(blade.variation.mul(tuning.windStiffnessRange))
        .mul(mix(tufts.windShort, float(1), stature)).mul(profile.wind);
      const windAngle = tuning.windLean.add(waveLean.mul(tuning.windStrength))
        .mul(compliance).mul(gust).mul(blade.strength).mul(2).clamp(-1.3, 1.3)
        .mul(bendPower);
      const windReach = height.mul(sin(windAngle)).mul(r);
      local.x.addAssign(direction.x.mul(windReach));
      local.z.addAssign(direction.y.mul(windReach));
      local.y.subAssign(abs(height.mul(cos(windAngle).sub(1)).mul(r)));

      const flutter = meadowTipFlutterNode({
        blade, wave, uniforms, tuning, wind,
        ratio: r, height, stature, distance, windResponse: profile.wind,
      });
      local.x.addAssign(across.x.mul(flutter));
      local.z.addAssign(across.y.mul(flutter));

      // The player's body, last so it folds whatever the wind has already done.
      if (interaction) foldUnderBody(blade,local,ribbon,height,r,uniforms,interaction);

      // Sample the GPU ground-contact field once in the vertex stage for
      // slope-matched root normals and micro-sinking on angled terrain.
      const groundContact = sampleGroundContactAt(blade.canonical, { canonical: true, includeBase: false, includeEco: false });

      // Sample the final deformed centreline before LOD shrink/world translation.
      if (normalOutput) {
        const baseline = meadowBladeWorldNormal(
          blade.rotation, attribute('bladeProfile', 'vec4').x.clamp(-1, 1), r, groundContact.normal,
        );
        normalOutput.assign(meadowBentNormalNode({
          baseline, centerline: local.sub(ribbon), ratio: r,
          height, distance, settings: uniforms.normals,
        }));
      }

      const slopeSink = groundContact.inside.mul(float(0.015).add(groundContact.normal.y.oneMinus().mul(0.06)));
      local.assign(local.mul(clamp(lod.shrink, 0, 1)).add(blade.base).sub(vec3(0, slopeSink, 0)));
      If(sparseHide, () => {
        local.assign(vec3(HIDDEN));
      });
    });
    return local;
  })();
}
