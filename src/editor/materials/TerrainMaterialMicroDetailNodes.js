import { dot, sin, smoothstep, vec2 } from 'three/tsl';

const PRIMARY_DIRECTION = Object.freeze([1.73, 2.31]);
const SECONDARY_DIRECTION = Object.freeze([-2.17, 1.41]);
const TERTIARY_DIRECTION = Object.freeze([0.83, -2.67]);
const WARP_DIRECTION = Object.freeze([0.37, 0.61]);

/** Phase changes are radians per pixel. Fade before the Nyquist limit (PI). */
export function filteredDetailSine(phase) {
  const footprint = phase.fwidth();
  return sin(phase).mul(smoothstep(Math.PI * 0.5, Math.PI, footprint).oneMinus());
}

export function createTerrainOrientedMicroDetail({
  planarMeters,
  scaleMeters,
  strength,
  visibility,
}) {
  const warp = sin(
    dot(planarMeters, vec2(...WARP_DIRECTION)).div(scaleMeters * 4.7),
  ).mul(0.55);
  const primary = filteredDetailSine(
    dot(planarMeters, vec2(...PRIMARY_DIRECTION)).div(scaleMeters).add(warp),
  );
  const secondary = filteredDetailSine(
    dot(planarMeters, vec2(...SECONDARY_DIRECTION))
      .div(scaleMeters * 0.71)
      .sub(warp.mul(0.43)),
  );
  const tertiary = filteredDetailSine(
    dot(planarMeters, vec2(...TERTIARY_DIRECTION))
      .div(scaleMeters * 0.47)
      .add(warp.mul(0.27)),
  );
  return primary.mul(0.52)
    .add(secondary.mul(0.31))
    .add(tertiary.mul(0.17))
    .mul(strength)
    .mul(visibility);
}
