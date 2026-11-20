import { DataTexture, HalfFloatType, RGBAFormat, DataUtils } from 'three/webgpu';
import { Fn, If, float, max, mix, oneMinus, smoothstep, uniform, vec4 } from 'three/tsl';
import { bilinearLoad, TERRAIN_SLOT_KEY } from '../materials/TerrainSlotBindings.js';
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
  const field = bilinearLoad(empty, fieldUv, readTexture);
  const origin = uniform(0).onObjectUpdate(({ object }) => waterSlot(object)?.surfaceOrigin.value ?? 0);
  const wet = uniform(0).onObjectUpdate(({ object }) => waterSlot(object)?.hasWaterCoverage ? 1 : 0);
  const readAppearance = object => waterSlot(object)?.waterAppearanceTexture ?? emptyAppearance;
  // Decode each discrete texel before filtering its coverage. Interpolating IDs
  // could turn a none/lake boundary (0/2) into a fictional ocean (1).
  const filtered = bilinearLoad(emptyAppearance, fieldUv, readAppearance, value => {
    const kind = value.r.mul(255).round();
    return vec4(float(kind.equal(1)), value.g, value.b, float(kind.greaterThan(0)));
  });
  const context = Fn(() => {
    const result = vec4(0).toVar();
    If(wet.greaterThan(0), () => {
      const height = groundHeight.sub(field.g.add(origin));
      If(height.greaterThan(-16).and(height.lessThan(2.8)), () => {
        result.assign(vec4(filtered.r, filtered.g, filtered.b,
          // Damp up to 35 cm above the water: 85 cm smeared a dark ring
          // some 13 m wide round every gently shelving pool.
          smoothstep(-.05, .35, height).oneMinus().mul(filtered.a)));
      });
    });
    return result;
  })().toVar();
  // The bog's mud keeps the wide margin round its pools.
  const damp = Fn(() => {
    const result = float(0).toVar();
    If(wet.greaterThan(0), () => {
      const height = groundHeight.sub(field.g.add(origin));
      If(height.greaterThan(-16).and(height.lessThan(2.8)), () => {
        result.assign(smoothstep(-.1, .85, height).oneMinus().mul(filtered.a));
      });
    });
    return result;
  })().toVar();
  // The appearance alpha already carries sea energy. Read only the existing
  // texture, with no sampler, and only for the shallow coastal height band.
  const shelterHeightLimit = Math.max(MIN_SHELTER_HEIGHT_METERS,
    runupHeight + SHELTER_HEIGHT_MARGIN_METERS);
  const shelter = shelteredSurf ? Fn(() => {
    const result = float(1).toVar();
    If(wet.greaterThan(0), () => {
      const height = groundHeight.sub(field.g.add(origin));
      If(height.greaterThan(-16).and(height.lessThan(shelterHeightLimit)), () => {
        const exposed = bilinearLoad(emptyAppearance, fieldUv, readAppearance, value => {
          const isOcean = value.r.mul(255).round().equal(1);
          return value.a.mul(float(isOcean));
        });
        const relative = exposed.div(max(filtered.r, 0.0001));
        const transmission = createSeaShelterNode(relative, max(field.a, 0));
        result.assign(mix(float(1), transmission, smoothstep(0, 0.05, filtered.r)));
      });
    });
    return result;
  })().toVar('terrainSeaShelter') : float(1);
  return { ocean: context.r, organic: context.g, cold: context.b, wet: context.a, damp, shelter };
}
