import { icicle, spindle } from '../gen/iceKit.js';
import { fbm3 } from '../gen/noise.js';

/**
 * Icicles where they really grow. Meltwater runs along the underside of a roof
 * to its low points and lips and freezes there in ranks: a dominant icicle or
 * two, lesser ones shortening to either side, a fringe of small drips, close
 * neighbours fused into drapery, and the whole rank rooted in a bulb of
 * refrozen seep. Material key: `clearIce`.
 */

const P = (x, y, z) => ({ x, y, z });
const TAU = Math.PI * 2;
/** How far a root runs on past the roof beyond its own flare, metres: covers the voxel steps the roof is meshed from. */
const ROOT_SINK = 0.12;
/** Steps meltwater is followed down a sloping roof before it drips, each half a cluster's spread. */
const GATHER_STEPS = 3;
/** Roof slope (horizontal share of its normal) below which water drips where it is rather than running on. */
const RUNOFF_SLOPE = 0.15;
/** Thickness of an icicle at its root: a least radius plus so much per metre of length. */
const MIN_ICICLE_RADIUS = 0.035, RADIUS_PER_METRE = 0.05;
/** A cluster's lead length is drawn as `u ** LENGTH_SKEW` across its range: many short, some medium, few long. */
const LENGTH_SKEW = 1.6;
/** Default share of clusters that grow one great icicle, its length in metres, and how much stouter it is. */
const GIANT_SHARE = 0.06, GIANT_LENGTH = [3, 5], GIANT_GIRTH = 1.4;
/** Small drips fringing a rank, per principal icicle. */
const FRINGE_SHARE = 0.5;
/** Share of the lesser icicles that have fallen, leaving a stump; and of ranks with a second near-dominant one. */
const FALLEN_SHARE = 0.12, SECOND_SHARE = 0.35;
/** Neighbours closer than this many summed radii have fused into a sheet. */
const FUSE_RADII = 3;
/** Roots within this height of the rank's roof share its seep bulb and drapery, metres. */
const SEEP_SPAN = 0.35;
/** How far below an icicle's point the floor is looked for, and the gap at which a stalagmite has met it, metres. */
const FLOOR_REACH = 6, COLUMN_GAP = 0.35;
/** Share of a curtain's stations left bare, where a rank fell or never formed. */
const CURTAIN_GAP = 0.12;

/**
 * A rank of icicles under the roof above `at` (a point in open air): rooted
 * where the roof actually is, gathered toward its low point, running along
 * `along` (a plan direction; by default along the roof's contour, as on a
 * lip). `drip` sheds meltwater from the longest; `floor` lets drips build a
 * stalagmite or a column under it (off by default: it blocks the way);
 * `giants` is the share of clusters that grow one 3–5 m icicle where the roof
 * is high enough. Returns false where there is no roof within `reach`.
 */
export function icicleCluster(b, at, {
  count = 4, length = [0.5, 2.2], spread = 0.5, reach = 14, drip = false, along = null, floor = false, giants = GIANT_SHARE,
} = {}) {
  if (b.grid.sample(at.x, at.y, at.z) < 0) return false;
  const roof = roofAbove(b, at.x, at.y, at.z, reach);
  if (roof === null) return false;
  const site = gather(b, at.x, at.z, roof, at.y, spread * 0.5);
  const turn = b.range(0, TAU);
  const rank = planUnit(along) ?? (site.runoff ? { x: -site.runoff.z, z: site.runoff.x } : { x: Math.cos(turn), z: Math.sin(turn) });
  // What sets one cluster apart from the next: how fast it shortens, how stout it is, the wind it froze in.
  const falloff = b.range(0.35, 0.85), girth = b.range(0.8, 1.3), windAt = b.range(0, TAU), wind = b.range(0, 0.05);
  const giant = length[1] >= 2 && b.random() < giants;
  const lead = giant ? b.range(...GIANT_LENGTH) : length[0] + (length[1] - length[0]) * b.random() ** LENGTH_SKEW;
  const leadAt = b.range(-0.2, 0.2) * spread;
  const hung = [];
  let dominant = null;
  for (let index = 0; index < count + Math.round(count * FRINGE_SHARE); index += 1) {
    const principal = index < count;
    const offset = index === 0 ? leadAt : b.range(-1, 1) * spread * (principal ? 1 : 1.2);
    const depth = b.range(-0.2, 0.2) * spread;
    const x = site.x + rank.x * offset - rank.z * depth, z = site.z + rank.z * offset + rank.x * depth;
    const from = Math.max(at.y, site.roof - 1.2);
    if (b.grid.sample(x, from, z) < 0) continue;
    const top = roofAbove(b, x, from, z, 4);
    if (top === null) continue;
    const fallen = index > 0 && principal && b.random() < FALLEN_SHARE;
    let long;
    if (index === 0) long = lead;
    else if (!principal) long = b.range(0.08, 0.3);
    else if (fallen) long = b.range(0.06, 0.18);
    else if (index === 1 && b.random() < SECOND_SHARE) long = lead * b.range(0.75, 0.95);
    else long = lead * (1 - falloff * Math.abs(offset - leadAt) / (2 * spread)) * b.range(0.45, 1);
    // None reaches lower than the roof is high above the walker's head.
    long = Math.min(long, (top - at.y) * 0.8 + 0.4);
    const radius = (MIN_ICICLE_RADIUS + long * RADIUS_PER_METRE) * girth * (giant && index === 0 ? GIANT_GIRTH : 1);
    const lean = {
      x: Math.cos(windAt) * wind * long + b.range(-0.02, 0.02), z: Math.sin(windAt) * wind * long + b.range(-0.02, 0.02),
    };
    // Sunk deep enough that its flare stays inside a sloping roof.
    b.prop('clearIce', icicle(P(x, top, z), long, radius,
      { lean, sink: ROOT_SINK + radius * 2.5, phase: b.range(0, 1000), broken: index === 0 ? false : fallen || undefined }), 0xffffff);
    const member = { x, z, top, long, radius, offset, whole: principal && !fallen, tip: P(x + lean.x, top - long, z + lean.z) };
    hung.push(member);
    if (index === 0) dominant = member;
  }
  const rooted = hung.filter((member) => member.whole && Math.abs(member.top - site.roof) < SEEP_SPAN);
  seep(b, rooted, site, rank);
  fuse(b, rooted);
  if (dominant && drip) b.emit('drip', dominant.tip);
  if (dominant && floor) stalagmite(b, dominant.tip, dominant.radius);
  return true;
}

/**
 * A curtain of icicles under a lip or overhang from `a` to `c`: ranks every
 * `spacing` metres running along it, longest where meltwater gathered into a
 * run, with gaps where a rank fell.
 */
export function icicleCurtain(b, a, c, { spacing = 0.8, length = [0.6, 2.6], drip = false } = {}) {
  const span = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z);
  const along = { x: c.x - a.x, z: c.z - a.z }, salt = b.range(0, 100);
  for (let distance = 0; distance <= span; distance += spacing) {
    if (b.random() < CURTAIN_GAP) continue;
    const t = span > 0 ? distance / span : 0;
    const run = Math.min(1, Math.max(0.15, (fbm3(distance * 0.35 + salt, 0.5, 0.5, 7, 2) - 0.3) * 2.5));
    icicleCluster(b, P(a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t, a.z + (c.z - a.z) * t), {
      count: 3, length: [length[0], length[0] + (length[1] - length[0]) * run], spread: spacing * 0.55,
      drip: drip && b.random() < 0.3, along,
    });
  }
}

/** Height of the roof above a point in open air, read between samples, or null within `reach`. */
function roofAbove(b, x, y, z, reach) {
  const hit = b.probe(x, y, z, 1, reach);
  if (hit === null || hit === y) return hit;
  // The probe stops at the first solid sample; the surface lies between it and the one before.
  const step = b.grid.voxel * 0.5;
  const solid = b.grid.sample(x, hit, z), air = b.grid.sample(x, hit - step, z);
  return hit - step + step * air / (air - solid);
}

/**
 * Follows meltwater down the underside of a sloping roof for a few short
 * steps, staying over open air at `airY`. Returns where it drips and the plan
 * direction it ran (null on a level roof).
 */
function gather(b, x, z, roof, airY, stride) {
  const normal = { x: 0, y: 0, z: 0 };
  let runoff = null;
  for (let step = 0; step < GATHER_STEPS; step += 1) {
    b.grid.gradient(x, roof, z, normal);
    const slope = Math.hypot(normal.x, normal.z);
    if (slope < RUNOFF_SLOPE) break;
    // The air-ward normal leans toward where the roof rises; the water runs the other way.
    runoff = { x: -normal.x / slope, z: -normal.z / slope };
    const nx = x + runoff.x * stride, nz = z + runoff.z * stride;
    if (b.grid.sample(nx, airY, nz) < 0) break;
    const lower = roofAbove(b, nx, airY, nz, roof - airY);
    if (lower === null || lower >= roof) break;
    x = nx; z = nz; roof = lower;
  }
  return { x, z, roof, runoff };
}

function planUnit(v) {
  const length = v ? Math.hypot(v.x, v.z) : 0;
  return length > 1e-6 ? { x: v.x / length, z: v.z / length } : null;
}

/** A plan ellipse `half` along `u` and `thin` across it, as a `spindle` ring shape. */
const ellipse = (u, half, thin, angle) => [
  Math.cos(angle) * half * u.x - Math.sin(angle) * thin * u.z, Math.cos(angle) * half * u.z + Math.sin(angle) * thin * u.x,
];

/** The bulb of refrozen seep a rank grows out of: tucked closely into the roof so it never reads as a floating blob. */
function seep(b, roots, site, rank) {
  if (roots.length < 2) return;
  const offsets = roots.map((root) => root.offset), tops = roots.map((root) => root.top);
  const girth = Math.max(...roots.map((root) => root.radius));
  const half = (Math.max(...offsets) - Math.min(...offsets)) / 2 + girth * 1.4, thin = girth * 1.65;
  const mid = (Math.max(...offsets) + Math.min(...offsets)) / 2, x = site.x + rank.x * mid, z = site.z + rank.z * mid;
  const high = Math.max(...tops), low = Math.min(...tops), drop = girth * 1.15 + b.range(0.03, 0.09), lump = b.range(0, TAU);
  const shape = (angle) => ellipse(rank, half, thin, angle).map((d) => d * (1 + 0.10 * Math.cos(3 * angle + lump)));
  b.prop('clearIce', spindle([P(x, high + ROOT_SINK + girth * 1.4, z), { ...P(x, high + ROOT_SINK * 0.4, z), r: 1 },
    { ...P(x, low - drop * 0.45, z), r: 0.62 }, P(x, low - drop, z)], 8, shape), 0xffffff);
}

/** Close neighbours fuse into a sheet hung between them, its lower edge arched up where they part. */
function fuse(b, roots) {
  const rank = [...roots].sort((p, q) => p.offset - q.offset);
  for (let index = 1; index < rank.length; index += 1) {
    const p = rank[index - 1], q = rank[index];
    const gap = Math.hypot(q.x - p.x, q.z - p.z), shorter = Math.min(p.long, q.long);
    if (gap < 1e-3 || gap > (p.radius + q.radius) * FUSE_RADII || shorter < 0.4) continue;
    const u = { x: (q.x - p.x) / gap, z: (q.z - p.z) / gap }, thin = Math.min(p.radius, q.radius) * 0.5;
    const roof = Math.max(p.top, q.top), depth = shorter * b.range(0.25, 0.55), arch = depth * b.range(0.5, 0.8);
    const x = (p.x + q.x) / 2, z = (p.z + q.z) / 2;
    // The upper ring spans axis to axis at the roof; the lower one thins and lifts mid-gap.
    const shape = (angle, t) => (t < 0.5 ? ellipse(u, gap / 2, thin, angle)
      : [...ellipse(u, gap / 2, thin * 0.6, angle), arch * Math.sin(angle) ** 2]);
    b.prop('clearIce', spindle([P(x, roof + ROOT_SINK, z), { ...P(x, roof, z), r: 1 },
      { ...P(x, roof - depth, z), r: 1 }, P(x, roof - depth + arch * 0.95, z)], 8, shape), 0xffffff);
  }
}

/**
 * Where drips from an icicle land they build a squat stalagmite under its
 * point; where the gap closed, the two have met in a column. Blocks the walker.
 */
function stalagmite(b, tip, radius) {
  const ground = b.probe(tip.x, tip.y, tip.z, -1, FLOOR_REACH);
  if (ground === null) return;
  const gap = tip.y - ground, base = radius * b.range(1.6, 2.4), wobble = b.range(0, TAU);
  const height = gap < COLUMN_GAP ? gap + 0.3 : Math.min(gap * 0.5, radius * b.range(4, 8));
  const stations = [P(tip.x, ground + height, tip.z)];
  for (let ring = 1; ring <= 4; ring += 1) {
    const s = ring / 4;
    stations.push({ ...P(tip.x, ground + height * (1 - s), tip.z), r: base * (0.3 + 0.7 * s ** 0.6) * (1 + 0.08 * Math.sin(ring * 2.3 + wobble)) });
  }
  stations.push(P(tip.x, ground - 0.25, tip.z));
  b.prop('clearIce', spindle(stations, 7), 0xffffff);
  b.nav.block(P(tip.x, ground, tip.z), base + 0.15, height);
}
