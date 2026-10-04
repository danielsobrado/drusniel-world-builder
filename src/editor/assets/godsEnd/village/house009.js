// Original Gods’ End design; canonical dimensions are in metres.
export function house009(k) {
  const deck = 2.0, first = 5.0, eave = 8.3;
  const dark = [0.24, 0.25, 0.29];
  k.box('darkStone', [-4.0, 0, -0.2], [-1.6, deck, 1.6], { tint: 0.8 });
  k.stairs('darkStone', [-1.0, 0, 0.7], [-1.6, deck, 0.7], 1.0, 4, { tint: 0.85 });
  // Deck boards run along z, ragged at both ends.
  for (let x = -4.3; x < 5.9; x += 0.34) {
    const z0 = -3.4 - k.random() * 0.8, z1 = 3.4 + k.random() * 0.8;
    k.box('deck', [x, deck - 0.12, z0], [x + 0.3, deck, z1], { tint: 0.7 + k.random() * 0.3 });
  }
  const stone = k.walls('darkStone', { x0: -4.0, x1: 5.1, z0: -3.1, z1: 3.2, y0: deck, y1: first, topShade: 0.4 });
  k.plinth('darkStone', { x0: -4.0, x1: 5.1, z0: -3.1, z1: 3.2, top: deck - 0.12 });
  for (const w of Object.values(stone)) k.quoins(w, 'start', deck, first, { tint: 0.75 });
  for (const u of [2.5, 4.9, 7.0]) k.window(stone.front, u, 3.3, 0.8, 1.1, { arch: true });
  for (const u of [2.1, 4.2, 6.6]) k.window(stone.back, u, 3.3, 0.8, 1.1, { arch: true });
  k.door(stone.right, 3.6, 1.0, 2.2, { y: deck, tint: 0.7 });
  k.window(stone.right, 1.8, 3.3, 0.8, 1.1, { arch: true });
  k.door(stone.left, 3.0, 1.0, 2.1, { y: deck, tint: 0.7 });
  k.stairs('darkStone', [6.3, deck - 1.4, 0.5], [5.2, deck, 0.5], 1.0, 4, { tint: 0.9 });
  k.box('wood', [-4.2, first - 0.1, -3.3], [5.4, first + 0.12, 3.4], { tint: 0.75 });
  const upper = k.walls('plaster', { x0: -4.1, x1: 5.3, z0: -3.2, z1: 3.3, y0: first + 0.1, y1: eave, tint: dark });
  for (const w of Object.values(upper)) {
    const long = w === upper.front || w === upper.back;
    const openings = long ? [[1.3, 3.0], [5.8, 7.6]] : [[2.2, 4.2]];
    k.timberFrame(w, { y0: first + 0.15, y1: eave - 0.05, spacing: long ? 1.55 : 1.6, braces: 'diagonal', rails: [first + 1.2], openings });
    for (const [o0, o1] of openings) k.window(w, (o0 + o1) / 2, first + 1.6, 0.9, 1.0);
  }
  const roof = k.gableRoof({
    x0: -4.1, x1: 5.3, z0: -3.2, z1: 3.3, axis: 'x', wallTop: eave, ridgeY: 11.9, sag: 0.5, sweep: 0.55, overhang: 0.5, endOverhang: 0.4,
    material: 'roofSlate', gableMaterial: 'plaster', gableTint: dark, gableFrame: true, purlins: 3,
  });
  k.ridgeSpikes(roof, { count: 6, from: 0.02, to: 0.98 });
  k.chimney({ x: 4.0, z: 1.3, w: 0.9, d: 0.9, y0: 8.0, y1: 12.0, material: 'darkStone', pots: 0, tint: 0.95 });
}
