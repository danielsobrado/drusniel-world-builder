import { frameUniform } from '../../../render/FrameUniforms.js';
import * as THREE from 'three/webgpu';
import {
  cameraPosition, clamp, color, dot, float, max, mix, normalGeometry, normalWorld, normalize,
  positionGeometry, positionWorld, reflect, smoothstep, texture, vec3,
} from 'three/tsl';
import { skyLightUniforms } from '../sky/skyLight.js';
import { barkPackedNormal } from '../forest/TreeBarkMaterial.js';
import { acquireIceTextures } from './iceTextures.js';

const DEEP = '#0b5aa8';
const CLEAR = '#4cc4ee';
/** Weathered surface ice: an iceberg reads white from any distance, blue only where it is cut open. */
const WEATHERED = '#d6e7ef';
const FROST = '#eef7fb';
const SNOW = '#f4f8fa';
/**
 * Texture repeats per geometry unit (a berg is one unit, scaled 26-110 m). The
 * fine scale is surface relief a few metres across; the coarse one lays out the
 * blue cracks and veins and breaks the fine one's repeat, which alone drew a grid.
 */
const FINE_PER_UNIT = 9;
const COARSE_PER_UNIT = 2.2;
/** How far the view ray reaches into the body, in coarse repeats: the veins slide behind the surface. */
const INNER_REACH = 0.12;

/** Three planar taps blended by the facet's facing: a berg has faces every way. */
function triplanar(map, point, weights) {
  const planes = [point.yz, point.zx, point.xy];
  const taps = planes.map((uv) => texture(map, uv));
  return { planes, taps, value: taps[0].mul(weights.x).add(taps[1].mul(weights.y)).add(taps[2].mul(weights.z)) };
}

/** The packed normals, each decoded in its own plane's tangent frame (as the bark does), blended. */
function blendedNormal(sampled, weights) {
  const w = [weights.x, weights.y, weights.z];
  return sampled.taps.map((tap, i) => barkPackedNormal(tap, sampled.planes[i]))
    .reduce((sum, normal, i) => sum.add(normal.mul(w[i])), vec3(0));
}

/**
 * Glacial ice with a real PBR surface (the ice set, iceTextures.js): weathered
 * white ice cut open in blue along cracks, veins, steep walls and the wet
 * waterline band; melt relief in the normal map at two scales; glazed where blue
 * and rough where weathered, a clear coat over the blue, veins read behind the
 * surface along the view ray, and frost crystals that catch the sun.
 * Opaque, because a viewport refraction would charge the whole frame
 * (CLAUDE.md); the light through the ice is emission around the sun.
 *
 * @param {import('three').Vector3} sunDirection the live sun, turned in place
 * @param {number} seaLevel world metres
 */
export function createIceMaterial({ sunDirection, seaLevel }) {
  const { detail, surface } = acquireIceTextures();
  const material = new THREE.MeshPhysicalNodeMaterial({ name: 'frosted-ice' });
  const view = normalize(cameraPosition.sub(positionWorld)).toVar();
  const sun = normalize(frameUniform(sunDirection));
  const facing = normalGeometry.abs().pow(4);
  const weights = facing.div(dot(facing, vec3(1)).max(1e-4)).toVar();
  const fine = positionGeometry.mul(FINE_PER_UNIT).toVar();
  const coarse = positionGeometry.mul(COARSE_PER_UNIT).toVar();

  const masks = triplanar(detail, coarse, weights).value.toVar();
  const fineSurface = triplanar(surface, fine, weights);
  const coarseSurface = triplanar(surface, coarse, weights);
  material.normalNode = blendedNormal(fineSurface, weights).mul(0.55)
    .add(blendedNormal(coarseSurface, weights).mul(0.45)).normalize();

  // Where the berg is cut open: fracture lines and veins (coarse), steep walls, the wet band.
  const wet = smoothstep(seaLevel + 0.3, seaLevel + 2.4, positionWorld.y).oneMinus();
  const steep = smoothstep(0.55, 0.95, normalWorld.y.abs().oneMinus());
  const blueShare = clamp(smoothstep(0.32, 0.75, masks.b.mul(0.9).add(masks.r.mul(0.45)))
    .add(steep.mul(0.25)).add(wet.mul(0.7)), 0, 1).toVar();
  // Refracted 3-channel chromatic parallax into the iceberg interior (adapted from Snowflow crystal.fragment.wgsl, MIT).
  const innerR = texture(detail, coarse.xz.sub(view.xz.mul(INNER_REACH * 0.92))).r;
  const innerG = texture(detail, coarse.xz.sub(view.xz.mul(INNER_REACH * 1.0))).r;
  const innerB = texture(detail, coarse.xz.sub(view.xz.mul(INNER_REACH * 1.12))).r;
  const inner = innerR.mul(0.25).add(innerG.mul(0.45)).add(innerB.mul(0.30));
  const dispersion = vec3(innerR, innerG, innerB).mul(vec3(0.45, 0.82, 1.0)).mul(0.26);
  const blue = mix(color(DEEP), color(CLEAR), smoothstep(0.15, 0.75, masks.g.mul(0.7).add(inner.mul(0.5))))
    .add(dispersion).toVar();
  const weathered = mix(color(WEATHERED), color(FROST), masks.g);
  const cap = smoothstep(0.62, 0.86, normalWorld.y.add(masks.g.sub(0.4).mul(0.5))).toVar();
  material.colorNode = mix(mix(weathered, blue, blueShare), color(SNOW), cap);

  material.roughnessNode = mix(mix(fineSurface.value.b.max(0.35), float(0.08), blueShare), float(0.82), cap);
  material.metalnessNode = float(0);
  material.iorNode = float(1.31);
  // A glaze over the blue, cut-open ice: the sharp second highlight that reads as ice.
  material.clearcoatNode = blueShare.mul(cap.oneMinus()).mul(0.85);
  material.clearcoatRoughnessNode = float(0.05);

  // Light through the ice where it is thin and blue, most of all toward a backlighting sun.
  const through = max(dot(view, sun.negate()), 0).pow(3).mul(0.9).add(0.12);
  const glow = blue.mul(through).mul(blueShare).mul(cap.oneMinus());
  // Frost crystals: the roughest texels of the weathered ice catch the sun as points.
  const mirror = max(dot(reflect(view.negate(), normalWorld), sun), 0).pow(48);
  const crystals = smoothstep(0.76, 0.82, fineSurface.value.b).mul(mirror).mul(blueShare.oneMinus()).mul(1.6);
  material.emissiveNode = glow.mul(skyLightUniforms.brightness).add(skyLightUniforms.sunColor.mul(crystals));
  return material;
}
