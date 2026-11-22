import { boulder } from '../gen/iceKit.js';
import { extrudedProfile, hewnBeam, rod, stoneBlock, stoneBox } from '../gen/propKit.js';
import { atFrame } from './propFrame.js';

/**
 * Monumental carved Dwarven sculptures for Stonehold's gates, mountain approaches,
 * and ceremonial halls: Gate Guardian Colossi, King Keystone Mask, Half-Open
 * Gilded Fortress Doors, Cliffside Bas-Reliefs, and the Living-Rock Mountain Colossus.
 *
 * All geometry uses beveled planar Dwarven-Cubist stonework so edges catch raking
 * alpine sunlight and warm forge firelight cleanly at low vertex cost.
 */

function placeLocal(L, x, y, z) {
  return L(x, y, z);
}

/**
 * Colossal armored Dwarven Gate Guardian statue (~14.5 m tall at scale = 1).
 * `handedness`: -1 holds shield on left / sword on right; +1 mirrors cleanly.
 */
export function buildGateGuardianStatue(b, at, {
  yaw = 0,
  scale = 1,
  handedness = -1,
  stoneMat = 'carved',
  trimMat = 'bronze',
  ironMat = 'iron',
} = {}) {
  const s = scale;
  const h = handedness < 0 ? -1 : 1;
  const L = atFrame(at, yaw);

  // 1. Stepped knotwork pedestal plinth (y = 0 .. 3.0s).
  b.prop('masonry', stoneBlock(4.8 * s, 0.9 * s, 4.4 * s, L(0, 0, 0), { yaw, bevel: 0.09 * s, batter: 0.10, irregular: 0.05 }), 0xb4b8c0);
  b.prop(stoneMat, stoneBlock(4.1 * s, 1.75 * s, 3.8 * s, L(0, 0.9 * s, 0), { yaw, bevel: 0.08 * s, batter: 0.04, irregular: 0.04 }), 0xc6c9cf);
  b.prop(stoneMat, stoneBlock(4.45 * s, 0.42 * s, 4.1 * s, L(0, 2.62 * s, 0), { yaw, bevel: 0.06 * s, batter: -0.06, irregular: 0.03 }), 0xd2d5da);
  // Gilded bronze diamond-knotwork emblem on the front plinth face.
  const dPts = [[0, 0.65 * s], [0.65 * s, 0], [0, -0.65 * s], [-0.65 * s, 0]];
  b.prop(trimMat, extrudedProfile(dPts, 0.14 * s, { bevel: 0.025 * s, yaw, at: L(0, 1.78 * s, 1.92 * s) }), 0xd8b068);
  const dIn = [[0, 0.36 * s], [0.36 * s, 0], [0, -0.36 * s], [-0.36 * s, 0]];
  b.prop(stoneMat, extrudedProfile(dIn, 0.16 * s, { bevel: 0.02 * s, yaw, at: L(0, 1.78 * s, 1.96 * s) }), 0x8e939c);
  b.prop(trimMat, stoneBox(3.7 * s, 0.14 * s, 0.14 * s, L(0, 2.52 * s, 1.92 * s), { yaw, bevel: 0.02 * s }), 0xd8b068);

  const y0 = 3.04 * s;

  // 2. Planted armored boots, greaves, knee guards, and lamellar battle skirt.
  for (const sx of [-0.82, 0.82]) {
    b.prop(stoneMat, stoneBlock(1.18 * s, 0.72 * s, 1.85 * s, L(sx * s, y0, 0.25 * s), { yaw, bevel: 0.08 * s, batter: 0.1, irregular: 0.14 }), 0xb6bac2);
    b.prop(stoneMat, stoneBlock(1.08 * s, 2.5 * s, 1.24 * s, L(sx * s, y0 + 0.68 * s, 0.02 * s), { yaw, bevel: 0.09 * s, batter: 0.06, irregular: 0.12 }), 0xc0c5ce);
    // Angular knee cop & shin ridge.
    b.prop(stoneMat, stoneBox(0.96 * s, 0.68 * s, 0.42 * s, L(sx * s, y0 + 2.35 * s, 0.66 * s), { yaw, bevel: 0.06 * s, irregular: 0.1 }), 0xccd0d8);
    b.prop(trimMat, stoneBox(1.12 * s, 0.16 * s, 1.3 * s, L(sx * s, y0 + 1.4 * s, 0.04 * s), { yaw, bevel: 0.02 * s }), 0xcba25e);
  }
  // Armored lamellar coat/skirt & heavy dwarven belt.
  b.prop(stoneMat, stoneBlock(3.1 * s, 2.0 * s, 2.15 * s, L(0, y0 + 2.75 * s, -0.04 * s), { yaw, bevel: 0.11 * s, batter: 0.14, irregular: 0.14 }), 0xbac0c8);
  b.prop(trimMat, stoneBox(3.15 * s, 0.46 * s, 2.25 * s, L(0, y0 + 4.85 * s, 0.02 * s), { yaw, bevel: 0.04 * s }), 0xcba25e);
  b.prop(stoneMat, stoneBox(0.92 * s, 0.66 * s, 0.35 * s, L(0, y0 + 4.85 * s, 1.18 * s), { yaw, bevel: 0.05 * s, irregular: 0.1 }), 0xd2d6dc);

  // 3. Broad barrel cuirass, layered angular pauldrons, and thick stone cape/backplate.
  b.prop(stoneMat, stoneBlock(3.45 * s, 3.05 * s, 2.35 * s, L(0, y0 + 5.0 * s, -0.02 * s), { yaw, bevel: 0.13 * s, batter: -0.08, irregular: 0.12 }), 0xc2c7d0);
  b.prop(stoneMat, stoneBlock(3.2 * s, 7.6 * s, 0.72 * s, L(0, y0 + 0.55 * s, -1.28 * s), { yaw, bevel: 0.11 * s, batter: 0.09, irregular: 0.14 }), 0x9ea4ae);
  for (const sx of [-1, 1]) {
    // Articulated double-tiered stone pauldrons.
    b.prop(stoneMat, stoneBlock(1.48 * s, 1.55 * s, 2.18 * s, L(sx * 2.15 * s, y0 + 6.75 * s, 0.02 * s), { yaw, bevel: 0.12 * s, batter: 0.22, irregular: 0.14 }), 0xcad0d8);
    b.prop(stoneMat, stoneBlock(1.22 * s, 0.68 * s, 1.85 * s, L(sx * 2.24 * s, y0 + 7.85 * s, 0.02 * s), { yaw, bevel: 0.09 * s, batter: 0.28, irregular: 0.14 }), 0xd2d6de);
    b.prop(trimMat, stoneBox(1.52 * s, 0.18 * s, 2.22 * s, L(sx * 2.15 * s, y0 + 7.28 * s, 0.02 * s), { yaw, bevel: 0.02 * s }), 0xd4aa64);
    b.prop(stoneMat, stoneBlock(1.08 * s, 2.25 * s, 1.18 * s, L(sx * 2.18 * s, y0 + 4.75 * s, 0.25 * s), { yaw, bevel: 0.09 * s, irregular: 0.12 }), 0xb8bec8);
  }

  // 4. Head, deep recessed eye sockets, stern brow, winged Dwarven helm, and sculpted braided beard.
  const headY = y0 + 8.15 * s;
  b.prop(stoneMat, stoneBlock(1.75 * s, 1.95 * s, 1.85 * s, L(0, headY, 0.15 * s), { yaw, bevel: 0.13 * s, batter: 0.07, irregular: 0.12 }), 0xcad0d8);
  // Dark shadowed eye recess under the brow visor so the face reads with monumental stern depth.
  b.prop(ironMat, stoneBox(1.38 * s, 0.34 * s, 0.22 * s, L(0, headY + 1.14 * s, 0.96 * s), { yaw, bevel: 0.02 * s }), 0x262930);
  b.prop(stoneMat, stoneBox(1.88 * s, 0.44 * s, 0.55 * s, L(0, headY + 1.42 * s, 0.96 * s), { yaw, bevel: 0.05 * s, irregular: 0.1 }), 0xd6dae0);
  b.prop(stoneMat, stoneBox(0.32 * s, 0.92 * s, 0.48 * s, L(0, headY + 1.02 * s, 1.10 * s), { yaw, bevel: 0.04 * s, irregular: 0.08 }), 0xd8dce2);
  for (const sx of [-0.72, 0.72]) {
    b.prop(stoneMat, stoneBox(0.46 * s, 0.98 * s, 0.65 * s, L(sx * s, headY + 0.95 * s, 0.88 * s), { yaw, bevel: 0.05 * s, irregular: 0.1 }), 0xc2c6ce);
  }
  // Stepped geometric helm crown + central crest + bronze diadem band.
  const helmPts = [[-0.98 * s, 0], [-0.78 * s, 0.85 * s], [0, 1.38 * s], [0.78 * s, 0.85 * s], [0.98 * s, 0]];
  b.prop(stoneMat, extrudedProfile(helmPts, 1.92 * s, { bevel: 0.09 * s, yaw, at: L(0, headY + 1.62 * s, 0.12 * s) }), 0xbec3cc);
  b.prop(trimMat, stoneBox(1.94 * s, 0.22 * s, 2.02 * s, L(0, headY + 1.66 * s, 0.16 * s), { yaw, bevel: 0.025 * s }), 0xd8b068);
  b.prop(stoneMat, stoneBox(0.34 * s, 1.35 * s, 2.15 * s, L(0, headY + 2.55 * s, 0.08 * s), { yaw, bevel: 0.05 * s, irregular: 0.1 }), 0xced2da);

  // Sweeping angular faceted braided beard cascading over the chest.
  const beardPts = [
    [-1.08 * s, 0.65 * s], [1.08 * s, 0.65 * s], [0.92 * s, -0.85 * s],
    [0.52 * s, -2.05 * s], [0, -2.65 * s], [-0.52 * s, -2.05 * s], [-0.92 * s, -0.85 * s],
  ];
  b.prop(stoneMat, extrudedProfile(beardPts, 0.85 * s, { bevel: 0.09 * s, yaw, at: L(0, headY + 0.18 * s, 1.15 * s) }), 0xd0d4dc);
  for (const bx of [-0.54, 0, 0.54]) {
    b.prop(stoneMat, stoneBox(0.34 * s, 2.1 * s, 0.28 * s, L(bx * s, headY - 0.65 * s, 1.54 * s), { yaw, bevel: 0.05 * s, irregular: 0.1 }), 0xd8dce2);
    b.prop(trimMat, stoneBox(0.38 * s, 0.18 * s, 0.34 * s, L(bx * s, headY - 1.25 * s, 1.56 * s), { yaw, bevel: 0.02 * s }), 0xd8b068);
  }
  for (const sx of [-1, 1]) {
    b.prop(stoneMat, hewnBeam(L(0, headY + 0.52 * s, 1.56 * s), L(sx * 1.05 * s, headY + 0.14 * s, 1.48 * s), 0.32 * s, 0.34 * s, { bevel: 0.04 * s, irregular: 0.12 }), 0xdce0e6);
  }

  // 5. Weapons: Domed, riveted, bronze-rimmed Dwarven heater/round shield on `h` side, greatsword on `-h` side.
  const shieldX = h * 2.02 * s;
  const shieldY = y0 + 4.75 * s;
  const shieldZ = 1.42 * s;
  b.prop(stoneMat, rod(L(shieldX, shieldY, shieldZ - 0.26 * s), L(shieldX, shieldY, shieldZ + 0.18 * s), 1.96 * s, 1.88 * s, 16), 0xb8bec8);
  b.prop(trimMat, rod(L(shieldX, shieldY, shieldZ + 0.12 * s), L(shieldX, shieldY, shieldZ + 0.28 * s), 1.92 * s, 1.66 * s, 16), 0xcfa45a);
  b.prop(stoneMat, rod(L(shieldX, shieldY, shieldZ + 0.18 * s), L(shieldX, shieldY, shieldZ + 0.34 * s), 1.54 * s, 1.38 * s, 16), 0xa8aeb8);
  // Sculpted domed center umbo boss + 8 forged bronze perimeter rivet studs.
  b.prop(trimMat, boulder(L(shieldX, shieldY - 0.1 * s, shieldZ + 0.32 * s), 0.56 * s, 0.56 * s, 0.36 * s,
    { seed: Math.round(at.x * 13) + 17, blocky: 0.12, maxDetail: 3 }), 0xdeb870);
  for (let r = 0; r < 8; r += 1) {
    const a = (r / 8) * Math.PI * 2 + Math.PI / 8;
    b.prop(trimMat, stoneBox(0.18 * s, 0.18 * s, 0.16 * s,
      L(shieldX + Math.cos(a) * 1.66 * s, shieldY + Math.sin(a) * 1.66 * s, shieldZ + 0.3 * s), { yaw: yaw + a, bevel: 0.02 * s }), 0xe2be78);
  }
  b.prop(trimMat, stoneBox(3.2 * s, 0.22 * s, 0.14 * s, L(shieldX, shieldY, shieldZ + 0.30 * s), { yaw, bevel: 0.02 * s }), 0xcba25e);
  b.prop(trimMat, stoneBox(0.22 * s, 3.2 * s, 0.14 * s, L(shieldX, shieldY, shieldZ + 0.30 * s), { yaw, bevel: 0.02 * s }), 0xcba25e);

  // Grounded colossal greatsword held on `-h` side (resting straight down onto the plinth).
  const swordX = -h * 1.48 * s;
  const swordZ = 1.48 * s;
  // Wide chamfered blade descending from gauntleted fist into the plinth top.
  b.prop(stoneMat, stoneBlock(0.68 * s, 4.65 * s, 0.24 * s, L(swordX, y0, swordZ), { yaw, bevel: 0.07 * s, batter: -0.18 }), 0xd4d8e0);
  b.prop(ironMat, stoneBlock(0.18 * s, 4.4 * s, 0.28 * s, L(swordX, y0 + 0.15 * s, swordZ), { yaw, bevel: 0.02 * s }), 0x5c616c);
  // Heavy angular Dwarven crossguard, grip, gauntlet fist, and diamond pommel.
  b.prop(trimMat, stoneBox(1.85 * s, 0.34 * s, 0.44 * s, L(swordX, y0 + 4.78 * s, swordZ), { yaw, bevel: 0.04 * s }), 0xd8b068);
  b.prop(ironMat, rod(L(swordX, y0 + 4.95 * s, swordZ), L(swordX, y0 + 6.15 * s, swordZ), 0.16 * s, 0.16 * s, 8), 0x4b4f58);
  b.prop(stoneMat, stoneBox(0.76 * s, 0.72 * s, 0.78 * s, L(swordX, y0 + 5.52 * s, swordZ), { yaw, bevel: 0.08 * s }), 0xd0d4dc);
  b.prop(trimMat, stoneBox(0.56 * s, 0.56 * s, 0.56 * s, L(swordX, y0 + 6.32 * s, swordZ), { yaw: yaw + Math.PI / 4, bevel: 0.05 * s }), 0xdeb870);
  // Connecting armored forearm from shoulder to sword fist.
  b.prop(stoneMat, hewnBeam(L(-h * 2.15 * s, y0 + 5.1 * s, 0.42 * s), L(swordX, y0 + 5.48 * s, swordZ - 0.15 * s), 0.88 * s, 0.86 * s, { bevel: 0.07 * s }), 0xc6cad2);

  b.nav.block(at, 2.7 * s, 14 * s);
}

/**
 * Monumental carved Dwarf-King head & braided geometric beard keystone crowning
 * a fortress portal architrave (Ref 5).
 */
export function buildKingKeystoneMask(b, at, { yaw = 0, scale = 1 } = {}) {
  const s = scale;
  const L = atFrame(at, yaw);

  // Back keystone slab framed in gilded bronze.
  const framePts = [[-2.4 * s, 2.2 * s], [0, 3.3 * s], [2.4 * s, 2.2 * s], [2.0 * s, -1.6 * s], [0, -3.4 * s], [-2.0 * s, -1.6 * s]];
  b.prop('carved', extrudedProfile(framePts, 1.35 * s, { bevel: 0.12 * s, yaw, at: L(0, 0, 0) }), 0xc6cad2);
  const innerPts = framePts.map(([px, py]) => [px * 0.86, py * 0.86]);
  b.prop('bronze', extrudedProfile(innerPts, 0.25 * s, { bevel: 0.04 * s, yaw, at: L(0, 0, 0.65 * s) }), 0xd8b068);

  // Helmeted royal crown, brow ridge, nose, and cheekbones.
  b.prop('carved', stoneBox(2.55 * s, 1.25 * s, 1.45 * s, L(0, 1.55 * s, 0.68 * s), { yaw, bevel: 0.12 * s }), 0xd4d8de);
  b.prop('bronze', stoneBox(2.75 * s, 0.34 * s, 1.58 * s, L(0, 1.95 * s, 0.72 * s), { yaw, bevel: 0.04 * s }), 0xe0ba72);
  b.prop('carved', stoneBox(2.35 * s, 0.45 * s, 0.65 * s, L(0, 1.15 * s, 1.38 * s), { yaw, bevel: 0.06 * s }), 0xe0e3e8);
  b.prop('carved', stoneBox(0.48 * s, 1.25 * s, 0.68 * s, L(0, 0.58 * s, 1.52 * s), { yaw, bevel: 0.06 * s }), 0xe2e5ea);
  for (const sx of [-0.78, 0.78]) {
    b.prop('carved', stoneBox(0.72 * s, 0.82 * s, 0.55 * s, L(sx * s, 0.58 * s, 1.28 * s), { yaw, bevel: 0.06 * s }), 0xd0d4dc);
  }
  // Sweeping moustache & 5 stepped faceted beard braids.
  for (const sx of [-1, 1]) {
    b.prop('bronze', hewnBeam(L(0, 0.08 * s, 1.62 * s), L(sx * 1.48 * s, -0.45 * s, 1.45 * s), 0.36 * s, 0.42 * s, { bevel: 0.05 * s }), 0xd8b068);
  }
  for (const [bx, len, depth] of [[-1.12, 2.0, 1.12], [-0.56, 2.85, 1.34], [0, 3.45, 1.50], [0.56, 2.85, 1.34], [1.12, 2.0, 1.12]]) {
    b.prop('bronze', stoneBox(0.46 * s, len * s, 0.52 * s, L(bx * s, -0.25 * s - len * 0.45 * s, depth * s), { yaw, bevel: 0.06 * s }), 0xd8b068);
  }
}

/**
 * Colossal twin bronze-and-iron Dwarven fortress doors angled half-open (`openAngle`)
 * with recessed geometric diamond coffers, forged cross-straps, and glowing interior forge cleft.
 */
export function buildFortressDoors(b, at, {
  yaw = 0,
  width = 10.4,
  height = 13.4,
  openAngle = 0.42,
  glowForge = true,
} = {}) {
  const L = atFrame(at, yaw);
  const leafW = width * 0.5 - 0.14;
  const leafThick = 0.78;

  for (const sign of [-1, 1]) {
    const hinge = L(sign * (width * 0.5), 0, 0);
    // Swing leaves inward (-Z in local door space) so the center cracks open dramatically.
    const leafYaw = yaw + sign * openAngle;
    const F = atFrame(hinge, leafYaw);
    const dir = -sign;

    // Heavy iron hinge pintle column + iron-backed bronze door slab.
    b.prop('iron', rod(hinge, { x: hinge.x, y: hinge.y + height, z: hinge.z }, 0.34, 0.34, 8), 0x454952);
    b.prop('bronze', stoneBlock(leafW, height, leafThick, F(dir * leafW * 0.5, 0, 0), { yaw: leafYaw, bevel: 0.06, irregular: 0.03 }), 0xc29552);

    // Outer bronze border stiles & iron strapwork bands.
    for (const sx of [0.35, leafW - 0.35]) {
      b.prop('bronze', stoneBlock(0.54, height - 0.4, leafThick + 0.24, F(dir * sx, 0.2, 0), { yaw: leafYaw, bevel: 0.04 }), 0xdcb46e);
    }
    for (const y of [1.2, 4.4, 7.6, 10.8, height - 0.8]) {
      b.prop('iron', stoneBox(leafW - 0.15, 0.48, leafThick + 0.28, F(dir * leafW * 0.5, y, 0), { yaw: leafYaw, bevel: 0.03 }), 0x383c45);
      // Heavy forged iron rivet studs along every cross-strap.
      for (const frac of [0.16, 0.38, 0.62, 0.84]) {
        b.prop('bronze', stoneBox(0.18, 0.18, leafThick + 0.42, F(dir * leafW * frac, y, 0), { yaw: leafYaw + Math.PI / 4, bevel: 0.02 }), 0xcba058);
      }
    }

    // Geometric diamond knotwork relief coffers along each door bay.
    for (const cy of [2.8, 6.0, 9.2]) {
      const cx = dir * leafW * 0.5;
      const rX = leafW * 0.32;
      const rY = 1.25;
      const pts = [[0, rY], [rX, 0], [0, -rY], [-rX, 0]];
      b.prop('bronze', extrudedProfile(pts, leafThick + 0.32, { bevel: 0.04, yaw: leafYaw, at: F(cx, cy, 0) }), 0xd8b26a);
      const inPts = [[0, rY * 0.6], [rX * 0.6, 0], [0, -rY * 0.6], [-rX * 0.6, 0]];
      b.prop('iron', extrudedProfile(inPts, leafThick + 0.38, { bevel: 0.03, yaw: leafYaw, at: F(cx, cy, 0) }), 0x3f3c3a);
    }
    // Monumental bronze ring handle & backplate.
    b.prop('iron', stoneBox(0.68, 1.15, 0.16, F(dir * (leafW - 0.95), 4.55, 0.46), { yaw: leafYaw, bevel: 0.03 }), 0x2f333b);
    b.prop('bronze', rod(F(dir * (leafW - 0.95), 4.1, 0.58), F(dir * (leafW - 0.95), 5.0, 0.58), 0.28, 0.28, 10), 0xe2bc72);
  }

  // Extended dark forged-iron & soot-weathered threshold floor slab running cleanly under the open doors.
  b.prop('iron', stoneBox(width + 2.4, 0.32, 9.6, L(0, 0.04, -3.2), { yaw, bevel: 0.04 }), 0x242830);
  b.prop('bronze', stoneBox(width + 0.4, 0.08, 0.28, L(0, 0.20, 1.48), { yaw, bevel: 0.02 }), 0xb58e4a);

  if (glowForge) {
    // Deep recessed molten forge hearth glow behind the cracked doors (rich amber-orange without white clipping!).
    b.prop('iron', stoneBlock(width * 1.15, height * 1.05, 0.5, L(0, 0, -6.4), { yaw, bevel: 0.04 }), 0x1a1310);
    b.prop('glow', stoneBlock(width * 0.72, height * 0.86, 0.35, L(0, 0.5, -5.8), { yaw, bevel: 0.02 }), '#ff520e', 1.85);
    b.prop('glow', stoneBlock(width * 0.38, height * 0.64, 0.35, L(0, 0.8, -5.3), { yaw, bevel: 0.02 }), '#ff8822', 2.35);
    b.flame(L(0, 0.5, -3.4), { width: 4.6, height: 8.2, core: '#ffe8a8', outer: '#ff4808', speed: 0.85 });
    b.flame(L(-1.4, 0.7, -4.0), { width: 3.2, height: 6.2, core: '#ffd884', outer: '#ff520e', speed: 1.05 });
    b.flame(L(1.4, 0.7, -4.0), { width: 3.2, height: 6.2, core: '#ffd884', outer: '#ff520e', speed: 0.95 });
    b.light(L(0, 4.4, -2.4), '#ff7822', 17, 42, { radius: 4.2, halo: 4.6, haloGain: 0.36, importance: 2 });
    b.light(L(0, 2.4, 3.0), '#ff983c', 7.5, 26, { radius: 3.0, halo: 1.8, haloGain: 0.24, importance: 1.5 });
    b.shaft(L(0, 6.2, -3.6), L(0, 2.4, 10.5), 5.2, '#ff8a30', 0.36);
  }
}

/**
 * Framed cliffside carved bas-relief slab depicting three angular Dwarven miners/smiths
 * beneath a geometric mountain crest (Ref 5).
 */
export function buildCliffBasRelief(b, at, { yaw = 0, width = 14, height = 7.6 } = {}) {
  const L = atFrame(at, yaw);
  const hw = width * 0.5;
  const hh = height * 0.5;

  // Heavy beveled outer frame + recessed stone panel.
  b.prop('carved', stoneBox(width + 1.4, 0.85, 1.35, L(0, hh + 0.4, 0.25), { yaw, bevel: 0.08 }), 0xc6cad0);
  b.prop('carved', stoneBox(width + 1.4, 0.85, 1.35, L(0, -hh - 0.4, 0.25), { yaw, bevel: 0.08 }), 0xc6cad0);
  for (const sx of [-1, 1]) {
    b.prop('carved', stoneBox(0.85, height + 0.8, 1.35, L(sx * (hw + 0.38), 0, 0.25), { yaw, bevel: 0.08 }), 0xc6cad0);
  }
  b.prop('bronze', stoneBox(width + 0.8, 0.22, 1.44, L(0, hh + 0.42, 0.28), { yaw, bevel: 0.03 }), 0xd6ae66);
  b.prop('masonry', stoneBox(width, height, 0.55, L(0, 0, -0.1), { yaw, bevel: 0.05 }), 0x8d919a);

  // Carved mountain peak silhouette in upper background.
  const peakPts = [[-hw * 0.82, -hh * 0.15], [-hw * 0.35, hh * 0.45], [0, hh * 0.86], [hw * 0.38, hh * 0.42], [hw * 0.82, -hh * 0.15]];
  b.prop('carved', extrudedProfile(peakPts, 0.28, { bevel: 0.04, yaw, at: L(0, 0, 0.22) }), 0xb5b9c2);

  // Three stylized carved Dwarven figures swinging picks/hammers.
  for (const [fx, dir] of [[-hw * 0.52, 1], [0, -1], [hw * 0.52, -1]]) {
    const fy = -hh * 0.58;
    b.prop('carved', stoneBlock(1.45, 2.35, 0.56, L(fx, fy, 0.32), { yaw, bevel: 0.07 }), 0xd4d7dd);
    b.prop('carved', stoneBlock(1.05, 1.15, 0.62, L(fx, fy + 2.35, 0.38), { yaw, bevel: 0.07 }), 0xdce0e6);
    b.prop('bronze', stoneBox(0.76, 1.05, 0.44, L(fx, fy + 2.05, 0.62), { yaw, bevel: 0.04 }), 0xd4ae66);
    // Raised pickaxe / hammer silhouette.
    b.prop('bronze', hewnBeam(L(fx + dir * 0.65, fy + 1.9, 0.55), L(fx + dir * 1.45, fy + 3.45, 0.55), 0.22, 0.22, { bevel: 0.02 }), 0xcfa660);
    b.prop('iron', hewnBeam(L(fx + dir * 0.85, fy + 3.65, 0.58), L(fx + dir * 1.95, fy + 3.25, 0.58), 0.28, 0.32, { bevel: 0.03 }), 0x565b64);
  }
}

/**
 * Titanic living-rock Dwarven King sculpture emerging directly out of a mountain ridge,
 * clasping a massive double-headed rune battleaxe across his torso (Ref 3).
 * ~32 m tall at scale = 1.
 */
export function buildMountainColossus(b, at, { yaw = 0, scale = 1 } = {}) {
  const s = scale;
  const L = atFrame(at, yaw);

  // Craggy living-rock cliff torso & shoulder spurs blending into the mountain.
  b.prop('masonry', stoneBlock(17.5 * s, 14 * s, 11.5 * s, L(-1.5 * s, 0, -2.0 * s), { yaw, bevel: 0.65 * s, batter: 0.14, irregular: 0.32 }), 0x7b808a);
  b.prop('masonry', stoneBlock(14.0 * s, 14.5 * s, 9.5 * s, L(0.5 * s, 12.5 * s, -1.6 * s), { yaw, bevel: 0.58 * s, batter: 0.18, irregular: 0.28 }), 0x848992);
  b.prop('masonry', stoneBlock(10.5 * s, 9.5 * s, 7.6 * s, L(-3.5 * s, 16.5 * s, -2.2 * s), { yaw, bevel: 0.55 * s, batter: 0.25, irregular: 0.34 }), 0x787d86);

  // Stepped armored lamellar torso & broad shoulders.
  for (let row = 0; row < 5; row += 1) {
    const ry = (3.5 + row * 2.15) * s;
    const rw = (8.4 + row * 0.45) * s;
    b.prop('carved', stoneBlock(rw, 1.95 * s, 4.2 * s, L(0.8 * s, ry, 2.2 * s), { yaw, bevel: 0.18 * s, batter: 0.06 }), 0xaeb3bc);
  }

  // Solemn chiseled colossal Dwarven King face, geometric crown & monumental braided beard.
  const headY = 23.2 * s;
  b.prop('carved', stoneBlock(5.4 * s, 6.2 * s, 4.8 * s, L(1.2 * s, headY, 2.6 * s), { yaw, bevel: 0.32 * s, batter: 0.06 }), 0xc0c5ce);
  b.prop('carved', stoneBox(5.6 * s, 1.3 * s, 1.45 * s, L(1.2 * s, headY + 4.35 * s, 4.85 * s), { yaw, bevel: 0.15 * s }), 0xd0d4dc);
  b.prop('carved', stoneBox(1.1 * s, 2.65 * s, 1.45 * s, L(1.2 * s, headY + 2.95 * s, 5.15 * s), { yaw, bevel: 0.14 * s }), 0xd4d8e0);
  // Angular multi-faceted Dwarven crown with bronze inlays.
  for (const [cx, cw, ch] of [[-1.9, 1.75, 2.6], [0, 2.2, 3.4], [1.9, 1.75, 2.6]]) {
    b.prop('carved', stoneBlock(cw * s, ch * s, 2.6 * s, L((1.2 + cx) * s, headY + 5.7 * s, 3.0 * s), { yaw, bevel: 0.14 * s, batter: 0.18 }), 0xc6cbd4);
    b.prop('bronze', stoneBox(cw * 0.52 * s, ch * 0.42 * s, 0.3 * s, L((1.2 + cx) * s, headY + 5.7 * s + ch * 0.5 * s, 4.25 * s), { yaw, bevel: 0.04 * s }), 0xb59c6a);
  }
  // Sweeping geometric beard slab cascading down to y = 16s.
  const beardPts = [[-3.4 * s, 2.2 * s], [3.4 * s, 2.2 * s], [2.9 * s, -4.8 * s], [0, -7.8 * s], [-2.9 * s, -4.8 * s]];
  b.prop('carved', extrudedProfile(beardPts, 2.2 * s, { bevel: 0.22 * s, yaw, at: L(1.2 * s, headY + 0.5 * s, 4.8 * s) }), 0xcad0d8);
  for (const bx of [-1.8, -0.6, 0.6, 1.8]) {
    b.prop('carved', stoneBox(0.82 * s, 6.2 * s, 0.55 * s, L((1.2 + bx) * s, headY - 2.3 * s, 5.85 * s), { yaw, bevel: 0.08 * s }), 0xd4d8e0);
  }

  // Massive two-handed rune battleaxe held horizontally across the chest (Ref 3!).
  const axeY = 12.6 * s;
  const axeZ = 5.4 * s;
  // Thick rune-carved haft.
  b.prop('carved', hewnBeam(L(-8.6 * s, axeY + 1.4 * s, axeZ), L(10.8 * s, axeY - 1.6 * s, axeZ), 1.45 * s, 1.45 * s, { bevel: 0.12 * s }), 0xb8bdc6);
  b.prop('bronze', hewnBeam(L(-7.2 * s, axeY + 1.18 * s, axeZ + 0.65 * s), L(9.2 * s, axeY - 1.36 * s, axeZ + 0.65 * s), 0.42 * s, 0.42 * s, { bevel: 0.04 * s }), 0x8ea89a);
  // Titanic double-bladed axe head on the left shoulder side.
  const bladePts = [
    [-2.4 * s, 4.8 * s], [2.2 * s, 3.6 * s], [1.4 * s, 0.8 * s],
    [2.2 * s, -3.6 * s], [-2.4 * s, -4.8 * s], [-3.8 * s, -1.8 * s], [-3.8 * s, 1.8 * s],
  ];
  b.prop('carved', extrudedProfile(bladePts, 1.65 * s, { bevel: 0.18 * s, yaw, at: L(-4.6 * s, axeY + 0.8 * s, axeZ + 0.3 * s) }), 0xc4c9d2);
  b.prop('bronze', stoneBox(1.8 * s, 5.4 * s, 1.85 * s, L(-4.4 * s, axeY + 0.8 * s, axeZ + 0.3 * s), { yaw, bevel: 0.08 * s }), 0x8aa698);
  // Two colossal gauntleted stone fists gripping the haft.
  for (const [hx, hy] of [[0.4, axeY + 0.05], [7.8, axeY - 1.1]]) {
    b.prop('carved', stoneBox(2.55 * s, 2.35 * s, 2.45 * s, L(hx * s, hy * s, axeZ + 0.25 * s), { yaw, bevel: 0.18 * s }), 0xccd0d8);
  }
  // Right forearm sweeping back to the mountain shoulder.
  b.prop('carved', hewnBeam(L(7.8 * s, axeY - 1.0 * s, axeZ - 0.4 * s), L(6.4 * s, 19.2 * s, 1.8 * s), 3.1 * s, 2.8 * s, { bevel: 0.24 * s }), 0xbcc1ca);

  // Carved recessed gateway & verdigris bronze stele panels at the colossus's feet.
  b.prop('bronze', stoneBlock(3.6 * s, 6.2 * s, 1.2 * s, L(6.2 * s, 0.6 * s, 3.8 * s), { yaw, bevel: 0.12 * s }), 0x7b988c);
  b.prop('carved', stoneBlock(3.8 * s, 6.8 * s, 1.6 * s, L(-2.4 * s, 0.4 * s, 4.2 * s), { yaw, bevel: 0.12 * s }), 0x9fa4ae);
  b.prop('bronze', stoneBlock(2.2 * s, 4.4 * s, 1.8 * s, L(-2.4 * s, 0.6 * s, 4.35 * s), { yaw, bevel: 0.06 * s }), 0x78968a);

  b.nav.block(placeLocal(L, 0, 0, 0), 10 * s, 32 * s);
}
