/** Derived recipe only: source format and authored biome IDs remain unchanged. */
export const PROCEDURAL_BIOME_RECIPE_REVISION = 2;
export function classifyProceduralBiome({height, temperature, moisture, heightScale, seaLevel}) {
    if (height <= seaLevel) {
      return 0;
    }
    if (temperature < -0.70 && moisture > -0.15
        && height > Math.max(seaLevel + 8, heightScale * 0.55)) {
      return 11;
    }
    if (temperature < -0.62) {
      return moisture < 0.15 ? 10 : 9;
    }
    if (temperature > 0.52 && moisture < -0.18) {
      return 1;
    }
    if (moisture < -0.52) {
      return temperature < 0 ? 2 : 3;
    }
    if (moisture > 0.58 && height < seaLevel + 4) {
      return 12;
    }
    if (moisture > 0.6) {
      return temperature > 0.35 ? 7 : 8;
    }
    if (moisture > 0.08) {
      return temperature > 0.3 ? 5 : 6;
    }
    return temperature > 0.25 ? 3 : 4;
}
