import * as THREE from 'three/webgpu';

const domeSample = new THREE.Color();

/**
 * The sky's light on the world — the hemisphere light's sky colour — for a
 * look.
 *
 * What a surface receives from the sky integrates the whole visible dome: the
 * paler band toward the horizon, the sun's aureole and the clouds, not only the
 * zenith. It is therefore much less saturated than the dome's zenith colour
 * (`highColor`), which the hemisphere used to take directly and which turned
 * every face out of the sun slate blue — worst on light, warm stone.
 * The low sun lights a band near the horizon. Under a continuous cloud deck,
 * the broad cloud base supplies diffuse light even when the zenith behind it
 * is dark. Blend those colours in linear space before controlling saturation.
 *
 * @param {{ highColor: string, lowColor?: string, cloudCore?: string, sunElevation?: number,
 *   nightness?: number, night?: boolean, overcastAmount?: number, ambientSaturation?: number }} look
 * @param {THREE.Color} [target]
 */
export function skyAmbientColor(look, target = new THREE.Color()) {
  target.set(look.highColor);
  const daylight = 1 - THREE.MathUtils.clamp(look.nightness ?? Number(Boolean(look.night)), 0, 1);
  if (daylight > 0 && look.lowColor && Number.isFinite(look.sunElevation)) {
    const lowSun = 1 - THREE.MathUtils.smoothstep(look.sunElevation, 0, 24);
    target.lerp(domeSample.set(look.lowColor), 0.16 * daylight * lowSun);
  }
  if (look.overcastAmount > 0 && look.cloudCore) {
    const cover = THREE.MathUtils.clamp(look.overcastAmount, 0, 1);
    target.lerp(domeSample.set(look.cloudCore), 0.65 * daylight * cover);
  }
  const saturation = Math.max(0, Math.min(1, look.ambientSaturation ?? 1));
  if (saturation === 1) return target;
  const luminance = target.r * 0.2126 + target.g * 0.7152 + target.b * 0.0722;
  return target.setRGB(
    luminance + (target.r - luminance) * saturation,
    luminance + (target.g - luminance) * saturation,
    luminance + (target.b - luminance) * saturation,
  );
}
