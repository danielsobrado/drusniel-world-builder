import { buildRoof } from '../HouseRoof.js';
import { joists, storeyRoot } from '../HouseStoreys.js';
import { buildBellcote } from '../HouseTradeDetails.js';
import { clamp, design, OpeningNumbering, roofRise } from '../HouseDesign.js';

/**
 * A market hall, standing free in its square: a stone ground floor opened on
 * every side in tall arches for the market held beneath it, a jettied timber
 * guild hall above where the weights and cloth are kept, and the market bell
 * in a bellcote at the middle of its long ridge.
 */
export function marketHallDesign(recipe) {
  const width = clamp(recipe.width, 10, 18);
  const depth = clamp(recipe.depth, 6, 10);
  const eave = clamp(recipe.height, 6.5, 10);
  const ground = clamp(eave * 0.45, 3.2, 4.2);
  const base = { x0: -width / 2, x1: width / 2, z0: -depth / 2, z1: depth / 2 };
  const upperBox = { x0: base.x0 - 0.3, x1: base.x1 + 0.3, z0: base.z0 - 0.35, z1: base.z1 + 0.35 };

  const arcade = { id: 'structure-main', label: 'Arcade', wall: 'stone', ground: true, thickness: 0.55, box: { ...base, y0: 0, y1: ground } };
  const hall = {
    id: 'structure-upper', label: 'Guild hall', wall: 'plaster', roofed: true,
    box: { ...upperBox, y0: ground + 0.11, y1: eave },
    plate: { overhang: 0.08, offset: -0.11 },
    frame: { spacing: 1.4, braces: 'diagonal' },
    openings: { shutters: true, flowers: false },
  };

  // The arches stand on a low parapet the market leans its goods on, and rise nearly to the floor above.
  const arch = { bottom: 0.45, width: 2, height: ground - 1.05, arch: true };
  const numbering = new OpeningNumbering(recipe);
  numbering.door(arcade, 'front', { centerX: 0, width: 2.2, height: ground - 0.6, arch: true, label: 'Market arch' });
  for (const side of [-1, 1]) {
    for (let bay = 1; bay * 3.2 < width / 2 - 1.2; bay += 1) {
      numbering.add('structure-main', { centerX: side * bay * 3.2, ...arch, label: 'Arcade arch' });
    }
  }
  numbering.row(arcade, 'back', { spacing: 3.2, ...arch });
  numbering.row(arcade, 'left', { spacing: 3.2, ...arch });
  numbering.row(arcade, 'right', { spacing: 3.2, ...arch });
  numbering.row(hall, 'front', { spacing: 2, bottom: 0.8, width: 0.8, height: 1.1 });
  numbering.row(hall, 'back', { spacing: 2, bottom: 0.8, width: 0.8, height: 1.1 });
  numbering.row(hall, 'left', { spacing: 2.4, bottom: 0.9, width: 0.7, height: 0.9 });
  numbering.row(hall, 'right', { spacing: 2.4, bottom: 0.9, width: 0.7, height: 0.9 });

  return design({
    storeys: [arcade, hall],
    openings: numbering.openings,
    build(kit, { facades }) {
      kit.within(storeyRoot(arcade), () => {
        for (const side of ['front', 'back']) joists(kit, facades.get(arcade.id)[side], ground - 0.14, { out: 0.4, spacing: 0.9 });
      });
      kit.within(storeyRoot(hall), () => {
        const roof = buildRoof(kit, {
          ...upperBox,
          axis: 'x',
          wallTop: eave,
          rise: roofRise(recipe, (upperBox.z1 - upperBox.z0) / 2),
          overhang: recipe.roofOverhang,
          endOverhang: 0.3,
        }, { gableFrame: true });
        buildBellcote(kit, { x: 0, y: eave + roof.rise - 0.1, z: 0 });
      });
    },
  });
}
