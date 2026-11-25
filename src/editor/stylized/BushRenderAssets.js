import { meadowPatchOnPlant } from './understoryPatch.js';
import { applyJungleMist } from './ambient/jungleMistOutput.js';
import * as THREE from 'three/webgpu';
import {
  clamp,
  float,
  mix,
  positionGeometry,
  positionWorld,
  smoothstep,
  vec3,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assignBushFoliageMaterialData } from '../../render/postprocessing/PostProcessingMaterialData.js';
import {
  applyUnderstoryPalette,
  authoredFoliageColor,
  biomeUnderstoryColor,
  cloneAuthoredNodeMaterial,
  CROWN_SELF_SHADE,
  seatPlantNormal,
  UNDERSTORY_FOOT_FILL,
  understoryFootShade,
} from './AuthoredFoliageMaterial.js';
import { applyPlantMotion } from './PlantMotionNodes.js';
import { resolveFoliagePalette } from './forest/foliagePalette.js';
import { applySkywardNormal, understoryShadeEmission } from './forest/foliageLight.js';
import { foliageMaterialClass } from './forest/FoliageNodeMaterial.js';
import { crownInteriorVisibilityNode, crownPuffNormalNode } from './forest/TreeFoliageSurface.js';
import { applyCloudShadow } from './CloudShadow.js';
import { sampleGroundContactVarying } from './groundContact/GroundContactState.js';

export const BUSH_CAST_SHADOW = false;
export const BUSH_PROXY_TRIANGLES = 100;

const DEFAULT_PROXY_COLOR = '#6d8a58';
const MIN_PROXY_EXTENT = 0.05;
const PROXY_FIT_MARGIN = 2e-7;
const WHITE_THRESHOLD = 0.92;
const WHITE_SPREAD = 0.05;
// Irregular asymmetrical multi-cluster arrangement: [x, y, z, scaleX, scaleY, scaleZ, rotX, rotY, rotZ]
// Every silhouette profile keeps exactly 5 icosahedron lobes (5 x 20 = BUSH_PROXY_TRIANGLES = 100).
const PROXY_LOBES = Object.freeze([
  Object.freeze([-0.34, -0.18, 0.12, 0.56, 0.42, 0.52, 0.15, 0.4, -0.2]),
  Object.freeze([0.32, -0.10, -0.14, 0.50, 0.52, 0.48, -0.18, 1.1, 0.14]),
  Object.freeze([0.10, 0.22, 0.06, 0.48, 0.56, 0.44, 0.12, 2.0, 0.10]),
  Object.freeze([-0.14, 0.06, -0.26, 0.42, 0.44, 0.46, -0.22, -0.8, 0.16]),
  Object.freeze([0.04, -0.24, 0.30, 0.44, 0.34, 0.40, 0.08, 0.9, -0.12]),
]);

export const BUSH_PROXY_PROFILES = Object.freeze({
  default: PROXY_LOBES,
  // Savanna thorn scrub: open center, vertically staggered flat-topped outer pads, sparser on one side.
  savannaThorn: Object.freeze([
    Object.freeze([0.66, 0.34, 0.14, 0.42, 0.16, 0.36, 0.08, 0.3, -0.14]),
    Object.freeze([0.16, 0.56, 0.60, 0.38, 0.17, 0.34, -0.10, 1.1, 0.12]),
    Object.freeze([-0.68, 0.06, -0.22, 0.44, 0.16, 0.36, 0.12, 2.2, -0.10]),
    Object.freeze([0.28, 0.22, -0.64, 0.40, 0.15, 0.34, -0.14, -0.7, 0.16]),
    Object.freeze([-0.42, 0.42, 0.48, 0.26, 0.13, 0.24, 0.10, 0.8, -0.12]),
  ]),
  // Boreal krummholz juniper: tall offset conifer spire, asymmetric mid shoulder, and low creeping runners.
  borealJuniper: Object.freeze([
    Object.freeze([0.26, 0.56, 0.14, 0.26, 0.56, 0.26, 0.06, 0.4, -0.10]),
    Object.freeze([-0.14, 0.12, 0.32, 0.34, 0.34, 0.32, -0.12, 1.3, 0.14]),
    Object.freeze([-0.58, -0.36, -0.16, 0.44, 0.18, 0.34, 0.10, 2.1, -0.08]),
    Object.freeze([0.52, -0.38, -0.38, 0.42, 0.17, 0.32, -0.08, -0.9, 0.12]),
    Object.freeze([-0.18, -0.40, 0.56, 0.38, 0.16, 0.30, 0.06, 0.7, -0.06]),
  ]),
  // Wetland buttonbush & willow: broken multi-cane crown with visible sky gaps between leaning clusters.
  swampButtonbush: Object.freeze([
    Object.freeze([0.52, 0.36, 0.22, 0.34, 0.36, 0.32, 0.18, 0.5, -0.22]),
    Object.freeze([-0.48, 0.48, -0.18, 0.32, 0.38, 0.30, -0.16, 1.4, 0.20]),
    Object.freeze([0.08, 0.54, -0.52, 0.30, 0.34, 0.28, 0.14, 2.3, 0.12]),
    Object.freeze([-0.22, -0.04, 0.56, 0.34, 0.32, 0.30, -0.20, -0.8, -0.14]),
    Object.freeze([0.36, -0.22, -0.24, 0.28, 0.30, 0.28, 0.12, 0.9, 0.16]),
  ]),
  // Upright conifer sapling: tiered conical crown tapering to an apical leader.
  uprightSapling: Object.freeze([
    Object.freeze([0.04, 0.62, -0.02, 0.26, 0.38, 0.26, 0.05, 0.4, -0.06]),
    Object.freeze([-0.22, 0.20, 0.18, 0.38, 0.34, 0.36, -0.10, 1.2, 0.08]),
    Object.freeze([0.24, 0.14, -0.16, 0.36, 0.32, 0.36, 0.08, 2.1, -0.10]),
    Object.freeze([-0.32, -0.30, -0.24, 0.46, 0.28, 0.44, -0.08, -0.7, 0.12]),
    Object.freeze([0.30, -0.34, 0.26, 0.48, 0.26, 0.44, 0.10, 0.9, -0.08]),
  ]),
  // Low sprawling mound (bilberry, small bramble, sagebrush, gorse): broad hugged-to-ground cushion.
  lowMound: Object.freeze([
    Object.freeze([-0.46, -0.16, 0.16, 0.54, 0.30, 0.46, 0.10, 0.3, -0.12]),
    Object.freeze([0.44, -0.14, -0.18, 0.52, 0.32, 0.44, -0.12, 1.4, 0.10]),
    Object.freeze([0.06, 0.16, 0.04, 0.50, 0.34, 0.48, 0.06, 2.2, 0.08]),
    Object.freeze([-0.14, -0.20, -0.44, 0.46, 0.26, 0.42, -0.14, -0.8, 0.10]),
    Object.freeze([0.16, -0.22, 0.42, 0.48, 0.26, 0.40, 0.08, 0.9, -0.10]),
  ]),
  // Tall arching cane clump (bamboo, ocotillo): narrow base widening into high fanning plumes.
  tallCane: Object.freeze([
    Object.freeze([0.02, -0.42, 0.00, 0.24, 0.44, 0.24, 0.04, 0.2, -0.05]),
    Object.freeze([0.36, 0.34, 0.18, 0.36, 0.34, 0.34, 0.14, 1.1, -0.18]),
    Object.freeze([-0.34, 0.42, -0.16, 0.34, 0.36, 0.32, -0.16, 2.0, 0.14]),
    Object.freeze([0.10, 0.54, -0.34, 0.32, 0.32, 0.30, 0.12, -0.9, 0.10]),
    Object.freeze([-0.16, 0.26, 0.38, 0.34, 0.30, 0.32, -0.12, 0.7, -0.14]),
  ]),
  // Broadleaf / dwarf palm rosette: wide flaring outer fronds/leaves radiating from a compact heart.
  broadleafCrown: Object.freeze([
    Object.freeze([0.54, 0.04, 0.18, 0.50, 0.26, 0.40, 0.12, 0.4, -0.20]),
    Object.freeze([-0.52, 0.10, -0.20, 0.48, 0.26, 0.42, -0.14, 1.5, 0.18]),
    Object.freeze([0.12, 0.28, -0.48, 0.46, 0.28, 0.40, 0.16, 2.4, 0.10]),
    Object.freeze([-0.18, 0.02, 0.52, 0.48, 0.24, 0.42, -0.18, -0.7, -0.12]),
    Object.freeze([0.04, 0.38, 0.06, 0.40, 0.32, 0.38, 0.08, 0.8, 0.06]),
  ]),
});

export function resolveBushProxyProfile(identifier = '') {
  const key = String(identifier ?? '').toLowerCase();
  if (key.includes('rooibos') || key.includes('savanna-thorn') || key.includes('didelta')) return 'savannaThorn';
  if (key.includes('juniper')) return 'borealJuniper';
  if (key.includes('buttonbush') || key.includes('willow')) return 'swampButtonbush';
  if (key.includes('taiga-sapling')) return 'uprightSapling';
  if (key.includes('bamboo') || key.includes('ocotillo')) return 'tallCane';
  if (key.includes('palm-shrub') || key.includes('hibiscus') || key.includes('rhododendron') || key.includes('pachira')) {
    return 'broadleafCrown';
  }
  if (key.includes('small_bush') || key.includes('bilberry') || key.includes('sagebrush') || key.includes('gorse')) {
    return 'lowMound';
  }
  return 'default';
}

function usesCutout(material) {
  return Boolean(
    material.map
    || material.alphaMap
    || material.transparent
    || (Number.isFinite(material.opacity) && material.opacity < 1),
  );
}

export function cloneBushMaterial(source, { config = null, height = 0, tileId = null, motion = 'woody-shrub', biomeLook = false, bounds = null } = {}) {
  if (!source?.isMaterial) throw new Error('Bush prototypes require an authored material.');
  const material = cloneAuthoredNodeMaterial(source, { lit: true });
  if (material.map?.colorSpace !== undefined) {
    material.map.colorSpace = THREE.SRGBColorSpace;
  }
  material.colorNode = authoredFoliageColor(material);
  const cutout = usesCutout(material);
  if (config) applyUnderstoryPalette(material, config, tileId, 'auto', { biomeLook, bounds, softEdges: cutout });
  else material.emissiveNode = understoryShadeEmission(material.colorNode);
  applyPlantMotion(material, { wind: config?.wind, height, profile: motion, groundConform: true });
  if (config) applySkywardNormal(material);
  material.side = THREE.DoubleSide;
  if (cutout) {
    material.alphaTest = Math.max(0.35, material.alphaTest ?? 0);
    material.transparent = false;
  }
  material.depthWrite = true;
  material.needsUpdate = true;
  applyJungleMist(material, config?.ambientEffects);
  return assignBushFoliageMaterialData(material);
}

function proxyColor(sourceMaterial, fallbackColor) {
  const fallback = new THREE.Color(fallbackColor ?? DEFAULT_PROXY_COLOR);
  const source = sourceMaterial?.color;
  if (!source?.isColor) return fallback;
  const minimum = Math.min(source.r, source.g, source.b);
  const maximum = Math.max(source.r, source.g, source.b);
  const looksLikeDefaultWhite = minimum >= WHITE_THRESHOLD && maximum - minimum <= WHITE_SPREAD;
  return looksLikeDefaultWhite ? fallback : source.clone();
}

function expandedProxyBounds(sourceGeometry) {
  sourceGeometry.computeBoundingBox();
  const sourceBounds = sourceGeometry.boundingBox;
  const center = sourceBounds.getCenter(new THREE.Vector3());
  const size = sourceBounds.getSize(new THREE.Vector3());
  size.set(
    Math.max(size.x, MIN_PROXY_EXTENT),
    Math.max(size.y, MIN_PROXY_EXTENT),
    Math.max(size.z, MIN_PROXY_EXTENT),
  );
  const half = size.multiplyScalar(0.5);
  return new THREE.Box3(center.clone().sub(half), center.clone().add(half));
}

function fitGeometryToBounds(geometry, bounds) {
  geometry.computeBoundingBox();
  const current = geometry.boundingBox;
  const currentSize = current.getSize(new THREE.Vector3());
  const currentCenter = current.getCenter(new THREE.Vector3());
  const targetSize = bounds.getSize(new THREE.Vector3());
  const targetCenter = bounds.getCenter(new THREE.Vector3());
  geometry.translate(-currentCenter.x, -currentCenter.y, -currentCenter.z);
  geometry.scale(
    (targetSize.x + PROXY_FIT_MARGIN) / Math.max(MIN_PROXY_EXTENT, currentSize.x),
    (targetSize.y + PROXY_FIT_MARGIN) / Math.max(MIN_PROXY_EXTENT, currentSize.y),
    (targetSize.z + PROXY_FIT_MARGIN) / Math.max(MIN_PROXY_EXTENT, currentSize.z),
  );
  geometry.translate(targetCenter.x, targetCenter.y, targetCenter.z);
}

export function createBushProxyGeometry(sourceGeometry, { profile = 'default' } = {}) {
  if (!sourceGeometry?.isBufferGeometry) {
    throw new Error('Bush proxy generation requires buffer geometry.');
  }
  const profileName = BUSH_PROXY_PROFILES[profile] ? profile : 'default';
  const proxyBounds = expandedProxyBounds(sourceGeometry);
  const lobes = BUSH_PROXY_PROFILES[profileName].map(([x, y, z, width, height, depth, rx, ry, rz]) => {
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    geometry.scale(width, height, depth);
    geometry.rotateX(rx);
    geometry.rotateY(ry);
    geometry.rotateZ(rz);
    geometry.translate(x, y, z);
    return geometry;
  });
  const geometry = mergeGeometries(lobes, false);
  lobes.forEach((lobe) => lobe.dispose());
  fitGeometryToBounds(geometry, proxyBounds);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.proxyKind = 'clustered-low-poly-canopy';
  geometry.userData.proxyProfile = profileName;
  return geometry;
}

export function createBushProxyMaterial(sourceMaterial, {
  color = DEFAULT_PROXY_COLOR,
  minimumHeight = 0,
  maximumHeight = 1,
  bounds = null,
  config = null,
  tileId = null,
  motion = 'woody-shrub',
  biomeLook = false,
} = {}) {
  const value = proxyColor(sourceMaterial, color);
  const palette = config ? resolveFoliagePalette(config, tileId) : null;
  const bottom = (palette?.base ?? value.clone().multiplyScalar(0.72)).clone();
  const top = (palette?.tip ?? value.clone().lerp(new THREE.Color('#c8d48c'), 0.2)).clone();
  const height = Math.max(MIN_PROXY_EXTENT, maximumHeight - minimumHeight);
  const heightMix = clamp(positionGeometry.y.sub(float(minimumHeight)).div(float(height)), 0, 1);
  const material = new (foliageMaterialClass(THREE.MeshLambertNodeMaterial))({ flatShading: false });
  const ramp = mix(
    vec3(bottom.r, bottom.g, bottom.b),
    vec3(top.r, top.g, top.b),
    heightMix,
  );
  const local = config ? meadowPatchOnPlant(ramp, config) : ramp;
  const shadedColor = biomeLook ? biomeUnderstoryColor(local) : local;
  const groundContact = sampleGroundContactVarying(positionWorld.xz, 'bushProxy');
  const worldHeightT = positionWorld.y.sub(groundContact.height).div(Math.max(0.35, height)).clamp(0, 1);
  const baseT = mix(heightMix, worldHeightT, groundContact.inside);
  const baseRamp = smoothstep(0.0, 0.30, baseT);
  const baseAo = understoryFootShade(baseRamp, groundContact);
  const soilMask = smoothstep(0.0, 0.22, baseT).oneMinus().mul(0.30).mul(groundContact.inside);
  // The same crown interior shade as the near bush, so the LOD swap keeps its depth.
  const interior = bounds ? crownInteriorVisibilityNode(bounds) : float(1);
  const groundedProxy = mix(shadedColor, groundContact.soilColor, soilMask).mul(baseAo)
    .mul(mix(float(1), interior, CROWN_SELF_SHADE));
  material.colorNode = groundedProxy;
  material.emissiveNode = understoryShadeEmission(groundedProxy)
    .mul(mix(float(UNDERSTORY_FOOT_FILL), float(1.0), baseRamp)).mul(interior);
  material.aoNode = interior;
  material.foliageVisibilityNode = interior;
  material.foliageTransmissionNode = float(0.2).mul(mix(float(0.28), float(1.0), baseRamp));
  material.foliageWrapDiffuseNode = float(0.32);
  material.foliageRimGlowNode = float(0.14).mul(baseRamp);
  seatPlantNormal(material, baseT, groundContact);
  if (bounds) {
    material.foliageShapeNormalNode = crownPuffNormalNode(bounds, 0.34, 0.12);
    material.foliageNormalBlendNode = float(0.72);
  }
  material.transparent = false;
  material.depthWrite = true;
  applyPlantMotion(material, { wind: config?.wind, height, profile: motion, groundConform: true });
  if (config) applySkywardNormal(material);
  applyCloudShadow(material, config?.sky);
  applyJungleMist(material, config?.ambientEffects);
  return assignBushFoliageMaterialData(material);
}

export function createBushProxyPrototype(prototype, options = {}) {
  if (!prototype?.geometry || !prototype?.material) {
    throw new Error('Bush proxy generation requires a complete prototype.');
  }
  const bounds = expandedProxyBounds(prototype.geometry);
  const profile = options.profile ?? resolveBushProxyProfile(
    options.assetId ?? prototype.assetId ?? prototype.scenePath ?? prototype.prototypeId,
  );
  return {
    geometry: createBushProxyGeometry(prototype.geometry, { profile }),
    material: createBushProxyMaterial(prototype.material, {
      ...options,
      motion: prototype.material.userData.plantMotionProfile,
      minimumHeight: bounds.min.y,
      maximumHeight: bounds.max.y,
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    }),
    kind: 'bush-proxy',
    instanceBiomeLook: Boolean(options.biomeLook),
    height: prototype.height,
    prototypeId: `${prototype.prototypeId}-proxy`,
    proxyProfile: profile,
  };
}
