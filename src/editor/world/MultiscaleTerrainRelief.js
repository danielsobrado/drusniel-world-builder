import { fractalValueNoise, valueNoise } from './valueNoise2d.js';
import { ridgedField } from './MountainRidges.js';

const DUNE_SEED = 0x517cc1b7;
const SNOWBANK_SEED = 0x2941a35f;
const MOUNTAIN_SEED = 0x6b2f91c3;

/** Asymmetric wind-dune profile: gentle stoss windward face, steeper slip-face crest. */
const DUNE_CREST = 0.76;
const DUNE_WAVELENGTH_METERS = 28;
const DUNE_SECONDARY_METERS = 13.5;
const DUNE_AMPLITUDE_METERS = 1.85;
const DUNE_SECONDARY_AMPLITUDE = 0.55;
const DUNE_ENVELOPE_METERS = 210;

const SNOWBANK_WAVELENGTH_METERS = 22;
const SNOWBANK_SASTRUGI_METERS = 7.5;
const SNOWBANK_AMPLITUDE_METERS = 1.25;
const SNOWBANK_SASTRUGI_AMPLITUDE = 0.32;
const SNOWBANK_ENVELOPE_METERS = 160;

const PROC_BELT_METERS = 1150;
const PROC_FOOTHILL_METERS = 290;
const PROC_MASSIF_STRETCH = 3.2;
const PROC_FOOTHILL_HEIGHT = 44;
const PROC_MASSIF_HEIGHT = 175;
const PROC_GULLY_DEPTH = 18;
const PROC_FINE_HEIGHT = 9;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Asymmetric saw-wave in [-1, 1] peaked at `crest` inside each [0, 1) period. */
function asymmetricWave(phase, crest = DUNE_CREST) {
  const frac = phase - Math.floor(phase);
  const ramp = frac < crest
    ? frac / crest
    : (1 - frac) / (1 - crest);
  const shaped = ramp * ramp * (3 - 2 * ramp);
  return shaped * 2 - 1;
}

/**
 * 3D surface dunes and snowbanks driven by local sand/snow exposure.
 * Safe at all coordinates and scales continuously toward 0 when masks are 0.
 */
export function climateSurfaceRelief(x, z, seed = 0, { sand = 0, snow = 0, mountain = 0 } = {}) {
  let offset = 0;

  if (sand > 0.01) {
    const s = seed ^ DUNE_SEED;
    const warpX = valueNoise(x / 68, z / 68, s + 1) * 14;
    const warpZ = valueNoise(x / 68, z / 68, s + 2) * 14;
    // Slight regional wind meander so dune trains curve across desert basins.
    const windProj = (x + warpX) * 0.84 + (z + warpZ) * 0.54;
    const crossProj = (z + warpZ) * 0.84 - (x + warpX) * 0.54;
    const primary = asymmetricWave(windProj / DUNE_WAVELENGTH_METERS, DUNE_CREST);
    const secondary = asymmetricWave((windProj * 0.72 + crossProj * 0.69) / DUNE_SECONDARY_METERS, 0.72);
    const envelope = smoothstep(-0.35, 0.35, valueNoise(x / DUNE_ENVELOPE_METERS, z / DUNE_ENVELOPE_METERS, s + 3));
    const slopeCalm = 1 - clamp(mountain * 0.65, 0, 0.65);
    const duneHeight = (primary * DUNE_AMPLITUDE_METERS + secondary * DUNE_SECONDARY_AMPLITUDE) * (0.25 + 0.75 * envelope);
    offset += duneHeight * clamp(sand, 0, 1) * slopeCalm;
  }

  if (snow > 0.05) {
    const s = seed ^ SNOWBANK_SEED;
    const warpX = valueNoise(x / 46, z / 46, s + 1) * 9;
    const warpZ = valueNoise(x / 46, z / 46, s + 2) * 9;
    const driftProj = (x + warpX) * 0.76 - (z + warpZ) * 0.65;
    const crossProj = (x + warpX) * 0.65 + (z + warpZ) * 0.76;
    const bank = asymmetricWave(driftProj / SNOWBANK_WAVELENGTH_METERS, 0.72);
    const sastrugi = valueNoise(
      (driftProj * 0.9 + crossProj * 0.3) / SNOWBANK_SASTRUGI_METERS,
      crossProj / (SNOWBANK_SASTRUGI_METERS * 2.2),
      s + 3,
    );
    const envelope = smoothstep(-0.4, 0.45, valueNoise(x / SNOWBANK_ENVELOPE_METERS, z / SNOWBANK_ENVELOPE_METERS, s + 4));
    const snowWeight = smoothstep(0.12, 0.75, snow);
    const driftHeight = (bank * SNOWBANK_AMPLITUDE_METERS + sastrugi * SNOWBANK_SASTRUGI_AMPLITUDE) * (0.3 + 0.7 * envelope);
    offset += driftHeight * snowWeight;
  }

  return offset;
}

/**
 * Regional mountain belts, progressive foothills, and erosion gullies for procedural worlds.
 * Starts gently above sea level so coasts remain unobstructed while interior uplands rise
 * cleanly through foothills into fractured alpine peaks.
 */
export function proceduralMountainRelief(x, z, seed = 0, baseHeight = 0, seaLevel = 0) {
  const s = seed ^ MOUNTAIN_SEED;
  const elevationFade = smoothstep(seaLevel + 4, seaLevel + 32, baseHeight);
  if (elevationFade <= 0) return 0;

  const beltNoise = fractalValueNoise(x / PROC_BELT_METERS, z / PROC_BELT_METERS, s + 1, 2)
    + valueNoise(x / (PROC_BELT_METERS * 0.45), z / (PROC_BELT_METERS * 0.45), s + 2) * 0.25;
  const foothillMask = smoothstep(-0.08, 0.42, beltNoise) * elevationFade;
  if (foothillMask <= 0) return 0;

  const massifMask = smoothstep(0.18, 0.68, beltNoise) * elevationFade;
  const foothillRoll = (0.5 + 0.5 * fractalValueNoise(x / PROC_FOOTHILL_METERS, z / PROC_FOOTHILL_METERS, s + 3, 2))
    * PROC_FOOTHILL_HEIGHT * foothillMask;
  if (massifMask <= 0) return foothillRoll;

  const macroRidge = ridgedField(x / PROC_MASSIF_STRETCH, z / PROC_MASSIF_STRETCH, s + 4);
  const secondaryRidge = ridgedField(x * 1.4, z * 1.4, s + 5);
  const peakCore = Math.max(0, macroRidge - 0.18) * PROC_MASSIF_HEIGHT * (0.55 + 0.45 * secondaryRidge);

  // Branching erosion gullies carve down flanks without punching deep holes below foothills.
  const gullyPhase = valueNoise(x / 115, z / 115, s + 6);
  const gullyCrease = (1 - Math.abs(gullyPhase)) ** 3;
  const flankBand = smoothstep(0.15, 0.55, macroRidge) * (1 - smoothstep(0.75, 0.96, macroRidge));
  const gullyCut = gullyCrease * flankBand * PROC_GULLY_DEPTH;

  const fineCrags = (ridgedField(x * 3.1, z * 3.1, s + 7) - 0.4) * PROC_FINE_HEIGHT * smoothstep(0.35, 0.8, macroRidge);
  return foothillRoll + Math.max(0, peakCore - gullyCut + fineCrags) * massifMask;
}
