// Original Gods’ End design; canonical dimensions are in metres.
export function house005(k) {
  const floor = 2.3, eave = 3.6;
  const ground = k.walls('darkStone', { x0: -3.6, x1: 3.4, z0: -1.0, z1: 4.5, y0: 0, y1: floor, topShade: 0.4 });
  k.plinth('darkStone', { x0: -3.6, x1: 3.4, z0: -1.0, z1: 4.5 });
  for (const w of Object.values(ground)) k.quoins(w, 'start', 0, floor, { material: 'darkStone', tint: 1.6 });
  k.window(ground.front, 1.6, 1.0, 0.9, 0.45, { mullion: false });
  k.window(ground.front, 5.3, 1.0, 0.9, 0.45, { mullion: false });
  k.window(ground.left, 3.0, 0.45, 0.9, 1.4, { arch: true });
  k.window(ground.right, 2.5, 0.45, 0.9, 1.4, { arch: true });
  k.door(ground.back, 1.7, 1.0, 2.0, { tint: 0.7 });
  k.window(ground.back, 4.6, 0.5, 0.9, 1.4, { arch: true });
  k.box('wood', [-4.0, floor - 0.1, -1.3], [3.8, floor + 0.12, 4.75], { tint: 0.75 });
  const band = k.walls('plaster', { x0: -3.9, x1: 3.7, z0: -1.25, z1: 4.7, y0: floor + 0.1, y1: eave, tint: [0.78, 0.7, 0.6], topShade: 0.4 });
  for (const w of Object.values(band)) k.timberFrame(w, { y0: floor + 0.15, y1: eave - 0.05, spacing: 1.3, braces: 'none' });
  k.gableRoof({
    x0: -3.9, x1: 3.7, z0: -1.25, z1: 4.7, axis: 'x', wallTop: eave, ridgeY: 6.4, sag: 0.25, overhang: 0.35, endOverhang: 0.9,
    gableMaterial: 'plaster', gableTint: [0.75, 0.68, 0.58], gableFrame: true, purlins: 3,
  });
  for (const [x, dir] of [[-3.9, -1], [3.7, 1]]) {
    const w = k.wall([x + dir * 0.02, dir > 0 ? 2.25 : 1.2], [dir, 0, 0], 1.05);
    k.window(w, 0.52, 4.0, 0.7, 0.6, { shutters: true });
  }
  k.chimney({ x: -2.7, z: -0.85, w: 0.85, d: 0.85, y0: 0, y1: 7.0, material: 'darkStone', pots: 0, tint: 0.9 });
  k.chimney({ x: 2.9, z: 2.9, w: 0.9, d: 0.75, y0: 3.0, y1: 6.6, material: 'darkStone', pots: 2, tint: 0.9 });
  // The forge shed: a plank lean-to on posts with knee braces.
  const [x0, x1, z0, z1] = [-4.0, 3.5, -5.0, -1.25];
  const hi = 3.55, lo = 3.05;
  k.poly('deck', [[x0, lo, z0], [x1, lo, z0], [x1, hi, z1], [x0, hi, z1]], { facing: [0, 1, 0], tint: [0.72, 0.7, 0.68] });
  k.poly('deck', [[x0, lo - 0.12, z0], [x1, lo - 0.12, z0], [x1, hi - 0.12, z1], [x0, hi - 0.12, z1]], { facing: [0, -1, 0], tint: 0.6 });
  k.poly('wood', [[x0, lo - 0.12, z0], [x1, lo - 0.12, z0], [x1, lo, z0], [x0, lo, z0]], { facing: [0, 0, -1], tint: 0.7 });
  for (const x of [x0 + 0.2, (x0 + x1) / 2, x1 - 0.2]) {
    // Posts reach below the ground line, like the plinth, for a falling slope.
    k.beam('wood', [x, -2, z0 + 0.2], [x, lo - 0.1, z0 + 0.2], 0.2);
    k.beam('wood', [x, lo - 0.9, z0 + 0.2], [x, lo - 0.15, z0 + 1.0], 0.12);
    k.beam('wood', [x, lo - 0.2, z0], [x, hi - 0.2, z1], 0.16, { tint: 0.8 });
  }
  // Forge hearth and anvil under the shed.
  k.box('darkStone', [-2.6, -2, -3.4], [-0.8, 0.75, -2.2], { tint: 0.8 });
  k.box('metal', [0.4, 0, -3.0], [0.8, 0.5, -2.7]);
  k.box('metal', [0.1, 0.5, -3.05], [1.1, 0.7, -2.65]);
}
