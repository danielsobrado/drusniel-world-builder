import * as THREE from 'three/webgpu';
import { attribute, positionWorld, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { treeWindTimeFor } from '../forest/TreeWindTime.js';
import { foliageWindPosition } from '../forest/foliageWind.js';
import { foliageMaterialClass } from '../forest/FoliageNodeMaterial.js';
import { configureTreeFoliageSurface } from '../forest/TreeFoliageSurface.js';
import { resolveTreeFoliageSettings, resolveTreeBarkSettings } from '../forest/treeSurfaceSettings.js';
import { bakeCanopyVisibility } from '../forest/CanopyVisibility.js';
import { treeFoliageEmission, treeBarkEmission } from '../forest/foliageLight.js';
import { resolveCanopyGrade } from '../forest/canopyGrade.js';
import { applyTreeBarkWetSurface } from '../forest/TreeWetSurface.js';
import {
  applyCrownProfileNormals,
  resolveCrownProfileKey,
  resolveCrownProfiles,
} from '../forest/crownProfile.js';
import { rainOnObject, wetCoat } from '../surfaceCoatings/WetCoat.js';
import { sampleWorldSurfaceContextVarying } from '../worldSurfaceContext/WorldSurfaceContextState.js';
import { applyWorldSurfaceContact } from '../worldSurfaceContext/WorldSurfaceContactNodes.js';
import { inheritCoatCoverage } from '../surfaceCoatings/CoatCoverage.js';

function unionBounds(parts, kind = null) {
  const box = new THREE.Box3();
  box.makeEmpty();
  for (const part of parts) {
    if (kind && part.kind !== kind) continue;
    part.geometry.computeBoundingBox();
    box.union(part.geometry.boundingBox);
  }
  return box.isEmpty() ? null : box;
}

function makeMaterial(color, side = THREE.FrontSide) {
  const value = new THREE.Color(color);
  const material = new THREE.MeshLambertNodeMaterial({ side });
  material.color.copy(value);
  material.colorNode = vec3(value.r, value.g, value.b);
  return material;
}

/** Mean linear colour of a texture's opaque texels, or null when its image is not CPU-readable (e.g. KTX2). */
function textureMeanColor(texture) {
  const image = texture?.image;
  if (!(image?.width > 0) || typeof OffscreenCanvas === 'undefined') return null;
  try {
    const context = new OffscreenCanvas(16, 16).getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 16, 16);
    const data = context.getImageData(0, 0, 16, 16).data;
    const sum = [0, 0, 0];
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2];
      count++;
    }
    if (!count) return null;
    const colorSpace = texture.colorSpace === THREE.SRGBColorSpace ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    return new THREE.Color().setRGB(sum[0] / count / 255, sum[1] / count / 255, sum[2] / count / 255, colorSpace);
  } catch {
    return null;
  }
}

/** Preserve the broad color of painted crowns in the cheap/loading fallback. */
function proxyCanopyColor(parts, fallback) {
  const leaves = parts.filter(part => part.kind === 'leaf');
  // A textured crown's vertex colours only modulate its map (authoredFoliageColor); averaging them alone
  // drew every textured conifer's proxy white. Use the map's opaque mean, else the canopy grade.
  const mapped = leaves.find(part => part.material?.map);
  if (mapped) {
    const mean = textureMeanColor(mapped.material.map);
    return mean ? mean.multiply(mapped.material.color ?? new THREE.Color(1, 1, 1)) : new THREE.Color(fallback);
  }
  const sum = new THREE.Vector3();
  let count = 0;
  for (const part of leaves) {
    const colors = part.geometry.getAttribute('color');
    if (!colors) continue;
    for (let i = 0; i < colors.count; i++) {
      sum.x += colors.getX(i); sum.y += colors.getY(i); sum.z += colors.getZ(i);
    }
    count += colors.count;
  }
  return count > 0 ? new THREE.Color().setRGB(sum.x / count, sum.y / count, sum.z / count) : fallback;
}

function makeTreeLeafMaterial(
  color,
  config,
  bounds,
  geometry,
  settings = resolveTreeFoliageSettings(config.trees),
  profile = null,
) {
  const material = settings.enabled
    ? new (foliageMaterialClass(THREE.MeshStandardNodeMaterial))({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide })
    : makeMaterial(color);
  if (settings.enabled) {
    const value = new THREE.Color(color);
    material.colorNode = vec3(...value.toArray());
    bakeCanopyVisibility([{ kind: 'leaf', geometry }], config.trees);
    const surface = configureTreeFoliageSurface(material, { settings,
      visibility: attribute('canopyVisibility', 'float'), color: material.colorNode,
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      profile,
    });
    material.emissiveNode = treeFoliageEmission(material.colorNode, null, surface.visibility);
  }
  const wind = config.wind;
  const time = treeWindTimeFor(config);
  // `treeWindTimeFor` always yields a node, so a config without a wind block has
  // to be rejected here or prototype construction throws on it.
  if (!time || !bounds || !Array.isArray(wind?.direction)) return material;
  material.positionNode = foliageWindPosition({
    config, time, minimumY: bounds.min.y, maximumY: bounds.max.y, flutter: false,
  });
  return material;
}

function makeTreeTrunkMaterial(config) {
  const settings = resolveTreeBarkSettings(config.trees);
  if (!settings.enabled) return makeMaterial(config.trees.barkTint);
  const material = new (foliageMaterialClass(THREE.MeshStandardNodeMaterial))({ roughness: settings.roughness });
  const value = new THREE.Color(config.trees.barkTint);
  material.colorNode = vec3(...value.toArray());
  // The near trunk's foot (barkWeathering): soil collar and the ground's own light, so the LOD swap keeps it.
  const contact = applyWorldSurfaceContact({
    surface: { color: material.colorNode },
    wsc: sampleWorldSurfaceContextVarying(positionWorld.xz, 'proxyBark'),
    profile: 'tree',
  });
  // The near trunk's soak, sheltered by the same canopy (WetCoat.js).
  material.treeWetnessNode = rainOnObject(contact.canopy).mul(0.7);
  material.colorNode = wetCoat({ color: contact.color },
    { amount: material.treeWetnessNode.mul(settings.wetStrength), darkening: 0.45 }).color;
  material.emissiveNode = contact.groundLight(treeBarkEmission(contact.color), contact.color);
  return applyTreeBarkWetSurface(material, settings);
}

function buildConnectorLobe(crownWidth, crownHeight, leafCenter, offsetY, scale) {
  const geometry = new THREE.IcosahedronGeometry(0.5, 0);
  geometry.scale(crownWidth * scale, crownHeight * scale, crownWidth * scale);
  geometry.translate(leafCenter.x, leafCenter.y + offsetY * crownHeight, leafCenter.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildProfileProxyLobes(profile, crownWidth, crownHeight, leafCenter) {
  const geometries = [];
  if (profile.shape === 'tiered-cone') {
    for (const [offsetY, radiusScale, heightScale] of profile.tiers) {
      const indexed = new THREE.ConeGeometry(0.5, 1, 7, 1, false);
      const geometry = indexed.toNonIndexed();
      indexed.dispose();
      geometry.scale(crownWidth * radiusScale, crownHeight * heightScale, crownWidth * radiusScale);
      geometry.translate(leafCenter.x, leafCenter.y + offsetY * crownHeight, leafCenter.z);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometries.push(geometry);
    }
    geometries.push(buildConnectorLobe(crownWidth, crownHeight, leafCenter, -0.24, 0.46));
    return geometries;
  }

  const [aspectX, aspectY, aspectZ] = profile.aspect ?? [1, 1, 1];
  for (let index = 0; index < profile.lobes.length; index += 1) {
    const [offsetX, offsetY, offsetZ, scale] = profile.lobes[index];
    const geometry = new THREE.IcosahedronGeometry(0.5, 0);
    const pos = geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const wave = Math.sin(x * 8.3 + z * 6.1 + index * 1.7) * Math.cos(y * 7.9 - x * 4.7) * 0.05;
      const scaleR = 1 + wave;
      pos.setXYZ(i, x * scaleR, y * scaleR, z * scaleR);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.scale(
      crownWidth * scale * aspectX,
      crownHeight * scale * aspectY,
      crownWidth * scale * aspectZ * 0.94,
    );
    geometry.translate(
      leafCenter.x + offsetX * crownWidth,
      leafCenter.y + offsetY * crownHeight,
      leafCenter.z + offsetZ * crownWidth,
    );
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometries.push(geometry);
  }
  geometries.push(buildConnectorLobe(crownWidth, crownHeight, leafCenter, -0.22, 0.5));
  return geometries;
}

export function createTreeProxyPrototype(parts, config) {
  const combinedBounds = unionBounds(parts);
  const leafBounds = unionBounds(parts, 'leaf') ?? combinedBounds;
  const trunkBounds = unionBounds(parts, 'trunk') ?? combinedBounds;
  const leafSize = leafBounds.getSize(new THREE.Vector3());
  const leafCenter = leafBounds.getCenter(new THREE.Vector3());
  const trunkSize = trunkBounds.getSize(new THREE.Vector3());
  const trunkCenter = trunkBounds.getCenter(new THREE.Vector3());

  const leafMaterial = parts.find(part => part.kind === 'leaf')?.material;
  const leafSurface = leafMaterial?.userData?.treeFoliageSurface;
  const profileKey = resolveCrownProfileKey(
    leafMaterial?.userData?.crownProfileKey ?? leafSurface?.crownProfile ?? 'broadleaf',
    leafMaterial?.userData?.crownProfileKey,
  );
  const profiles = resolveCrownProfiles(config.trees);
  const profile = profiles[profileKey] ?? profiles.broadleaf;

  const crownWidth = Math.max(0.2, Math.max(leafSize.x, leafSize.z));
  const crownHeight = Math.max(0.2, leafSize.y);
  const crownLobeGeometries = buildProfileProxyLobes(profile, crownWidth, crownHeight, leafCenter);
  if (profile.shape === 'tiered-cone') {
    const envelope = new THREE.Box3();
    for (const geometry of crownLobeGeometries) envelope.union(geometry.boundingBox);
    const size = envelope.getSize(new THREE.Vector3());
    const scaleX = Math.max(1, leafSize.x / Math.max(0.001, size.x));
    const scaleZ = Math.max(1, leafSize.z / Math.max(0.001, size.z));
    for (const geometry of crownLobeGeometries) {
      geometry.translate(-leafCenter.x, 0, -leafCenter.z);
      geometry.scale(scaleX, 1, scaleZ);
      geometry.translate(leafCenter.x, 0, leafCenter.z);
      geometry.computeBoundingBox();
    }
  }
  const connectorBounds = crownLobeGeometries.at(-1).boundingBox.clone();
  const canopyGeometry = mergeGeometries(crownLobeGeometries, false);
  crownLobeGeometries.forEach((geometry) => geometry.dispose());
  canopyGeometry.computeBoundingBox();
  canopyGeometry.computeBoundingSphere();
  applyCrownProfileNormals(
    canopyGeometry,
    { min: canopyGeometry.boundingBox.min.toArray(), max: canopyGeometry.boundingBox.max.toArray() },
    profile,
    { strength: 0.86 },
  );
  canopyGeometry.userData.trunkConnectorBounds = {
    min: connectorBounds.min.toArray(),
    max: connectorBounds.max.toArray(),
  };
  canopyGeometry.userData.crownProfileKey = profileKey;

  const actualCanopyWidth = Math.max(
    0.2,
    canopyGeometry.boundingBox.max.x - canopyGeometry.boundingBox.min.x,
    canopyGeometry.boundingBox.max.z - canopyGeometry.boundingBox.min.z,
  );
  const branchInclusiveDiameter = Math.max(trunkSize.x, trunkSize.z);
  const proxyTrunkDiameter = Math.min(branchInclusiveDiameter, actualCanopyWidth * 0.14);
  const trunkGeometry = new THREE.CylinderGeometry(
    Math.max(0.04, proxyTrunkDiameter * 0.34),
    Math.max(0.05, proxyTrunkDiameter * 0.5),
    Math.max(0.1, trunkSize.y),
    5,
    1,
  );
  trunkGeometry.translate(trunkCenter.x, trunkCenter.y, trunkCenter.z);
  trunkGeometry.computeBoundingBox();
  trunkGeometry.computeBoundingSphere();

  const grade = resolveCanopyGrade(config.trees?.canopyGrade);
  const proxyFallback = grade
    ? new THREE.Color(grade.shadow).lerp(new THREE.Color(grade.light), 0.58)
    : config.trees.leafTop;
  return {
    height: Math.max(0.1, combinedBounds.max.y - combinedBounds.min.y),
    width: Math.max(0.1, combinedBounds.max.x - combinedBounds.min.x),
    depth: Math.max(0.1, combinedBounds.max.z - combinedBounds.min.z),
    proxyParts: [
      {
        geometry: canopyGeometry,
        material: makeTreeLeafMaterial(
          proxyCanopyColor(parts, proxyFallback),
          config,
          canopyGeometry.boundingBox,
          canopyGeometry,
          leafSurface,
          profile,
        ),
        kind: 'leaf',
      },
      {
        geometry: trunkGeometry,
        material: makeTreeTrunkMaterial(config),
        kind: 'trunk',
      },
    ],
  };
}

export function createCanopyClusterPart(config) {
  const geometry = new THREE.DodecahedronGeometry(0.5, 1);
  geometry.scale(1, 0.62, 1);
  geometry.translate(0, 0.5, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    geometry,
    material: makeTreeLeafMaterial(
      config.trees.leafBottom,
      config,
      geometry.boundingBox,
      geometry,
    ),
    kind: 'leaf',
  };
}

export function createForestUnderstoryPrototypes(config) {
  const logGeometry = new THREE.CylinderGeometry(0.12, 0.17, 1.8, 6, 1);
  logGeometry.rotateZ(Math.PI * 0.5);
  logGeometry.translate(0, 0.14, 0);
  logGeometry.computeBoundingBox();
  logGeometry.computeBoundingSphere();
  return [
    [{
      geometry: logGeometry,
      material: makeMaterial(config.trees.barkTint),
      kind: 'trunk',
    }],
  ];
}

export function createRockProxyPrototype(prototype, proxyColor = '#b8ad98') {
  prototype.geometry.computeBoundingBox();
  const bounds = prototype.geometry.boundingBox;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const geometry = new THREE.DodecahedronGeometry(0.5, 0);
  geometry.scale(
    Math.max(0.1, size.x),
    Math.max(0.1, size.y),
    Math.max(0.1, size.z),
  );
  geometry.translate(center.x, center.y, center.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = inheritCoatCoverage(prototype.material, prototype.material.clone());
  if ('map' in material) material.map = null;
  if ('color' in material) material.color = new THREE.Color(proxyColor);
  material.flatShading = true;
  material.needsUpdate = true;
  return {
    height: Math.max(0.1, size.y),
    parts: [{ geometry, material, kind: 'rock' }],
  };
}
