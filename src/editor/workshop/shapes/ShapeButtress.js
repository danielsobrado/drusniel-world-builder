import { createShapeWallSurface } from './ShapeWallSurface.js';
import { shapeBounds } from './ShapePaths.js';
import { shapeRandom } from './ShapeMesh.js';

/** A support follows the host at every profile height, including its ground contact. */
export function resolveShapeButtress(host, intent, frame) {
  const wall = createShapeWallSurface(host), p = host.primitive;
  const width = Math.min(intent.width, 0.9), height = Math.min(intent.height, p.height * 0.86);
  const point = (x, y, z) => {
    const center = wall.point(frame.u, y, p.thickness / 2);
    return [center[0] + frame.tangent[0] * x + frame.outward[0] * z,
      center[1], center[2] + frame.tangent[2] * x + frame.outward[2] * z];
  };
  const depth = intent.depth;
  const profileKind = intent.profile === 'curved' ? 'curved' : 'stepped';
  const profile = profileKind === 'curved'
    ? [
        [0, -0.05], [depth, -0.05], [depth, 0.18],
        ...Array.from({ length: 7 }, (_, i) => {
          const u = (i + 1) / 8;
          return [depth * Math.cos(u * Math.PI * 0.44), 0.18 + (height - 0.18) * Math.sin(u * Math.PI * 0.5)];
        }),
        [0.05, height], [0, height],
      ]
    : [[0, -0.05], [depth, -0.05], [depth, 0.4], [depth * 0.28, height * 0.7], [depth * 0.18, height], [0, height]];
  const sides = [-1, 1].map((sign) => profile.map(([z, y]) => point(sign * width / 2, y, z)));
  const footprint = [[-width / 2, 0], [width / 2, 0], [width / 2, depth], [-width / 2, depth]]
    .map(([x, z]) => { const v = point(x, 0, z); return [v[0], v[2]]; });
  return {
    frame: { ...frame, origin: point(0, 0, 0) },
    solidSupport: {
      width,
      height,
      depth,
      profileKind,
      sides,
      footprint,
      bounds: shapeBounds(sides.flat().map(([x, , z]) => [x, z])),
    },
  };
}

function depthAtHeight(profileKind, depth, height, y) {
  const t = Math.max(0, Math.min(1, y / Math.max(0.1, height)));
  if (profileKind === 'curved') {
    if (y <= 0.18) return depth;
    const u = Math.max(0, Math.min(1, (y - 0.18) / Math.max(0.1, height - 0.18)));
    return Math.max(0.05, depth * Math.sqrt(Math.max(0, 1 - u * u)));
  }
  if (y <= 0.4) return depth;
  if (t <= 0.7) return depth * (1 - ((t - 0.4 / Math.max(0.45, height)) / Math.max(0.1, 0.7 - 0.4 / Math.max(0.45, height))) * 0.72);
  return depth * (0.28 - ((t - 0.7) / 0.3) * 0.1);
}

export function buildShapeButtress(feature, mesh, tint = [0.9, 0.9, 0.9], detail = 2, seed = 1848, hostId = '') {
  const { sides, width, height, depth, profileKind } = feature.solidSupport;
  const count = sides[0].length;
  for (let i = 1; i < count - 1; i++) {
    mesh.triangle(sides[0][0], sides[0][i + 1], sides[0][i], tint);
    mesh.triangle(sides[1][0], sides[1][i], sides[1][i + 1], tint);
  }
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    mesh.quad(sides[0][i], sides[0][j], sides[1][j], sides[1][i], tint);
  }
  if (detail < 2 || !depth || height < 0.35) return;
  const { origin, tangent, outward } = feature.frame;
  const courses = Math.max(3, Math.ceil(height / (profileKind === 'curved' ? 0.18 : 0.3)));
  const stepH = height / courses;
  const ccw = tangent[0] * outward[2] - tangent[2] * outward[0] < 0;
  for (let row = 0; row < courses; row++) {
    const y0 = row * stepH + 0.012;
    const y1 = (row + 1) * stepH - 0.012;
    if (y1 <= y0) continue;
    const d0 = depthAtHeight(profileKind, depth, height, y0) + 0.018;
    const d1 = Math.max(0.08, depthAtHeight(profileKind, depth, height, y1) + 0.018);
    const hw = width / 2 + 0.016;
    const v = 0.88 + shapeRandom(seed, hostId, 'buttress-course', `${feature.intent.id}:${row}`) * 0.14;
    const tone = tint.map((c) => c * v);
    const ring = (y, d) => [
      [origin[0] - tangent[0] * hw, origin[1] + y, origin[2] - tangent[2] * hw],
      [origin[0] + tangent[0] * hw, origin[1] + y, origin[2] + tangent[2] * hw],
      [origin[0] + tangent[0] * hw + outward[0] * d, origin[1] + y, origin[2] + tangent[2] * hw + outward[2] * d],
      [origin[0] - tangent[0] * hw + outward[0] * d, origin[1] + y, origin[2] - tangent[2] * hw + outward[2] * d],
    ];
    const bot = ring(y0, d0), top = ring(y1, d1);
    for (const [a, b, shade] of [[1, 2, 0.94], [2, 3, 1.04], [3, 0, 0.92]]) {
      const quad = [bot[a], bot[b], top[b], top[a]];
      mesh.quad(...(ccw ? quad : quad.toReversed()), tone.map((c) => c * shade));
    }
    const cap = [top[0], top[1], top[2], top[3]];
    mesh.quad(...(ccw ? cap : cap.toReversed()), tone.map((c) => c * 1.08));
  }
}
