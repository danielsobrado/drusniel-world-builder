/** Shading saturation only; water geometry, collision and placement are unchanged. */
export function terrainWetlandWetness(existing,tileId,slope) {
  if(tileId!==12)return existing;
  const t=Math.max(0,Math.min(1,(slope-.05)/.20));
  return Math.max(existing,.35+.35*(1-t*t*(3-2*t)));
}
