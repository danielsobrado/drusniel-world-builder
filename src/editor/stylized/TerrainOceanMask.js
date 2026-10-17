import { DataTexture, HalfFloatType, RGBAFormat, DataUtils } from 'three/webgpu';
import { Fn, If, float, floor, smoothstep, texture, textureSize, uniform, vec2, vec4 } from 'three/tsl';
import { bilinearLoad, TERRAIN_SLOT_KEY } from '../materials/TerrainSlotBindings.js';

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
export function createTerrainWaterContext(terrainUv, groundHeight, fieldSize) {
  const readTexture = object => waterSlot(object)?.waterFieldTexture;
  const fieldUv = terrainUv.mul((fieldSize - 1) / fieldSize).add(0.5 / fieldSize);
  const field = bilinearLoad(empty, fieldUv, readTexture);
  const origin = uniform(0).onObjectUpdate(({ object }) => waterSlot(object)?.surfaceOrigin.value ?? 0);
  const wet = uniform(0).onObjectUpdate(({ object }) => waterSlot(object)?.hasWaterCoverage ? 1 : 0);
  const readAppearance = object => waterSlot(object)?.waterAppearanceTexture ?? emptyAppearance;
  const filtered = bilinearLoad(emptyAppearance, fieldUv, readAppearance);
  const dimensions = vec2(textureSize(texture(emptyAppearance).setSampler(false)
    .setUpdateMatrix(true).onObjectUpdate(({ object }) => readAppearance(object))));
  const nearest = texture(emptyAppearance, floor(fieldUv.mul(dimensions))).setSampler(false)
    .setUpdateMatrix(true).onObjectUpdate(({ object }) => readAppearance(object));
  const context = Fn(() => {
    const result = vec4(0).toVar();
    If(wet.greaterThan(0), () => {
      const height = groundHeight.sub(field.g.add(origin));
      If(height.greaterThan(-16).and(height.lessThan(2.8)), () => {
        const kind = nearest.r.mul(255).round();
        result.assign(vec4(float(kind.equal(1)), filtered.g, filtered.b,
          smoothstep(-.1, .85, height).oneMinus().mul(float(kind.greaterThan(0)))));
      });
    });
    return result;
  })().toVar();
  return { ocean: context.r, organic: context.g, cold: context.b, wet: context.a };
}
