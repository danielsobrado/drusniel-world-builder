// Original Gods’ End design; canonical dimensions are in metres.
export function house003(k) {
  const floor = 2.0, eave = 5.0;
  // Main range.
  const mainStone = k.walls('stone', { x0: -0.9, x1: 3.9, z0: -3.3, z1: 4.8, y0: 0, y1: floor });
  k.plinth('stone', { x0: -0.9, x1: 3.9, z0: -3.3, z1: 4.8 });
  k.plinth('stone', { x0: -3.8, x1: -0.9, z0: 1.4, z1: 4.8 });
  const main = k.walls('plaster', { x0: -1.1, x1: 4.0, z0: -4.9, z1: 4.85, y0: floor, y1: eave });
  k.box('wood', [-1.15, floor - 0.12, -4.95], [4.05, floor + 0.08, 4.9], { tint: 0.8 });
  k.joists(main.back, floor - 0.05, { out: -1.4, spacing: 0.9 });
  for (const w of [main.front, main.right, main.back, main.left]) {
    if (w === main.front) continue;
    k.timberFrame(w, { y0: floor + 0.05, y1: eave - 0.1, spacing: w === main.back ? 1.3 : 2.6, braces: w === main.back ? 'cross' : 'none', openings: w === main.left ? [[0, 6]] : [] });
  }
  k.window(main.left, 3.3, 3.2, 3.0, 0.8, { shutters: false });
  k.window(main.left, 5.7, 3.3, 0.5, 0.6);
  k.window(mainStone.back, 2.6, 0.5, 0.8, 1.1, { arch: true });
  k.window(main.back, 2.5, 3.1, 1.0, 1.0);
  const mainRoof = k.gableRoof({
    x0: -1.1, x1: 4.0, z0: -4.9, z1: 4.85, axis: 'z', wallTop: eave, ridgeY: 7.35, overhang: 0.4, endOverhang: 0.35,
    gableFrame: ['start'], sweep: 0.92, gableTint: [0.72, 0.74, 0.8],
  });
  k.dormer(mainRoof, { at: -3.6, offset: 1.7, facing: '-x', w: 1.0, h: 1.0 });
  k.dormer(mainRoof, { at: -0.4, offset: 1.9, facing: '-x', w: 1.0, h: 0.8 });
  k.ridgeSpikes(mainRoof, { count: 5, from: 0.08, to: 0.6 });

  // Front wing.
  const wingStone = k.walls('stone', { x0: -3.8, x1: -0.9, z0: 1.4, z1: 4.8, y0: 0, y1: floor, skip: ['right'] });
  const wing = k.walls('plaster', { x0: -3.85, x1: -1.1, z0: 1.4, z1: 4.85, y0: floor, y1: eave, skip: ['right'] });
  k.box('wood', [-3.9, floor - 0.12, 1.35], [-1.1, floor + 0.08, 4.9], { tint: 0.8 });
  for (const w of [wing.back, wing.left]) k.timberFrame(w, { y0: floor + 0.05, y1: eave - 0.1, spacing: 2.8, braces: 'none' });
  // One plain plastered front across wing and main range, between rails.
  k.wallBeam(k.wall([-3.85, 4.85], [0, 0, 1], 7.85), -0.1, floor, 7.95, floor, 0.2);
  k.wallBeam(k.wall([-3.85, 4.85], [0, 0, 1], 7.85), -0.1, eave - 0.1, 7.95, eave - 0.1, 0.2);
  k.window(wing.left, 1.7, 3.2, 1.9, 0.9);
  k.door(wingStone.left, 1.6, 0.95, 1.9, { arch: false });
  k.door(wing.back, 1.8, 0.9, 1.9, { y: floor });
  k.quoins(wingStone.left, 'start', 0, floor, { tint: 1.1 });
  const wingRoof = k.gableRoof({
    x0: -3.85, x1: -1.1, z0: 1.4, z1: 4.85, axis: 'x', wallTop: eave, ridgeY: 7.1, overhang: 0.35, endOverhang: 0.35,
    openEnds: ['end'], gableFrame: true,
  });
  k.window(k.wall([-3.87, 3.6], [-1, 0, 0], 1.0), 0.5, 5.5, 0.5, 0.5, { sill: false, mullion: false });
  k.ridgeSpikes(wingRoof, { count: 3, from: 0.15, to: 0.75 });
  k.sign(wing.left, 3.1, 3.0);

  // The stair in the L, up to the wing's first-floor door.
  k.stairs('stone', [-2.0, 0, -2.5], [-2.0, floor, 1.35], 1.2, 9);
  k.beam('stone', [-2.65, 0.4, -2.5], [-2.65, floor + 0.45, 1.35], 0.18, { tint: 1.2 });

  k.chimney({ x: 4.05, z: 3.4, w: 0.75, d: 0.9, y0: 0, y1: 8.9, material: 'plaster', pots: 3, tint: 0.85, capTint: 0.35 });
}
