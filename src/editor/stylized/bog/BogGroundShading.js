import { Color } from 'three/webgpu';
import { dot, float, max, mix, smoothstep, vec3 } from 'three/tsl';
import { getRuntimeWaterDomainConfig } from '../../water/WaterConfig.js';

const color = hex => { const c = new Color(hex); return vec3(c.r, c.g, c.b); };

/** Peat the bog's ground leans toward, and the darker mud at the waterline. */
const PEAT = '#2b2c1d';
const MUD = '#191a12';
/** How far the ground goes to peat; the ground's own pattern keeps the rest. */
const PEAT_MIX = 0.62;
const WET_ROUGHNESS = 0.42;

/**
 * Bog ground (the water domain's bog tiles): whatever the shared terrain
 * layers painted — meadow root, dirt, the bank band — is pulled toward dark
 * peat that keeps its own pattern's value, and toward glossy black mud where
 * the ground meets a pool. Elsewhere it compiles to a multiply by zero.
 *
 * @param {object} options
 * @param {Node} options.color, options.roughness the surface so far
 * @param {Node} options.tileId the terrain tile id (0..255)
 * @param {Node} [options.wet] 0..1 shore wetness from the water context
 */
export function applyBogGround({ color: surface, roughness, tileId, wet = float(0) }) {
  const tileIds = getRuntimeWaterDomainConfig().bog?.tileIds ?? [];
  if (tileIds.length === 0) return { color: surface, roughness };
  let bog = float(0);
  for (const id of tileIds) bog = max(bog, float(tileId.equal(id)));
  const value = dot(surface, vec3(0.2126, 0.7152, 0.0722));
  // Keep the painted pattern's light and dark, on a peat hue.
  const peat = color(PEAT).mul(value.div(0.12).clamp(0.45, 1.6));
  const mud = mix(peat, color(MUD), smoothstep(0.15, 0.8, wet));
  const amount = bog.mul(mix(float(PEAT_MIX), float(0.9), wet));
  return {
    color: mix(surface, mud, amount),
    roughness: mix(roughness, mix(float(0.72), float(WET_ROUGHNESS), wet), bog),
  };
}
