import { boulder } from '../gen/iceKit.js';
import { column, mound } from '../gen/shapes.js';
import { icicleCluster } from './icicleRanks.js';

export { icicleCluster, icicleCurtain } from './icicleRanks.js';

/**
 * Natural dressing shared by the glacier sites. Ice forms hang from, stand on
 * or fuse with the volume the generator has already cut, so they follow its
 * geology instead of being scattered over it. Material keys: `clearIce`, plus
 * whatever a caller names for blocks and boulders.
 */

const P = (x, y, z) => ({ x, y, z });
const TAU = Math.PI * 2;
/** Metres of fall per ledge where its water pooled and refroze, and the most ledges one has. */
const TIER_SPACING = 6, MAX_TIERS = 3;
/** Share of a fall's pipes that froze before they reached the ledge below: hanging free, frozen mid-fall. */
const FREE_PIPE_SHARE = 0.3;
/** Lumps of frozen splash thrown out around a fall's foot. */
const SPLASH_LUMPS = 5;
/** How far below a ledge's lip its icicle fringe is looked for from, metres. */
const FRINGE_DROP = 2.4;
/** Share of a scatter's pieces that are the big ones that fell; the rest is the litter they shed. */
const HEAD_SHARE = 0.2;
/** Litter sizes are drawn as `u ** LITTER_SKEW` across the lower half of the size range. */
const LITTER_SKEW = 2;

/**
 * A frozen waterfall fused into the volume from `top` down to `foot`, fanned
 * `width` metres along `across` (a unit vector in plan). Its water pooled and
 * refroze on ledges; from each lip organ pipes hang toward the ledge below,
 * some fused to it, some frozen before they reached it; splash froze into an
 * apron and lumps around the foot. Returns the fall's ledges for `fallFringe`.
 */
export function frozenFall(b, top, foot, across, { width = 7, columns = 9 } = {}) {
  const height = top.y - foot.y, run = Math.hypot(foot.x - top.x, foot.z - top.z);
  // Away from the wall it pours down: from its top toward its foot, or square to `across` where it drops sheer.
  const out = run > 0.1 ? P((foot.x - top.x) / run, 0, (foot.z - top.z) / run) : P(-across.z, 0, across.x);
  const on = (f, offset, proud) => P(foot.x + (top.x - foot.x) * f + across.x * offset + out.x * proud,
    foot.y + height * f, foot.z + (top.z - foot.z) * f + across.z * offset + out.z * proud);
  const halfWidth = (f) => width / 2 * (1 - 0.3 * f);
  const voxel = b.grid.voxel;

  // Ledges, thickest mid-fall where most of the water ran.
  const tiers = [];
  const count = Math.max(1, Math.min(MAX_TIERS, Math.floor(height / TIER_SPACING)));
  for (let index = 1; index <= count; index += 1) {
    const f = (index + b.range(-0.25, 0.25)) / (count + 1);
    const radius = voxel * b.range(1.3, 1.9), half = halfWidth(f) * b.range(0.75, 1);
    const lip = on(f, 0, radius * 0.6);
    for (const side of [-1, 1]) {
      const end = P(lip.x + across.x * half * side, lip.y + b.range(-0.6, 0.4), lip.z + across.z * half * side);
      b.grid.fill(column(lip, end, radius, radius * 0.5), 0.9);
    }
    tiers.push({ f, lip, half, radius });
  }

  const levels = [{ f: 0, radius: 0 }, ...tiers, { f: 1, radius: voxel }];
  for (let band = 1; band < levels.length; band += 1) {
    const lo = levels[band - 1].f, hi = levels[band];
    for (let pipe = 0; pipe < Math.max(2, Math.round(columns * (hi.f - lo))); pipe += 1) {
      const offset = b.range(-1, 1) * halfWidth(hi.f);
      const radius = voxel * b.range(0.9, 1.5) * (b.random() < 0.25 ? 1.5 : 1);
      const free = b.random() < FREE_PIPE_SHARE;
      const end = hi.f - (hi.f - lo) * (free ? b.range(0.35, 0.75) : 1.04);
      const lower = on(end, offset * halfWidth(end) / halfWidth(hi.f) + b.range(-0.5, 0.5), 0.3);
      b.grid.fill(column(lower, on(hi.f, offset, hi.radius * 0.4), free ? radius * 0.25 : radius * 1.15, radius), 0.9);
    }
  }

  b.grid.fill(mound(P(foot.x, foot.y, foot.z), width * 0.55, 1.5, width * 0.4), 1.2);
  // Splash froze where it landed: lumps thrown out from the foot, each sat on the ground it fell on.
  for (let index = 0; index < SPLASH_LUMPS; index += 1) {
    const angle = b.range(-1.2, 1.2), distance = b.range(0.35, 0.65) * width, size = b.range(0.6, 1.3);
    const x = foot.x + (out.x * Math.cos(angle) + across.x * Math.sin(angle)) * distance;
    const z = foot.z + (out.z * Math.cos(angle) + across.z * Math.sin(angle)) * distance;
    if (b.grid.sample(x, foot.y + 2, z) < 0) continue;
    const ground = b.probe(x, foot.y + 2, z, -1, 5);
    if (ground !== null) b.grid.fill(mound(P(x, ground - size * 0.25, z), size, size * 0.5, size), 0.6);
  }
  return { out, across, tiers };
}

/**
 * Icicle fringes under the lips of a frozen fall's ledges. Pass what
 * `frozenFall` returned once the volume has been roughened, so they hang from
 * the ice as it finally is.
 */
export function fallFringe(b, fall, { spacing = 0.9, length = [0.5, 2.4] } = {}) {
  for (const { lip, half, radius } of fall.tiers) {
    for (let offset = -half; offset <= half; offset += spacing) {
      const x = lip.x + fall.out.x * radius * 0.5 + fall.across.x * offset;
      const z = lip.z + fall.out.z * radius * 0.5 + fall.across.z * offset;
      icicleCluster(b, P(x, lip.y - radius - FRINGE_DROP, z),
        { count: 3, length, spread: spacing * 0.55, reach: FRINGE_DROP + radius * 2, along: fall.across });
    }
  }
}

/**
 * Loose pieces on the ground within `radius` of `at`: calved ice with `blocky`
 * near 1, moraine boulders near 0. A few big pieces land anywhere; the rest is
 * the litter they shed, lying close around them. `groundAt(x, z)` gives where
 * each one rests; the big ones block the way.
 */
export function scatter(b, at, radius, count, groundAt, { material, size = [0.5, 2], blocky = 0, tint = 0xffffff } = {}) {
  const span = size[1] - size[0], heads = [];
  const headCount = Math.max(1, Math.round(count * HEAD_SHARE));
  for (let index = 0; index < count; index += 1) {
    const head = index < headCount;
    const parent = head ? undefined : heads[Math.floor(b.random() * heads.length)];
    const angle = b.range(0, TAU);
    const reach = parent ? parent.scale * b.range(1.1, 2.8) : radius * Math.sqrt(b.random());
    const x = (parent ?? at).x + Math.cos(angle) * reach, z = (parent ?? at).z + Math.sin(angle) * reach;
    const ground = groundAt(x, z);
    if (ground === null || Number.isNaN(ground)) continue;
    const scale = size[0] + span * (head ? b.range(0.5, 1) : 0.5 * b.random() ** LITTER_SKEW);
    if (head) heads.push({ x, z, scale });
    const squash = head ? b.range(0.55, 0.9) : b.range(0.4, 0.8);
    b.prop(material, boulder(P(x, ground - scale * 0.12, z), scale, scale * squash, scale * b.range(0.7, 1.15),
      { seed: Math.floor(b.range(1, 9999)), blocky, yaw: b.range(0, TAU) }), tint);
    if (scale > 0.8) b.nav.block(P(x, ground, z), scale * 0.95, scale * squash * 1.4);
  }
}
