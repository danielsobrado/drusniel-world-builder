import { abs, float, smoothstep, uv } from 'three/tsl';

/**
 * Fades a spell card's alpha toward its bottom and side edges. The palm rings
 * are centred on the bottom edge, so without it the card's straight edge cut
 * every ring and glow in half with a hard line.
 */
export function spellCardEdgeFade(width = 0.08) {
  const coords = uv();
  return smoothstep(0, width, coords.y).mul(smoothstep(0, width, float(1).sub(abs(coords.x.sub(0.5)).mul(2))));
}
