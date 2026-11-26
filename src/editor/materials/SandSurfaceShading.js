import {
  Fn,
  If,
  cameraPosition,
  clamp,
  cross,
  dot,
  float,
  floor,
  fract,
  fwidth,
  int,
  length,
  max,
  mix,
  normalize,
  positionWorld,
  select,
  smoothstep,
  uint,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { latticeHashNode } from '../weather/wind/windNoise.js';
import { repeatMipTextureLoad } from '../stylized/RepeatMipTextureLoad.js';

/** World-locked quartz grain glint cell sizes (metres): finer than snow crystals. */
const FINE_QUARTZ_CELL = 0.042;
const COARSE_QUARTZ_CELL = 0.135;
const QUARTZ_FACET_SHARE = 0.34;
const QUARTZ_FADE = [0.45, 2.0];

/** Reoriented Normal Mapping (RNM): preserves base slope while layering micro-grain normals. */
export function blendNormalRNM(base, detail) {
  const t = base.add(vec3(0, 0, 1));
  const u = detail.mul(vec3(-1, -1, 1));
  return normalize(t.mul(dot(t, u)).sub(u.mul(t.z)));
}

export function unpackTangentNormal(rg) {
  const xy = rg.mul(2).sub(1);
  return vec3(xy, max(float(0), float(1).sub(dot(xy, xy))).sqrt());
}

function cellHash(originMeters, cell, salt) {
  return latticeHashNode(
    uint(int(originMeters.x)).add(uint(int(cell.x)).mul(uint(0x9e3779b1))).add(uint(salt)),
    uint(int(originMeters.y)).add(uint(int(cell.y)).mul(uint(0x85ebca6b))).add(uint(salt * 7919)),
  );
}

/** Single octave of warm golden-ivory quartz micro-facet glints. */
function quartzOctave({ localMeters, originMeters, cellMeters, salt, normal, halfVector, sharpness }) {
  const point = localMeters.div(cellMeters);
  const cell = floor(point);
  const local = fract(point);
  const jitter = vec2(cellHash(originMeters, cell, salt), cellHash(originMeters, cell, salt + 1));
  const centre = jitter.mul(0.74).add(0.13);
  const distance = length(local.sub(centre)).div(0.22);
  const disc = clamp(float(1).sub(distance.mul(distance)), 0, 1);
  const angle = cellHash(originMeters, cell, salt + 2).mul(Math.PI * 2);
  const tilt = cellHash(originMeters, cell, salt + 3).mul(0.38).add(0.06);
  const up = select(normal.y.abs().greaterThan(0.95), vec3(1, 0, 0), vec3(0, 1, 0));
  const tangent = normalize(cross(up, normal));
  const bitangent = cross(normal, tangent);
  const facet = normalize(normal.add(tangent.mul(angle.cos()).add(bitangent.mul(angle.sin())).mul(tilt)));
  const response = disc.mul(clamp(dot(facet, halfVector), 0, 1).pow(sharpness));
  const mineral = cellHash(originMeters, cell, salt + 5);
  // Warm golden-quartz to crisp pale-silica micro-sparkle (distinct from snow's cyan ice glints).
  const tint = mix(vec3(1.06, 0.94, 0.76), vec3(1.04, 1.0, 0.92), mineral);
  const holds = cellHash(originMeters, cell, salt + 4).lessThan(QUARTZ_FACET_SHARE);
  return select(holds, tint.mul(response), vec3(0));
}

/**
 * Multi-scale sampler-free quartz micro-grain normal and sparkle mask sampled
 * from `sand-detail-pack.png` (`RG` normal, `B` wind wave, `A` grain sparkle).
 * Returns vec4(worldSlopeX, worldSlopeZ, grainVariation, sparkleMask).
 */
export function sampleSandMicroGrain({
  point,
  dx,
  dy,
  footprint,
  maps,
  active,
  strength = float(1),
}) {
  if (!maps) return vec4(0, 0, 0.5, 0.5);
  const ready = active.mul(maps.ready).clamp(0, 1);
  return Fn(() => {
    const out = vec4(0, 0, 0.5, 0.5).toVar();
    If(ready.greaterThan(0.002).and(dx.x.equal(dx.x)).and(dy.x.equal(dy.x)).and(footprint.greaterThanEqual(0)), () => {
      const acc = vec3(0, 0, 1).toVar();
      const grainVar = float(0.5).toVar();
      const sparkle = float(0.5).toVar();
      // Fine quartz grain (~0.25 m tile, 32 * 1/8 = 4 repeats/m -> seamless across 8 m chunk mod).
      const f0 = smoothstep(0.004, 0.038, footprint).oneMinus();
      If(f0.greaterThan(0.002), () => {
        const s0 = repeatMipTextureLoad(maps.detail, point.mul(32), dx.mul(32), dy.mul(32));
        acc.assign(blendNormalRNM(acc, mix(vec3(0, 0, 1), unpackTangentNormal(s0.xy), f0.mul(0.85))));
        sparkle.assign(mix(sparkle, s0.a, f0));
      });
      // Mid sand grit & micro-ripple texture (~1.0 m tile, 8 * 1/8 = 1 repeat/m).
      const f1 = smoothstep(0.025, 0.24, footprint).oneMinus();
      If(f1.greaterThan(0.002), () => {
        const s1 = repeatMipTextureLoad(maps.detail, point.mul(8), dx.mul(8), dy.mul(8));
        acc.assign(blendNormalRNM(acc, mix(vec3(0, 0, 1), unpackTangentNormal(s1.xy), f1.mul(0.75))));
        grainVar.assign(mix(grainVar, s1.a.mul(0.6).add(s1.b.mul(0.4)), f1));
      });
      // Broad sand-sheet sheen (~4.0 m tile, 2 * 1/8 = 0.25 repeats/m).
      const f2 = smoothstep(0.18, 1.4, footprint).oneMinus();
      If(f2.greaterThan(0.002), () => {
        const s2 = repeatMipTextureLoad(maps.detail, point.mul(2), dx.mul(2), dy.mul(2));
        grainVar.assign(mix(grainVar, s2.b, f2.mul(0.45)));
      });
      const scale = strength.mul(ready);
      out.assign(vec4(acc.x.mul(scale), acc.y.mul(scale), grainVar, sparkle));
    });
    return out;
  })().toVar('sandMicroGrain');
}

/**
 * Sunlit quartz crystal glints + warm grazing sand sheen (velvet/Oren-Nayar rim).
 * Returned as a `sunResponse` vec3 per unit of incoming sun light so the terrain
 * lighting model multiplies it by `input.lightColor` (never glowing in shadow).
 */
export function createSandOpticalResponse({
  localMeters,
  originMeters,
  worldNormal,
  sun,
  sandWeight,
  sparkleMask = float(0.75),
  glintGain = 1.0,
  sheenGain = 1.0,
}) {
  if (!sun) return vec3(0);
  const footprint = length(fwidth(localMeters)).toVar('sandGlintFootprint');
  const normal = normalize(worldNormal).toVar();
  const view = normalize(cameraPosition.sub(positionWorld));
  const halfVector = normalize(view.add(sun));
  const ndv = clamp(dot(normal, view), 0, 1);
  const facingSun = clamp(dot(normal, sun), 0, 1);
  const lightGate = smoothstep(0.05, 0.3, facingSun);
  const graze = float(1).sub(ndv).pow(2.2).mul(0.68).add(0.32);

  const glints = Fn(() => {
    const result = vec3(0).toVar();
    If(sandWeight.greaterThan(0.015).and(footprint.greaterThanEqual(0)), () => {
      const fine = quartzOctave({
        localMeters, originMeters, cellMeters: FINE_QUARTZ_CELL, salt: 107, normal, halfVector, sharpness: 120,
      }).mul(float(1).sub(smoothstep(FINE_QUARTZ_CELL * QUARTZ_FADE[0], FINE_QUARTZ_CELL * QUARTZ_FADE[1], footprint)));
      const coarse = quartzOctave({
        localMeters, originMeters, cellMeters: COARSE_QUARTZ_CELL, salt: 163, normal, halfVector, sharpness: 240,
      }).mul(float(1).sub(smoothstep(COARSE_QUARTZ_CELL * QUARTZ_FADE[0], COARSE_QUARTZ_CELL * QUARTZ_FADE[1], footprint)))
        .mul(1.15);
      const grainBoost = sparkleMask.smoothstep(0.25, 0.85).mul(0.65).add(0.35);
      result.assign(fine.add(coarse).mul(graze).mul(lightGate).mul(grainBoost).mul(sandWeight).mul(glintGain));
    });
    return result;
  })();

  // Warm grazing silica rim + subtle forward-scatter glow across sunlit ripple crests.
  const rim = float(1).sub(ndv).pow(2.8)
    .mul(smoothstep(0.06, 0.55, facingSun.add(0.15)))
    .mul(sandWeight);
  const backlit = dot(view.negate(), sun).clamp(0, 1).pow(2.5).mul(0.35).add(0.65);
  const velvet = vec3(1.0, 0.89, 0.72).mul(rim.mul(backlit).mul(0.14 * sheenGain));

  return glints.mul(1.45).add(velvet);
}
