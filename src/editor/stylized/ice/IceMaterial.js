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
const VEIN = '#c4ecfb';
const FROST = '#e6f6fc';
const SNOW = '#f2f7fa';
/** Texture repeats per geometry unit: a berg is 26-110 m across, so a repeat is a few metres. */
const DETAIL_PER_UNIT = 9;
/** How far the view ray reaches into the body, in texture repeats: the veins slide behind the surface. */
const INNER_REACH = 0.35;

/** Three planar taps blended by the facet's facing: a berg has faces every way. */
function triplanar(map, point, weights) {
  const taps = [point.yz, point.zx, point.xy].map((uv) => texture(map, uv));
  return { taps, value: taps[0].mul(weights.x).add(taps[1].mul(weights.y)).add(taps[2].mul(weights.z)) };
}

/**
 * Glacial ice with a real PBR surface (the ice set, iceTextures.js): melt
 * ridges and cracks in the normal map, glazed where clear and rough where
 * frosted, a clear coat over all of it, veins and milky cloud read behind the
 * surface along the view ray, and frost crystals that sparkle toward the sun.
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
  const point = positionGeometry.mul(DETAIL_PER_UNIT).toVar();
  const facing = normalGeometry.abs().pow(4);
  const weights = facing.div(dot(facing, vec3(1)).max(1e-4)).toVar();

  const inclusions = triplanar(detail, point, weights).value.toVar();
  const packed = triplanar(surface, point, weights);
  // The packed normals, each decoded in its own plane's tangent frame (as the bark does).
  const planes = [point.yz, point.zx, point.xy];
  material.normalNode = packed.taps.map((tap, i) => barkPackedNormal(tap, planes[i]))
    .reduce((sum, normal, i) => sum.add(normal.mul([weights.x, weights.y, weights.z][i])), vec3(0)).normalize();

  // Behind the surface: the veins again, a little way down the view ray.
  const inner = texture(detail, point.xz.sub(view.xz.mul(INNER_REACH))).r;
  const rim = float(1).sub(clamp(dot(normalWorld, view), 0, 1)).pow(2.5);
  const veins = max(inclusions.r.mul(0.6), inner.mul(0.8)).toVar();
  const cloud = inclusions.g;
  const body = mix(color(DEEP), color(CLEAR), smoothstep(0.1, 0.7, cloud.mul(0.8).add(veins.mul(0.35)))).toVar();
  const frost = smoothstep(0.35, 0.8, cloud.add(rim.mul(0.45))).toVar();
  const cap = smoothstep(0.62, 0.86, normalWorld.y.add(cloud.sub(0.4).mul(0.5))).toVar();
  const cracked = mix(mix(body, color(VEIN), veins.mul(0.4)), color(FROST), inclusions.b.mul(0.55));
  const ice = mix(cracked, color(FROST), frost.mul(0.75));
  const wet = smoothstep(seaLevel + 0.3, seaLevel + 1.6, positionWorld.y).oneMinus().mul(cap.oneMinus());
  material.colorNode = mix(mix(ice, ice.mul(color(CLEAR)), wet), color(SNOW), cap);

  material.roughnessNode = mix(packed.value.b, float(0.82), cap);
  material.metalnessNode = float(0);
  material.iorNode = float(1.31);
  // A glaze over the clear ice: the second, sharp highlight that makes ice read as ice.
  material.clearcoatNode = cap.oneMinus().mul(frost.mul(0.6).oneMinus()).mul(0.8);
  material.clearcoatRoughnessNode = float(0.05);

  // Light through the ice, most of all toward a backlighting sun.
  const through = max(dot(view, sun.negate()), 0).pow(3).mul(0.9).add(0.14);
  const glow = body.mul(through).mul(cap.oneMinus()).mul(frost.mul(0.6).oneMinus());
  // Frost crystals: rare texels of the packed roughness catch the sun as points.
  const mirror = max(dot(reflect(view.negate(), normalWorld), sun), 0).pow(40);
  const crystals = smoothstep(0.62, 0.7, packed.value.b).mul(mirror).mul(frost.add(cap)).mul(3);
  material.emissiveNode = glow.mul(skyLightUniforms.brightness).add(skyLightUniforms.sunColor.mul(crystals));
  return material;
}
