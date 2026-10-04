// Original Gods’ End design; canonical dimensions are in metres.
export function house004(k) {
  const floor = 2.5, eave = 3.75;
  const ground = k.walls('darkStone', { x0: -2.6, x1: 2.6, z0: -3.8, z1: 3.5, y0: 0, y1: floor, topShade: 0.5 });
  k.plinth('darkStone', { x0: -2.6, x1: 2.6, z0: -3.8, z1: 3.5 });
  for (const w of Object.values(ground)) {
    k.quoins(w, 'start', 0, floor, { material: 'darkStone', tint: 1.6 });
    for (const u of [w.length * 0.33, w.length * 0.66]) k.wallBeam(w, u, 0, u, floor, 0.2, { tint: 0.8 });
  }
  k.door(ground.back, ground.back.length / 2, 1.3, 2.1, { tint: 0.75 });
  k.window(ground.left, 2.2, 1.0, 0.7, 0.6);
  k.window(ground.left, 5.0, 1.0, 0.7, 0.6);
  k.window(ground.right, 3.6, 1.0, 0.8, 0.6);
  k.box('wood', [-3.0, floor - 0.1, -4.2], [3.0, floor + 0.12, 4.1], { tint: 0.75 });
  for (const w of [ground.left, ground.right]) k.joists(w, floor - 0.15, { out: 0.45, spacing: 1.0 });
  const band = {
    ...k.walls('planks', { x0: -2.9, x1: 2.9, z0: -4.1, z1: 4.0, y0: floor + 0.1, y1: eave, topShade: 0.3, skip: ['front', 'back'], tint: 0.8 }),
  };
  Object.assign(band, (({ front, back }) => ({ front, back }))(k.walls('plaster', { x0: -2.9, x1: 2.9, z0: -4.1, z1: 4.0, y0: floor + 0.1, y1: eave, topShade: 0.3, skip: ['left', 'right'], tint: [0.8, 0.72, 0.6] })));
  for (const w of Object.values(band)) {
    const end = w === band.front || w === band.back;
    k.timberFrame(w, { y0: floor + 0.15, y1: eave - 0.05, spacing: end ? 1.45 : 1.35, braces: end ? 'cross' : 'none' });
  }
  const roof = k.gableRoof({
    x0: -2.9, x1: 2.9, z0: -4.1, z1: 4.0, axis: 'z', wallTop: eave, ridgeY: 6.8, sweep: 0.55, overhang: 0.45, endOverhang: 0.55, sag: 0.15,
    gableMaterial: 'plaster', gableTint: [0.62, 0.6, 0.6], gableFrame: true,
  });
  for (const [z, dir] of [[4.0, 1], [-4.1, -1]]) {
    const w = k.wall([dir > 0 ? -0.45 : 0.45, z + dir * 0.02], [0, 0, dir], 0.9);
    k.window(w, 0.45, 4.2, 0.9, 0.8);
  }
  k.dormer(roof, { at: -2.3, offset: 2.2, facing: '-x', w: 1.0, h: 1.0 });
  k.dormer(roof, { at: 2.3, offset: 2.2, facing: '-x', w: 1.0, h: 1.0 });
  k.ridgeSpikes(roof, { count: 9, from: 0.02, to: 0.98, height: 0.9 });
  k.chimney({ x: 1.7, z: 1.7, w: 0.8, d: 0.8, y0: 3.0, y1: 6.9, material: 'darkStone', pots: 0, tint: 1.1 });
  k.sign(ground.left, 0.1, 2.9, { out: 0.9 });
}
