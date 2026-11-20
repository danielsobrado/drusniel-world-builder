import { DataTexture, HalfFloatType, RGBAFormat, DataUtils } from 'three/webgpu';
import { Fn, If, float, mat3, max, mix, smoothstep, uniform, vec3, vec4 } from 'three/tsl';
import { bilinearLoad, bilinearTexels, TERRAIN_SLOT_KEY } from '../materials/TerrainSlotBindings.js';
import { createSeaShelterNode } from './SeaDiffractionNodes.js';

const MIN_SHELTER_HEIGHT_METERS = 2.8;
const SHELTER_HEIGHT_MARGIN_METERS = 1.5;

// Neutral stand-in until the existing water slot is available. Shared by all terrain.
const empty = new DataTexture(new Uint16Array([0, DataUtils.toHalfFloat(10000), 0, 0]), 1, 1, RGBAFormat, HalfFloatType);
empty.needsUpdate = true;
const emptyAppearance = new DataTexture(new Uint8Array(4), 1, 1);
emptyAppearance.needsUpdate = true;
const waterSlot = object => object?.userData?.[TERRAIN_SLOT_KEY]?.waterSlot;

/** Read the existing water field, without a sampler, only near the coastal height band. */
export function createTerrainOceanMask(terrainUv, groundHeight, fieldSize) {
  return createTerrainWaterContext(terrainUv, groundHeight, fieldSize).ocean;
}

/** Share the slot's derived water identity with the ground without a sampler. */
export function createTerrainWaterContext(terrainUv, groundHeight, fieldSize,
  shelteredSurf = false, runupHeight = 0) {
  const readTexture = object => waterSlot(object)?.waterFieldTexture;
  const fieldUv = terrainUv.mul((fieldSize - 1) / fieldSize).add(0.5 / fieldSize);
  const origin = uniform(0).onObjectUpdate(({ object }) => waterSlot(object)?.surfaceOrigin.value ?? 0);
  const wet = uniform(0).onObjectUpdate(({ object }) => waterSlot(object)?.hasWaterCoverage ? 1 : 0);
  const readAppearance = object => waterSlot(object)?.waterAppearanceTexture ?? emptyAppearance;
  const shelterHeightLimit = Math.max(MIN_SHELTER_HEIGHT_METERS,
    runupHeight + SHELTER_HEIGHT_MARGIN_METERS);
  const context = Fn(() => {
    const identity = vec3(0).toVar();
    const response = vec3(0, 0, 1).toVar();
    If(wet.greaterThan(0), () => {
      const field = bilinearLoad(empty, fieldUv, readTexture).toVar();
      const height = groundHeight.sub(field.g.add(origin)).toVar();
      If(height.greaterThan(-17).and(height.lessThan(shelterHeightLimit)), () => {
        const { texels, blend } = bilinearTexels(emptyAppearance, fieldUv, readAppearance);
        const samples = texels.map(value => value.toVar());
        // Decode IDs before blending. A lake and dry ground cannot blend into ocean.
        const filtered = blend(samples.map(value => {
          const kind = value.r.mul(255).round();
          return vec4(float(kind.equal(1)), value.g, value.b, float(kind.greaterThan(0)));
        })).toVar();
        If(height.lessThan(MIN_SHELTER_HEIGHT_METERS), () => {
          const bedFade = smoothstep(-17, -10, height);
          identity.assign(vec3(filtered.r, filtered.gb.mul(bedFade)));
          response.x.assign(smoothstep(-.05, .35, height).oneMinus().mul(filtered.a).mul(bedFade));
          // Bog mud keeps its wider damp margin.
          response.y.assign(smoothstep(-.1, .85, height).oneMinus().mul(filtered.a).mul(bedFade));
        });
        if (shelteredSurf) {
          // Appearance alpha is zero for every non-ocean texel.
          const exposed = blend(samples.map(value => value.a));
          const relative = exposed.div(max(filtered.r, 0.0001));
          const transmission = createSeaShelterNode(relative, max(field.a, 0));
          response.z.assign(mix(float(1), transmission, smoothstep(0, 0.05, filtered.r).mul(smoothstep(-17, -10, height))));
        }
      });
    });
    return mat3(identity, response, vec3(0));
  })().toVar();
  const identity = context.element(0), response = context.element(1);
  return { ocean: identity.r, organic: identity.g, cold: identity.b,
    wet: response.x, damp: response.y, shelter: response.z };
}
