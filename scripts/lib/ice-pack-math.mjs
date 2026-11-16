/**
 * Ice surface height, 0..1: flowing melt ridges, pocked by melt holes, with
 * fractures cut in as narrow grooves. Wraps, so its normal tiles.
 */
export function iceHeight({ ripple, pits, cracks }) {
  return Float32Array.from(ripple, (r, i) => Math.min(1, Math.max(0,
    r * 0.72 + (1 - pits[i]) * 0.18 - cracks[i] * 0.3 + 0.12)));
}

/**
 * Tangent-space normal from a wrapping height field (central differences),
 * packed as two bytes per texel (x, y); the shader rebuilds z.
 */
export function packNormal(height, size, strength) {
  const out = new Uint8Array(size * size * 2);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      out[(y * size + x) * 2] = Math.round((-dx / length * 0.5 + 0.5) * 255);
      out[(y * size + x) * 2 + 1] = Math.round((-dy / length * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

/** Glazed clear ice, rougher where it is frosted, pitted or cracked. */
export function iceRoughness({ cloud, cracks, pits }) {
  return Float32Array.from(cloud, (c, i) => Math.min(1, 0.06 + c * 0.38 + cracks[i] * 0.28 + (1 - pits[i]) * 0.1));
}
