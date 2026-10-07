import { DataTexture, HalfFloatType, RGBAFormat, DataUtils } from 'three/webgpu';
import { Fn, If, float, smoothstep, uniform } from 'three/tsl';
import { bilinearLoad, TERRAIN_SLOT_KEY } from '../materials/TerrainSlotBindings.js';
import { seaStateUniforms } from '../water/seaState.js';

// Neutral stand-in until the existing water slot is available. Shared by all terrain.
const empty = new DataTexture(new Uint16Array([0, DataUtils.toHalfFloat(10000), 0, 0]), 1, 1, RGBAFormat, HalfFloatType);
empty.needsUpdate = true;
const waterSlot = object => object?.userData?.[TERRAIN_SLOT_KEY]?.waterSlot;

/** Read the existing water field, without a sampler, only near the coastal height band. */
export function createTerrainOceanMask(terrainUv, groundHeight, fieldSize) {
  const readTexture = object => waterSlot(object)?.waterFieldTexture;
  const fieldUv = terrainUv.mul((fieldSize - 1) / fieldSize).add(0.5 / fieldSize);
  const field = bilinearLoad(empty, fieldUv, readTexture);
  const origin = uniform(0).onObjectUpdate(({ object }) => waterSlot(object)?.surfaceOrigin.value ?? 0);
  const wet = uniform(0).onObjectUpdate(({ object }) => waterSlot(object)?.hasWaterCoverage ? 1 : 0);
  return Fn(() => {
    const result = float(0).toVar();
    const height = groundHeight.sub(seaStateUniforms.seaLevel);
    If(wet.greaterThan(0).and(height.greaterThan(-16)).and(height.lessThan(2.8)), () => {
      result.assign(smoothstep(0.05, 0.3, field.g.add(origin).sub(seaStateUniforms.seaLevel).abs()).oneMinus());
    });
    return result;
  })().toVar();
}
