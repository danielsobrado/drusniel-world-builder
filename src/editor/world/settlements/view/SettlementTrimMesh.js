import * as THREE from 'three/webgpu';
import { attribute, mx_noise_float, positionLocal, sin, smoothstep, time, uv, vec3, vertexColor } from 'three/tsl';
import { STONE_PALETTES } from '../../../workshop/ProceduralWorkshopMaterials.js';
import { projectedUvAt } from '../../../workshop/WorkshopProjectedUv.js';
import { WALL_STAIR } from '../SettlementTrim.js';

const WOOD = [0.2, 0.12, 0.07];
const IRON = [0.07, 0.07, 0.08];
/**
 * Painted boards, cloth and fleece, as linear colours. Paint and dye are aged:
 * earth pigments gone chalky in the weather, never a primary — the boards also
 * wear the town's timber grain under them.
 */
const SIGN_BOARDS = [[0.36, 0.11, 0.07], [0.1, 0.13, 0.17], [0.36, 0.28, 0.11], [0.12, 0.18, 0.1]];
const AWNING_CLOTH = [[0.36, 0.12, 0.09], [0.12, 0.15, 0.2], [0.4, 0.33, 0.17]];
const CLOTH_STRIPE = [0.62, 0.58, 0.48];
/** Trim built of wood, which wears the town's timber set. */
const WOODEN = new Set(['shopSign']);
/** Trim of canvas, which is woven and weathered in the shader. */
const CLOTH = new Set(['awning']);
/**
 * Canvas over the dye in its vertex colour: darker where rain runs off and dirt
 * gathers, bleached in broad patches where the sun has had it. No weave: at
 * street distance a thread-scale pattern only shimmers.
 */
function canvasColour() {
  const at = uv();
  const stain = smoothstep(0.1, 0.6, mx_noise_float(vec3(at.x.mul(2.2), at.y.mul(5.5), 1.3))).mul(0.24);
  const bleach = smoothstep(0, 0.5, mx_noise_float(vec3(at.mul(0.9), 7.1))).mul(0.025);
  return vertexColor().rgb.mul(stain.oneMinus()).add(bleach);
}
const LEAF = [[0.05, 0.13, 0.035], [0.09, 0.2, 0.05], [0.04, 0.1, 0.03], [0.12, 0.24, 0.06]];
const IVY_YELLOWED = [0.26, 0.24, 0.07];
const IVY_STEM = [0.07, 0.05, 0.035];
const FLEECE = [[0.82, 0.8, 0.72], [0.3, 0.26, 0.22]];
const FEATHER = [[0.5, 0.26, 0.1], [0.82, 0.8, 0.74]];

function seeded(seed) {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flat-shaded boxes and quads gathered into one geometry with vertex colours. */
class TrimBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
  }

  /** A quad a→b→c→d, counter-clockwise seen from its front. */
  quad(a, b, c, d, color) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(...normal) || 1;
    for (const point of [a, b, c, a, c, d]) {
      this.positions.push(...point);
      this.normals.push(normal[0] / length, normal[1] / length, normal[2] / length);
      this.colors.push(...color);
    }
  }

  /** An axis-aligned box centred on (x, y, z). */
  box(x, y, z, width, height, depth, color) {
    const [x0, x1, y0, y1, z0, z1] = [x - width / 2, x + width / 2, y - height / 2, y + height / 2, z - depth / 2, z + depth / 2];
    const shade = (factor) => color.map((channel) => channel * factor);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], shade(1));
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], shade(0.8));
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], shade(0.9));
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], shade(0.85));
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], shade(1.1));
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], shade(0.6));
  }

  geometry({ uvDensity = 0 } = {}) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.colors), 3));
    const uvs = new Float32Array(this.positions.length / 3 * 2);
    if (uvDensity > 0) {
      for (let vertex = 0; vertex < uvs.length / 2; vertex += 1) {
        const offset = vertex * 3;
        projectedUvAt(uvs, vertex * 2, this.positions[offset], this.positions[offset + 1], this.positions[offset + 2],
          this.normals[offset], this.normals[offset + 1], this.normals[offset + 2], uvDensity);
      }
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    return geometry;
  }
}

/** Local +z is the front: a sign hangs out over the street from the wall at z = 0. */
function shopSign(builder, variant) {
  builder.box(0, 3.25, 0.5, 0.06, 0.06, 1, IRON);
  builder.box(0, 3.0, 0.5, 0.05, 0.5, 0.05, IRON);
  builder.box(0, 2.72, 0.62, 0.07, 0.5, 0.72, SIGN_BOARDS[variant % SIGN_BOARDS.length]);
  builder.box(0, 2.72, 0.62, 0.09, 0.56, 0.06, WOOD);
}

function awning(builder, variant) {
  const cloth = AWNING_CLOTH[variant % AWNING_CLOTH.length];
  const stripes = 6;
  const width = 3;
  for (let stripe = 0; stripe < stripes; stripe += 1) {
    const x0 = -width / 2 + width * stripe / stripes;
    const x1 = x0 + width / stripes;
    const color = stripe % 2 ? CLOTH_STRIPE : cloth;
    builder.quad([x0, 2.2, 1.3], [x1, 2.2, 1.3], [x1, 2.75, 0.02], [x0, 2.75, 0.02], color);
    // The hanging valance along the front edge.
    builder.quad([x0, 1.98, 1.3], [x1, 1.98, 1.3], [x1, 2.2, 1.3], [x0, 2.2, 1.3], color.map((channel) => channel * 0.85));
  }
  for (const x of [-width / 2 + 0.05, width / 2 - 0.05]) builder.box(x, 1.1, 1.26, 0.07, 2.2, 0.07, WOOD);
}

/**
 * Ivy climbing a wall at z = 0: woody stems branching up from the foot, and
 * small leaves clustered along them, thickest low down. Leaves are pointed
 * (a diamond, broad at its base), in deep and sunlit greens with a few
 * yellowed, each turned out from the wall by its own amount — a sheet of
 * same-coloured squares read as paper, not foliage.
 */
function ivyPatch(builder, variant) {
  const random = seeded(variant + 11);
  const spread = 2.4 + variant * 0.5;
  const height = 3 + variant * 0.6;
  const stems = 5 + variant;
  for (let stem = 0; stem < stems; stem += 1) {
    let x = (random() - 0.5) * spread * 0.6;
    let y = 0;
    const top = height * (0.45 + random() * 0.55);
    while (y < top) {
      const step = 0.22 + random() * 0.12;
      const nx = x + (random() - 0.5) * 0.28;
      const ny = y + step;
      // The stem, a dark woody strip on the wall.
      builder.quad([x - 0.012, y, 0.015], [x + 0.012, y, 0.015], [nx + 0.012, ny, 0.015], [nx - 0.012, ny, 0.015], IVY_STEM);
      const leaves = Math.max(1, Math.round((1 - y / height) * 5 + random() * 2));
      for (let leaf = 0; leaf < leaves; leaf += 1) ivyLeaf(builder, random, nx + (random() - 0.5) * 0.4, ny + (random() - 0.5) * 0.2);
      x = nx;
      y = ny;
    }
  }
}

function ivyLeaf(builder, random, x, y) {
  const size = 0.06 + random() * 0.06;
  const out = 0.03 + random() * 0.1;
  const lean = (random() - 0.5) * 0.08;
  const pick = random();
  const colour = pick < 0.06 ? IVY_YELLOWED : LEAF[Math.floor(random() * LEAF.length)];
  const tone = 0.75 + random() * 0.45;
  const shade = colour.map((channel) => channel * tone);
  builder.quad(
    [x, y - size * 0.7, out - 0.02],
    [x + size, y, out + lean],
    [x, y + size * 1.2, out + 0.02],
    [x - size, y, out - lean],
    shade,
  );
}

/** A straight flight rising along +x, each step solid down to the ground. */
function wallStair(builder, stone) {
  const steps = Math.round(WALL_STAIR.height / WALL_STAIR.rise);
  const length = steps * WALL_STAIR.run;
  for (let step = 0; step < steps; step += 1) {
    const top = WALL_STAIR.rise * (step + 1);
    const shade = 0.82 + ((step * 7) % 5) * 0.04;
    builder.box(-length / 2 + WALL_STAIR.run * (step + 0.5), top / 2, 0, WALL_STAIR.run, top, WALL_STAIR.width, stone.map((channel) => channel * shade));
  }
}

function sheep(builder, variant) {
  const fleece = FLEECE[variant % FLEECE.length];
  const dark = [0.08, 0.07, 0.06];
  builder.box(0, 0.62, 0, 0.5, 0.48, 0.95, fleece);
  builder.box(0, 0.74, 0.02, 0.56, 0.3, 0.8, fleece.map((channel) => channel * 1.05));
  // Head down, grazing.
  builder.box(0, 0.42, 0.6, 0.2, 0.22, 0.3, dark);
  for (const [x, z] of [[-0.16, 0.32], [0.16, 0.32], [-0.16, -0.32], [0.16, -0.32]]) builder.box(x, 0.2, z, 0.08, 0.4, 0.08, dark);
}

function hen(builder, variant) {
  const feather = FEATHER[variant % FEATHER.length];
  builder.box(0, 0.22, 0, 0.16, 0.18, 0.26, feather);
  builder.box(0, 0.3, -0.15, 0.1, 0.16, 0.08, feather.map((channel) => channel * 0.8));
  builder.box(0, 0.36, 0.14, 0.08, 0.1, 0.09, feather);
  builder.box(0, 0.42, 0.15, 0.03, 0.04, 0.06, [0.6, 0.06, 0.05]);
  builder.box(0, 0.35, 0.21, 0.03, 0.03, 0.05, [0.7, 0.5, 0.1]);
  for (const x of [-0.04, 0.04]) builder.box(x, 0.07, 0, 0.02, 0.14, 0.02, [0.6, 0.45, 0.1]);
}

const BUILDERS = Object.freeze({ shopSign, awning, ivyPatch, sheep, hen });

/** How far an animal ambles from where it was put, how fast, and how high its step lifts it. */
const GAIT = Object.freeze({ sheep: [1.6, 0.11, 0.03], hen: [0.9, 0.5, 0.05] });

/**
 * A slow amble for a whole animal, in the shader: each instance drifts round
 * its spot on two unrelated clocks and bobs as it steps, out of time with its
 * neighbours by the stable seed its instance carries. No per-frame work.
 */
function amble([range, pace, lift]) {
  const phase = attribute('instanceDither', 'vec3').y.mul(97);
  const clock = time.mul(pace).add(phase);
  return positionLocal.add(vec3(
    sin(clock).mul(range),
    sin(time.mul(pace * 24).add(phase)).abs().mul(lift),
    sin(clock.mul(0.63).add(1.7)).mul(range),
  ));
}

/**
 * One pooled piece of trim as a part the instanced renderers can draw. Colour
 * is per vertex; the wall stair wears the town's stone surface set (it is the
 * wall's own stone) and wooden trim its timber set, the vertex colour tinting it.
 *
 * @param {{ kind: string, variant: number, style: { style: string }, surfaces?: { stone?: object } }} entry
 */
export function createSettlementTrimParts(entry) {
  const builder = new TrimBuilder();
  const stair = entry.kind === 'wallStair';
  if (stair) wallStair(builder, (STONE_PALETTES[entry.style.style] ?? STONE_PALETTES.granite).base.map((channel) => channel / 255));
  else BUILDERS[entry.kind](builder, entry.variant);
  const wooden = WOODEN.has(entry.kind);
  const set = stair ? entry.surfaces?.stone ?? null : wooden ? entry.surfaces?.timber ?? null : null;
  const material = new THREE.MeshStandardNodeMaterial({
    color: '#ffffff',
    map: set?.color ?? null,
    normalMap: set?.normal ?? null,
    roughnessMap: set?.arm ?? null,
    vertexColors: true,
    roughness: set ? 1 : 0.9,
    metalness: 0,
    // Cloth and leaves are single sheets, seen from both sides.
    side: entry.kind === 'awning' || entry.kind === 'ivyPatch' ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (GAIT[entry.kind]) material.positionNode = amble(GAIT[entry.kind]);
  material.userData.workshopSlot = stair ? 'stone' : 'wood';
  const cloth = CLOTH.has(entry.kind);
  if (cloth) {
    material.colorNode = canvasColour();
    material.vertexColors = false;
  }
  const uvDensity = stair ? 0.58 : set ? 1.1 : cloth ? 1 : 0;
  return [{ geometry: builder.geometry({ uvDensity }), material, matrix: new THREE.Matrix4() }];
}
