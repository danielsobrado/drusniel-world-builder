import { Color } from 'three/webgpu';
import {
  Fn, If, abs, cameraPosition, cameraWorldMatrix, clamp, dot, exp, float, fract, fwidth, length, max, mix, normalize,
  oneMinus, positionWorld, refract, smoothstep, step, vec2, vec3, vec4,
} from 'three/tsl';
import { acquireSnowDetailMaps } from '../assets/godsEnd/snowDetailMaps.js';
import { heightRelief } from '../materials/heightRelief.js';
import { PREVAILING_WIND } from '../materials/SnowAccumulation.js';
import { repeatMipTextureLoad } from './RepeatMipTextureLoad.js';
import { skyLightUniforms } from './sky/skyLight.js';
import { noise2, noised, snowWarp } from './SnowNoiseNodes.js';
import { snowSurfacePoint } from './SnowSurfaceState.js';

const color = (hex) => { const c = new Color(hex); return vec3(c.r, c.g, c.b); };
/** Frosted firn crust on wind-scoured ice hummocks. */
const ICE_FIRN = color('#bfd5e0');
/** Clear refracted glacial body colour (before Beer-Lambert path absorption). */
const ICE_CLEAR = color('#5abae0');
/** Deep crevasse & melt-hole abyss blue where red & green are absorbed over metres. */
const ICE_DEEP = color('#0c4c86');
/** Cryoconite & moraine silt drawn out along glacial flow bands. */
const GRIT = color('#54585c');
/** Beer-Lambert absorption per metre (red absorbed ~12x faster than blue). */
const ICE_ABSORB = vec3(1.65, 0.42, 0.14);
const ICE_IOR = 1.31;
const ICE_F0 = ((ICE_IOR - 1) / (ICE_IOR + 1)) ** 2;
const HUMMOCK_HEIGHT = 0.65;
const WIND = vec2(PREVAILING_WIND[0], PREVAILING_WIND[1]);
const WIND_ACROSS = vec2(-PREVAILING_WIND[1], PREVAILING_WIND[0]);
/** Internal parallax layer depths (metres) and UV repeat scales along the refracted ray. */
const INTERIOR_LAYERS = Object.freeze([
  { depth: 0.14, scale: 0.19, shift: vec2(0.0, 0.0) },
  { depth: 0.52, scale: 0.11, shift: vec2(0.37, 0.61) },
  { depth: 1.35, scale: 0.065, shift: vec2(0.73, 0.19) },
]);

/**
 * Upgraded open-world Glacier Ice shader (sampler-free, zero viewport copies):
 *
 *  - Uses CC0 packed `glacier-depth-pack.png` (R sharp cracks, G flow veins,
 *    B meltwater scallops) via `repeatMipTextureLoad`.
 *  - 3-layer refracted parallax interior along `refract(-V, N, 1/1.31)` with
 *    Beer-Lambert absorption and a critical-angle internal fracture plane.
 *  - Dual-specular Schlick Fresnel sky mirror (`glaze`) + sharp sun clearcoat
 *    glint (`sunGlaze`) for glossy melt channels against frosted firn ridges.
 *  - Branches cleanly behind `share > 0.01` so non-glacier biomes pay ~0 cost.
 */
export function createGlacierIceShading({
  terrainUv,
  chunkWorldSize,
  chunkCenter,
  tileShare,
  material = null,
  normal = null,
  sun = null,
}) {
  const packMaps = acquireSnowDetailMaps();
  if (packMaps && material) {
    const dispose = () => {
      packMaps.release();
      material.removeEventListener('dispose', dispose);
    };
    material.addEventListener('dispose', dispose);
  }

  const local = vec2(terrainUv.x.sub(0.5), float(0.5).sub(terrainUv.y)).mul(chunkWorldSize);
  const p = snowSurfacePoint(local, chunkCenter);
  const q = snowWarp(p);
  const footprint = length(fwidth(local)).toVar('glacierFootprint');
  const packUv = p.mul(1 / 16);
  const packDx = packUv.dFdx().toVar('glacierPackDx');
  const packDy = packUv.dFdy().toVar('glacierPackDy');
  const near = (wavelength) => oneMinus(smoothstep(wavelength * 0.02, wavelength * 0.065, footprint));

  const worldNormal = normal ? cameraWorldMatrix.mul(vec4(normal, 0)).xyz.normalize().toVar() : vec3(0, 1, 0);
  const view = normalize(cameraPosition.sub(positionWorld)).toVar();

  // Broad wind-drifted powder ribbons across bare glacier ice.
  const swell = noised(q.div(11)).x.toVar();
  const lee = dot(worldNormal.xz, WIND).mul(2.4).clamp(-0.3, 0.3);
  const tail = noise2(vec2(p.dot(WIND).div(85), p.dot(WIND_ACROSS).div(15)).add(vec2(q.y, q.x).div(42)));
  const ragged = noise2(q.div(7).add(vec2(11.9, -2.3))).mul(near(7)).mul(0.45)
    .add(noise2(q.div(3.1).add(vec2(-6.1, 9.4))).mul(near(3.1)).mul(0.32));
  const drift = tail.add(lee).sub(swell.mul(near(11)).mul(0.32)).add(ragged.mul(0.68));
  // Higher drift threshold exposes sweeping blue glacier ribs & melt troughs while keeping drifts intact.
  const powder = smoothstep(0.20, 0.29, drift);
  // Dissolve 4 m biome tile boundaries into organic wind-drifted ice/snow edges (zero leak when tileShare == 0).
  const edgeMask = smoothstep(0.01, 0.25, tileShare);
  const organicTile = smoothstep(0.24, 0.78, tileShare.add(ragged.mul(0.28)).add(tail.mul(0.16))).mul(edgeMask);
  const share = organicTile.mul(oneMinus(powder)).toVar('glacierIce');

  const ready = packMaps ? packMaps.ready : float(0);
  // Compute ice body color, roughness, hummock height, and Fresnel glaze inside a coherent branch.
  const iceOut = Fn(() => {
    // rgb = surface albedo, a = roughness
    const colRough = vec4(0.5, 0.7, 0.85, 0.28).toVar();
    If(share.greaterThan(0.008).and(packDx.x.equal(packDx.x)).and(packDy.x.equal(packDy.x)), () => {
      const broad = noised(q.div(3.4)).x;
      const scallopTap = packMaps
        ? repeatMipTextureLoad(packMaps.glacier, p.mul(0.22), packDx.mul(3.52), packDy.mul(3.52))
        : vec4(0.2, 0.2, 0.5, 1);
      const scallop = mix(float(0.5), scallopTap.b, ready);
      const hummock = swell.mul(0.58).add(broad.mul(0.44).mul(near(3.4)))
        .add(scallop.sub(0.5).mul(0.32).mul(near(1.6))).toVar();
      const trough = smoothstep(0.14, -0.38, hummock).toVar();

      // Refracted view ray into the glacier body (IOR 1.31).
      const into = refract(view.negate(), worldNormal, 1 / ICE_IOR).toVar();
      const ndv = clamp(dot(worldNormal, view), 0.04, 1);
      const pathDepth = mix(float(0.38), float(2.2), trough).mul(mix(float(1.55), float(0.75), ndv));
      const bodyTransmit = exp(ICE_ABSORB.mul(pathDepth).negate());

      // 3-layer refracted parallax interior cracks & veins (Beer-Lambert attenuated).
      const interiorGlow = vec3(0).toVar();
      const crackDensity = float(0).toVar();
      if (packMaps) {
        If(ready.greaterThan(0.5), () => {
          const veil = mix(float(0.22), float(1.45), oneMinus(trough));
          const parallaxFade = near(0.8);
          for (const layer of INTERIOR_LAYERS) {
            const shifted = p.add(into.xz.mul(layer.depth)).mul(layer.scale).add(layer.shift);
            const scaleMul = layer.scale * 16;
            const sample = repeatMipTextureLoad(packMaps.glacier, shifted, packDx.mul(scaleMul), packDy.mul(scaleMul));
            const crackLine = smoothstep(0.56, 0.88, sample.r);
            const veinLine = smoothstep(0.52, 0.86, sample.g).mul(0.55);
            const feat = max(crackLine, veinLine).mul(parallaxFade);
            const atten = exp(ICE_ABSORB.mul(-2 * layer.depth)).mul(exp(veil.mul(-layer.depth)));
            interiorGlow.addAssign(atten.mul(feat));
            crackDensity.assign(max(crackDensity, crackLine.mul(exp(float(-layer.depth)))));
          }
          // Critical-angle internal fracture sheet (adapted from IceInterior.js).
          const planeN = normalize(vec3(0.76, 0.32, 0.56));
          const across = dot(vec3(p.x, float(0), p.y), planeN).div(5.5);
          const toward = dot(into, planeN);
          const crossing = max(abs(toward), float(0.08));
          const ahead = mix(fract(across), fract(across).oneMinus(), step(0, toward));
          const dist = ahead.mul(5.5).div(crossing);
          const mirror = smoothstep(0.74, 0.52, crossing).mul(0.75).add(0.25);
          const sheet = exp(ICE_ABSORB.mul(dist.mul(-2))).mul(smoothstep(4.5, 2.2, dist)).mul(mirror).mul(0.28);
          interiorGlow.addAssign(sheet.mul(parallaxFade));
        });
      }

      // Melt holes & glacial moraine grit streaks.
      const hole = smoothstep(0.44, 0.52, noise2(q.div(1.5).add(vec2(-21.7, 3.1)))).mul(near(1.5));
      const gritStreak = mix(float(0), smoothstep(0.62, 0.88, scallopTap.g), ready)
        .mul(smoothstep(0.1, 0.55, noise2(p.div(28)))).mul(0.32);

      // Blend frosted firn crust -> clear refracted aqua -> deep cobalt crevasses + interior cracks.
      const firnShare = oneMinus(trough).mul(smoothstep(0.05, 0.55, hummock).mul(0.65).add(0.2)).mul(oneMinus(hole));
      const clearBody = mix(ICE_DEEP, ICE_CLEAR, clamp(bodyTransmit.b.mul(0.75).add(bodyTransmit.g.mul(0.25)), 0, 1))
        .mul(bodyTransmit.mul(0.55).add(0.45));
      let ice = mix(clearBody, ICE_FIRN, firnShare);
      ice = ice.add(interiorGlow.mul(vec3(0.48, 0.84, 1.0)).mul(0.62));
      ice = mix(ice, ICE_DEEP, max(hole.mul(0.72), smoothstep(-0.42, -0.62, hummock).mul(0.85)));
      ice = mix(ice, GRIT, gritStreak.mul(oneMinus(trough.mul(0.65))));

      // Glazed ice roughness: mirror-slick 0.08–0.14 in blue troughs & cracks, 0.42 on weathered firn.
      const iceRough = mix(float(0.42), float(0.09), max(trough, max(hole, crackDensity.mul(0.85))));
      colRough.assign(vec4(ice, iceRough));
    });
    return colRough;
  })().toVar('glacierIceOut');

  // Hummock + scallop height for normal relief.
  const reliefHeight = swell.mul(0.58)
    .add(noised(q.div(3.4)).x.mul(0.42).mul(near(3.4)))
    .mul(HUMMOCK_HEIGHT);

  // Schlick Fresnel sky glaze (emissive sky reflection on glassy ice) + crisp sun clearcoat highlight.
  const ndv = clamp(dot(worldNormal, view), 0.02, 1);
  const smooth = iceOut.a.oneMinus().clamp(0, 1);
  const fresnel = float(ICE_F0).add(float(1 - ICE_F0).mul(float(1).sub(ndv).pow(5)));
  const skyGlaze = skyLightUniforms.reflectionTint
    .mul(skyLightUniforms.brightness)
    .mul(vec3(0.72, 0.88, 1.0))
    .mul(fresnel.mul(smooth.mul(smooth)).mul(1.85))
    .mul(share);

  let sunGlaze = vec3(0);
  if (sun) {
    const halfDir = normalize(view.add(sun));
    const ndh = clamp(dot(worldNormal, halfDir), 0, 1);
    const spec = ndh.pow(mix(float(28), float(180), smooth)).mul(smooth).mul(fresnel.mul(1.6).add(0.18));
    // Backlit ice subsurface aqua glow when looking through hummocks into low sun.
    const back = clamp(dot(view, sun.negate()), 0, 1).pow(3.0).mul(0.28).mul(smooth);
    sunGlaze = vec3(0.92, 0.98, 1.0).mul(spec.mul(1.4)).add(ICE_CLEAR.mul(back)).mul(share);
  }

  return {
    share,
    glaze: skyGlaze,
    sunGlaze,
    apply(base) { return mix(base, iceOut.rgb, share); },
    roughness(base) { return mix(base, iceOut.a, share); },
    normal(base) { return mix(base, heightRelief(base, reliefHeight), share).normalize(); },
  };
}
