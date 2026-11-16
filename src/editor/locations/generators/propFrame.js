const P = (x, y, z) => ({ x, y, z });

/** Returns a local `(lx, ly, lz)` -> world `{ x, y, z }` mapper rotated around Y by `yaw`. */
export function atFrame(origin, yaw = 0) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (lx, ly, lz) => P(origin.x + lx * c + lz * s, origin.y + ly, origin.z - lx * s + lz * c);
}
