import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  dot,
  float,
  mix,
  normalWorld,
  normalize,
  positionGeometry,
  positionWorld,
  smoothstep,
  vec3,
} from 'three/tsl';
import { OrganicMeshBuilder, createSeededRng } from './floraMeshPrimitives.js';
import { groundGeometry } from '../StylizedPrototypeBake.js';
import { foliageMaterialClass } from '../forest/FoliageNodeMaterial.js';
import { applySkywardNormal, understoryShadeEmission } from '../forest/foliageLight.js';
import { applyPlantMotion } from '../PlantMotionNodes.js';
import { applyCloudShadow } from '../CloudShadow.js';
import { applyJungleMist } from '../ambient/jungleMistOutput.js';
import { assignBushFoliageMaterialData } from '../../../render/postprocessing/PostProcessingMaterialData.js';
import { sampleWorldSurfaceContextVarying } from '../worldSurfaceContext/WorldSurfaceContextState.js';
import { applyWorldSurfaceContact } from '../worldSurfaceContext/WorldSurfaceContactNodes.js';
import { snowLightUniforms } from '../sky/skyLight.js';
import { publishCoatCoverage } from '../surfaceCoatings/CoatCoverage.js';
import {
  UNDERSTORY_FOOT_FILL,
  seatPlantNormal,
  understoryFootShade,
} from '../AuthoredFoliageMaterial.js';

const C = (hex) => new THREE.Color(hex);

/** Snow biomes that use dormant bare-branch winter shrubs and dry protruding grasses. */
export const WINTER_VEGETATION_TILE_IDS = Object.freeze([10, 11]);
/** Selection weight over summer bush GLBs in tundra & glacier (~88% dormant winter flora). */
export const WINTER_VEGETATION_WEIGHT = 8;

function finalizeWinterGeometry(builder) {
  // Suppress OrganicMeshBuilder's automatic brown soil root-collar disc so bare
  // winter stems emerge cleanly from the snowpack without a dark base polygon.
  builder.hasRootCollar = true;
  const geom = builder.build();
  // Strip unused UVs to keep instanced pipelines comfortably within WebGPU's 8-buffer limit.
  geom.deleteAttribute('uv');
  groundGeometry(geom);
  return geom;
}

/**
 * Generates a smooth, organically gnarled multi-segment curved branch waypoint
 * array (6 waypoints) with gentle upward sweep + natural snow-load arch at tip.
 */
function curvedBranchPoints({
  origin,
  azimuth,
  reach,
  height,
  droop,
  twist,
  rng,
  steps = 6,
}) {
  const pts = [];
  const ca = Math.cos(azimuth);
  const sa = Math.sin(azimuth);
  const tx = -sa;
  const tz = ca;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const r = reach * Math.pow(t, 0.92);
    // Smooth arch rising from root, peaking around t=0.68, gently bowing under winter snow.
    const rise = height * Math.sin(t * Math.PI * 0.68) - droop * t * t * t;
    const wiggle = Math.sin(t * Math.PI * 1.6 + twist) * 0.045 * reach * t;
    const jitterY = (rng() - 0.5) * 0.018 * t;
    pts.push([
      origin[0] + ca * r + tx * wiggle,
      origin[1] + Math.max(0.01 * t, rise + jitterY),
      origin[2] + sa * r + tz * wiggle,
    ]);
  }
  return pts;
}

/**
 * Adds fine winter twig forks and occasional tiny withered russet leaves/buds
 * along a woody branch, plus delicate snow tufts perched on horizontal crotches.
 */
function addWinterTwigForks(b, parentPts, {
  baseAzimuth,
  barkColor,
  twigColor,
  witheredLeafColor,
  snowShadow,
  snowTop,
  rng,
  snowChance = 0.45,
}) {
  const forkIndices = [2, 3, 4];
  for (let f = 0; f < forkIndices.length; f += 1) {
    const idx = Math.min(parentPts.length - 2, forkIndices[f]);
    const anchor = parentPts[idx];
    for (const side of [-1, 1]) {
      if (f === 0 && side === -1 && rng() < 0.4) continue;
      const fa = baseAzimuth + side * (0.45 + rng() * 0.48);
      const subLen = (0.14 + rng() * 0.13) * (1 - f * 0.16);
      const subH = (0.09 + rng() * 0.09) * (1 - f * 0.14);
      const subPts = curvedBranchPoints({
        origin: anchor,
        azimuth: fa,
        reach: subLen,
        height: subH,
        droop: 0.025 + rng() * 0.03,
        twist: rng() * 6,
        rng,
        steps: 4,
      });
      b.addTube(subPts, [0.0085, 0.0062, 0.0044, 0.0028, 0.0016], 4, { colorBase: barkColor, colorTip: twigColor });

      // Third-order fine winter shoots near tips.
      const tipAnchor = subPts[2];
      const fineA = fa + (rng() > 0.5 ? 0.55 : -0.55);
      const fineTip = [
        tipAnchor[0] + Math.cos(fineA) * (0.065 + rng() * 0.045),
        tipAnchor[1] + 0.035 + rng() * 0.03,
        tipAnchor[2] + Math.sin(fineA) * (0.065 + rng() * 0.045),
      ];
      b.addTube([tipAnchor, fineTip], [0.0036, 0.0014], 4, { colorBase: twigColor, colorTip: twigColor });

      // Sparse tiny withered russet winter leaves/buds clinging to dormant twigs.
      if (witheredLeafColor && rng() < 0.55) {
        const leafOrigin = subPts[3];
        b.addSculptedLeaf({
          origin: leafOrigin,
          yaw: fa + (rng() - 0.5) * 0.8,
          pitch: 0.15 + rng() * 0.35,
          length: 0.042 + rng() * 0.022,
          width: 0.024 + rng() * 0.012,
          arch: 0.015,
          segments: 3,
          colorBase: barkColor,
          colorTip: witheredLeafColor,
        });
      }
    }

    // Small, delicate snow tuft lodged directly in the woody fork crotch (no ground blob!).
    if (f <= 1 && rng() < snowChance) {
      b.addBlob({
        center: [anchor[0], anchor[1] + 0.016, anchor[2]],
        radiusX: 0.038 + rng() * 0.024,
        radiusY: 0.022 + rng() * 0.012,
        radiusZ: 0.034 + rng() * 0.020,
        rings: 3,
        sides: 6,
        ribAmp: 0.14,
        colorBase: snowShadow,
        colorTop: snowTop,
      });
    }
  }
}

/**
 * 1. Dormant Arctic Dwarf Birch (`Betula nana`):
 * Rooted directly into the snowfield with gracefully curved dark chestnut canes,
 * dense multi-tier winter twigs, sparse dried russet winter buds, and tiny snow
 * tufts caught in branch forks.
 */
function createWinterDwarfBirch() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(7101);
  const barkDark = C('#3a271c');
  const barkMid = C('#5a3d2b');
  const twigTip = C('#78553d');
  const withered = C('#855032');
  const snowShadow = C('#c7d6e8');
  const snowTop = C('#ebf2f9');

  const canes = 8;
  for (let i = 0; i < canes; i += 1) {
    const a = (i / canes) * Math.PI * 2 + (rng() - 0.5) * 0.38;
    const reach = 0.36 + rng() * 0.24;
    const height = 0.34 + rng() * 0.24;
    const droop = 0.06 + rng() * 0.09;
    const pts = curvedBranchPoints({
      origin: [Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03],
      azimuth: a,
      reach,
      height,
      droop,
      twist: rng() * 6.28,
      rng,
      steps: 6,
    });
    b.addTube(pts, [0.017, 0.013, 0.010, 0.0075, 0.0052, 0.0032, 0.0018], 5, { colorBase: barkDark, colorTip: twigTip });
    addWinterTwigForks(b, pts, {
      baseAzimuth: a,
      barkColor: barkMid,
      twigColor: twigTip,
      witheredLeafColor: withered,
      snowShadow,
      snowTop,
      rng,
      snowChance: 0.42,
    });
  }
  return finalizeWinterGeometry(b);
}

/**
 * 2. Low Snow-Bent Arctic Willow Scrub:
 * Sprawling prostrate willow canes bowing outward close to the snowpack,
 * with silver-brown dormant twigs and delicate lodged snow pockets between stems.
 */
function createWinterBuriedWillow() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(7202);
  const bark = C('#433126');
  const twig = C('#6a5343');
  const catkins = C('#8e7a66');
  const snowShadow = C('#c5d5e6');
  const snowTop = C('#eaf1f8');

  const canes = 10;
  for (let i = 0; i < canes; i += 1) {
    const a = (i / canes) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const reach = 0.42 + rng() * 0.26;
    const height = 0.20 + rng() * 0.16;
    const droop = 0.07 + rng() * 0.07;
    const pts = curvedBranchPoints({
      origin: [Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05],
      azimuth: a,
      reach,
      height,
      droop,
      twist: rng() * 6.28,
      rng,
      steps: 6,
    });
    b.addTube(pts, [0.015, 0.011, 0.0085, 0.0062, 0.0042, 0.0026, 0.0015], 5, { colorBase: bark, colorTip: twig });
    addWinterTwigForks(b, pts, {
      baseAzimuth: a,
      barkColor: bark,
      twigColor: twig,
      witheredLeafColor: catkins,
      snowShadow,
      snowTop,
      rng,
      snowChance: 0.50,
    });
  }
  return finalizeWinterGeometry(b);
}

/**
 * 3. Dry Protruding Winter Grass & Sedge Tussock:
 * Clustered brittle ochre/straw winter grass blades and wind-bent seed stalks
 * poking directly out of the snowfield — zero chunky base blob.
 */
function createWinterDryGrassTuft() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(7303);
  const stalkBase = C('#55432c');
  const strawMid = C('#8c744e');
  const strawTip = C('#b8a074');

  const clusters = [
    [0, 0],
    [0.14, 0.06],
    [-0.12, 0.09],
    [0.04, -0.13],
  ];
  for (let c = 0; c < clusters.length; c += 1) {
    const [cx, cz] = clusters[c];
    const blades = c === 0 ? 14 : 8;
    for (let i = 0; i < blades; i += 1) {
      const a = (i / blades) * Math.PI * 2 + (rng() - 0.5) * 0.4;
      const r0 = rng() * 0.06;
      const h = (0.20 + rng() * 0.22) * (c === 0 ? 1.05 : 0.82);
      const ox = cx + Math.cos(a) * r0;
      const oz = cz + Math.sin(a) * r0;
      b.addSculptedLeaf({
        origin: [ox, 0, oz],
        yaw: a,
        pitch: 0.30 + rng() * 0.42,
        length: h,
        width: 0.016 + rng() * 0.010,
        arch: 0.09 + rng() * 0.12,
        segments: 4,
        colorBase: stalkBase,
        colorTip: i % 3 === 0 ? strawTip : strawMid,
      });
      if (i % 4 === 0) {
        const stalkPts = curvedBranchPoints({
          origin: [ox, 0, oz],
          azimuth: a * 0.35 + 0.4,
          reach: 0.14 + rng() * 0.10,
          height: h * 1.15,
          droop: 0.06 + rng() * 0.05,
          twist: rng() * 5,
          rng,
          steps: 4,
        });
        b.addTube(stalkPts, [0.005, 0.0038, 0.0028, 0.002, 0.0012], 4, { colorBase: stalkBase, colorTip: strawTip });
      }
    }
  }
  return finalizeWinterGeometry(b);
}

/**
 * 4. Dormant Alpine Heath & Crowberry Scrub:
 * Low gnarled woody heather clump with russet-mahogany winter shoots and tiny
 * frost-packed snow pockets tucked into the upper twig forks.
 */
function createWinterFrostedScrub() {
  const b = new OrganicMeshBuilder();
  const rng = createSeededRng(7404);
  const darkWood = C('#3b281f');
  const russet = C('#744530');
  const bronzeLeaf = C('#8b5838');
  const snowShadow = C('#c7d6e6');
  const snowTop = C('#ecf3fa');

  const canes = 9;
  for (let i = 0; i < canes; i += 1) {
    const a = (i / canes) * Math.PI * 2 + (rng() - 0.5) * 0.36;
    const reach = 0.28 + rng() * 0.20;
    const height = 0.26 + rng() * 0.18;
    const droop = 0.045 + rng() * 0.06;
    const pts = curvedBranchPoints({
      origin: [Math.cos(a) * 0.035, 0, Math.sin(a) * 0.035],
      azimuth: a,
      reach,
      height,
      droop,
      twist: rng() * 6.28,
      rng,
      steps: 5,
    });
    b.addTube(pts, [0.014, 0.011, 0.008, 0.0055, 0.0032, 0.0016], 4, { colorBase: darkWood, colorTip: russet });
    addWinterTwigForks(b, pts, {
      baseAzimuth: a,
      barkColor: russet,
      twigColor: bronzeLeaf,
      witheredLeafColor: bronzeLeaf,
      snowShadow,
      snowTop,
      rng,
      snowChance: 0.36,
    });
  }
  return finalizeWinterGeometry(b);
}

/**
 * Shared material for procedural dormant winter shrubs and protruding dry grasses.
 * Reads vertex colours (exposed bark, dry straw, and lodged snow tufts), applies
 * WSC snow-ground contact & foot AO, soft powder rim lighting on snow tufts,
 * and wind sway without spending extra texture samplers.
 */
export function createWinterVegetationMaterial(config, {
  height = 0.6,
  bounds = null,
  motion = 'woody-shrub',
} = {}) {
  const material = new (foliageMaterialClass(THREE.MeshLambertNodeMaterial))({
    name: 'winter-dormant-vegetation',
    side: THREE.DoubleSide,
  });

  const vColor = attribute('color', 'vec3');
  const luma = dot(vColor, vec3(0.2126, 0.7152, 0.0722));
  const maxC = vColor.r.max(vColor.g).max(vColor.b);
  const minC = vColor.r.min(vColor.g).min(vColor.b);
  const sat = maxC.sub(minC).div(maxC.max(1e-4));
  // Identify tiny lodged snow tufts vs bare woody bark / dry straw stalks by vertex colour.
  const isSnowTuft = luma.smoothstep(0.55, 0.78).mul(sat.smoothstep(0.22, 0.08));

  const groundContact = sampleWorldSurfaceContextVarying(positionWorld.xz, 'understory');
  const spanY = bounds ? Math.max(0.1, bounds.max[1] - bounds.min[1]) : Math.max(0.2, height);
  const localHeightM = bounds ? positionGeometry.y.sub(bounds.min[1]) : positionGeometry.y;
  const localHeightT = localHeightM.div(spanY).clamp(0, 1);
  const worldHeightT = positionWorld.y.sub(groundContact.height).div(Math.max(0.3, spanY)).clamp(0, 1);
  const baseT = mix(localHeightT, worldHeightT, groundContact.validity);
  const baseRamp = smoothstep(0.0, 0.28, baseT);
  const baseAo = understoryFootShade(baseRamp, groundContact);

  // Subtle snow dusting right where lower stems emerge from the snowpack.
  const contact = applyWorldSurfaceContact({
    surface: { color: vColor },
    wsc: groundContact,
    profile: 'understory',
    fallbackHeight: localHeightM,
    mask: mix(float(0.22), float(0.75), isSnowTuft),
    applyAo: false,
  });

  const n = normalize(normalWorld);
  const view = normalize(cameraPosition.sub(positionWorld));
  const snowVelvet = float(1).sub(dot(n, view).clamp(0, 1)).pow(2.4).mul(0.10).mul(isSnowTuft);
  const snowShade = mix(snowLightUniforms.shadeTint, vec3(1, 1, 1), smoothstep(0.20, 0.82, n.y));
  const tuftColor = contact.color.mul(snowShade).mul(snowLightUniforms.brightness.max(0.84))
    .add(vec3(0.84, 0.92, 1.0).mul(snowVelvet));
  // Subtle cool snow bounce onto dark undersides of bare winter branches.
  const branchBounce = vec3(0.76, 0.86, 1.0).mul(n.y.smoothstep(0.5, -0.4)).mul(0.045);
  const barkColor = contact.color.mul(baseAo).add(branchBounce);

  const finalColor = mix(barkColor, tuftColor, isSnowTuft);
  material.colorNode = finalColor;
  const fill = understoryShadeEmission(finalColor).mul(mix(float(UNDERSTORY_FOOT_FILL), float(1.0), baseRamp));
  material.emissiveNode = fill;
  material.foliageTransmissionNode = mix(float(0.04), float(0.14), isSnowTuft);
  material.foliageWrapDiffuseNode = mix(float(0.14), float(0.36), isSnowTuft);
  material.foliageRimGlowNode = float(0.05).mul(baseRamp);
  seatPlantNormal(material, baseT, groundContact);

  applyPlantMotion(material, { wind: config?.wind, height: spanY, profile: motion, groundConform: true });
  if (config) applySkywardNormal(material);
  applyCloudShadow(material, config?.sky);
  applyJungleMist(material, config?.ambientEffects);
  publishCoatCoverage(material, { snow: isSnowTuft });
  material.needsUpdate = true;
  return assignBushFoliageMaterialData(material);
}

const WINTER_SPECS = Object.freeze([
  Object.freeze({ id: 'winter-dwarf-birch', motion: 'woody-shrub', proxyProfile: 'lowMound', scale: 1.15, create: createWinterDwarfBirch }),
  Object.freeze({ id: 'winter-buried-willow', motion: 'woody-shrub', proxyProfile: 'lowMound', scale: 1.10, create: createWinterBuriedWillow }),
  Object.freeze({ id: 'winter-dry-grass-tuft', motion: 'grass-tuft', proxyProfile: 'lowMound', scale: 1.12, create: createWinterDryGrassTuft }),
  Object.freeze({ id: 'winter-frosted-scrub', motion: 'woody-shrub', proxyProfile: 'lowMound', scale: 1.08, create: createWinterFrostedScrub }),
]);

/**
 * Builds the 4 dormant winter shrub & dry winter grass prototypes for `StylizedBushView`.
 */
export function buildWinterVegetationPrototypes(config) {
  return WINTER_SPECS.map((spec) => {
    const geometry = spec.create();
    geometry.scale(spec.scale, spec.scale, spec.scale);
    groundGeometry(geometry);
    const bounds = {
      min: geometry.boundingBox.min.toArray(),
      max: geometry.boundingBox.max.toArray(),
    };
    const height = Math.max(0.1, bounds.max[1] - bounds.min[1]);
    const material = createWinterVegetationMaterial(config, { height, bounds, motion: spec.motion });
    return {
      id: spec.id,
      geometry,
      material,
      height,
      motion: spec.motion,
      proxyProfile: spec.proxyProfile,
      tileIds: WINTER_VEGETATION_TILE_IDS,
      paletteTileId: 10,
      weight: WINTER_VEGETATION_WEIGHT,
    };
  });
}
