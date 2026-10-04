// Original Gods’ End design; canonical dimensions are in metres.
export function house006(k) {
  const base = 1.4, first = 4.6, second = 7.3, eave = 10.0;
  const plaster = [0.66, 0.56, 0.44];
  const stone = k.walls('darkStone', { x0: -4.9, x1: 5.0, z0: -4.3, z1: 4.3, y0: base, y1: first, topShade: 0.5 });
  k.plinth('darkStone', { x0: -4.9, x1: 5.0, z0: -4.3, z1: 4.3, top: base });
  for (const w of Object.values(stone)) k.quoins(w, 'start', base, first, { material: 'darkStone', tint: 1.6 });
  k.door(stone.back, 5.0, 1.1, 2.1, { arch: true, y: base, tint: 0.7 });
  k.door(stone.left, 4.0, 1.0, 2.0, { arch: true, y: base, tint: 0.7 });
  k.beam('wood', [-5.1, 0, 1.4], [-5.1, base + 0.3, 1.4], 0.18);
  const a = k.walls('plaster', { x0: -5.6, x1: 6.4, z0: -2.7, z1: 3.1, y0: first, y1: second, tint: plaster });
  k.box('wood', [-5.7, first - 0.15, -4.5], [6.5, first + 0.1, 4.5], { tint: 0.6 });
  // Railings round the terrace the jetty leaves on top of the undercroft.
  for (const [za, zb] of [[4.45, 4.45], [-4.45, -4.45]]) {
    k.beam('wood', [-5.6, first + 1.0, za], [6.4, first + 1.0, zb], 0.12, { tint: 0.6 });
    for (let x = -5.6; x <= 6.4; x += 0.6) k.beam('wood', [x, first, za], [x, first + 1.0, za], 0.07, { tint: 0.6 });
  }
  for (const w of Object.values(stone)) k.joists(w, first - 0.25, { out: 0.7, spacing: 0.7 });
  for (const w of Object.values(a)) {
    k.timberFrame(w, { y0: first + 0.1, y1: second - 0.05, spacing: 1.5, braces: 'diagonal', rails: [first + 1.0], tint: 0.65 });
    for (let u = 1.5; u < w.length - 1; u += 3.0) k.window(w, u + 0.75, first + 1.2, 0.7, 0.9, { sill: false });
  }
  const b = k.walls('plaster', { x0: -6.3, x1: 7.5, z0: -3.0, z1: 3.4, y0: second, y1: eave, tint: plaster });
  k.box('wood', [-6.4, second - 0.15, -3.1], [7.6, second + 0.1, 3.5], { tint: 0.75 });
  for (const w of Object.values(b)) {
    k.timberFrame(w, { y0: second + 0.1, y1: eave - 0.05, spacing: 1.4, braces: 'cross', rails: [second + 1.0], tint: 0.65 });
    for (let u = 1.4; u < w.length - 1; u += 2.8) k.window(w, u + 0.7, second + 1.1, 0.6, 0.8, { sill: false, mullion: false });
  }
  // Wings on the jettied storeys: a cross gable to +z and a wing to -z.
  const front = k.walls('plaster', { x0: -2.2, x1: 1.4, z0: 3.3, z1: 5.0, y0: first, y1: eave, tint: plaster, skip: ['back'] });
  for (const w of [front.front, front.left, front.right]) k.timberFrame(w, { y0: first + 0.1, y1: eave - 0.05, spacing: 1.2, braces: 'none', rails: [second], tint: 0.65 });
  k.window(front.front, 1.8, second + 0.8, 1.4, 1.0);
  k.window(front.front, 1.8, first + 1.0, 1.4, 1.0);
  const back = k.walls('plaster', { x0: -0.6, x1: 3.8, z0: -4.9, z1: -2.9, y0: first, y1: eave, tint: plaster, skip: ['front'] });
  for (const w of [back.back, back.left, back.right]) k.timberFrame(w, { y0: first + 0.1, y1: eave - 0.05, spacing: 1.4, braces: 'none', rails: [second], tint: 0.65 });
  const roof = k.gableRoof({
    x0: -6.3, x1: 7.5, z0: -3.0, z1: 3.4, axis: 'x', wallTop: eave, ridgeY: 13.7, sweep: 0.7, overhang: 0.45, endOverhang: 0.4, tint: 0.85,
    hips: [1.6, 1.8],
  });
  k.gableRoof({
    x0: -2.2, x1: 1.4, z0: 2.0, z1: 5.0, axis: 'z', wallTop: eave, ridgeY: 12.9, sweep: 0.7, overhang: 0.4, endOverhang: 0.35,
    openEnds: ['start'], gableFrame: true, gableTint: plaster,
  });
  k.gableRoof({
    x0: -0.6, x1: 3.8, z0: -4.9, z1: -1.5, axis: 'z', wallTop: eave, ridgeY: 12.6, sweep: 0.7, overhang: 0.4, endOverhang: 0.35,
    openEnds: ['end'], gableFrame: true, gableTint: plaster,
  });
  k.dormer(roof, { at: 3.0, offset: 1.9, facing: '+z', w: 1.0, h: 0.9 });
  k.dormer(roof, { at: 5.2, offset: 1.9, facing: '+z', w: 1.0, h: 0.9 });
  k.dormer(roof, { at: -4.0, offset: 1.9, facing: '+z', w: 1.0, h: 0.9 });
  k.dormer(roof, { at: -3.3, offset: 1.9, facing: '-z', w: 1.0, h: 0.9 });
  k.ridgeSpikes(roof, { count: 7, from: 0.14, to: 0.86 });
  k.chimney({ x: -2.2, z: 0.4, w: 0.55, d: 0.55, y0: 11, y1: 15.3, material: 'darkStone', pots: 1, tint: 0.8 });
}
