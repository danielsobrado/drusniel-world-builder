import { Color } from 'three/webgpu';
import { mix, smoothstep, vec3 } from 'three/tsl';
import { resolveSeaOptics } from '../water/SeaOptics.js';
import { seaStateUniforms } from '../water/seaState.js';

function colorNode(value) {
  const color = new Color(value);
  return vec3(color.r, color.g, color.b);
}

/** Palette and transmission share the sea mask; inland optics keep their own response. */
export function createSeaOpticsNodes(waterDepth, source) {
  const settings = resolveSeaOptics(source);
  const palette = name => mix(colorNode(settings.sunny[name]), colorNode(settings.storm[name]), seaStateUniforms.storm);
  const shallow = mix(palette('lagoon'), palette('shallow'), smoothstep(settings.lagoonStart, settings.lagoonEnd, waterDepth));
  return {
    settings,
    color: mix(shallow, palette('deep'), smoothstep(settings.deepStart, settings.deepEnd, waterDepth)),
    absorption: vec3(...settings.absorptionCoefficients),
  };
}
