import { sampleCubicBezierPath } from '../curve/CubicBezierPath.js';
import { createCurveArcTable } from '../masonry/CurveArcTable.js';
import { buildModuleGrowth, buildModuleMasonry, attachConstructionGrowth } from './ConstructionMasonryBuilder.js';
import { constructionGroundSampler } from './ConstructionGroundPatch.js';
import { encodeConstructionGeometry } from './ConstructionGeometryCodec.js';

export function buildConstructionGeometry(request) {
  const { record, placements } = request;
  const options = { record, moduleOrigin: request.moduleOrigin, pathInterval: request.pathInterval,
    lodBand: request.lodBand, includeGrowth: request.includeGrowth,
    materials: { stone: null, mortar: null, growth: request.includeGrowth ? {} : null },
    arcTable: createCurveArcTable(sampleCubicBezierPath(record.path)),
    groundHeightAt: constructionGroundSampler(request.groundPatch) };
  const built = request.growthOnly
    ? attachConstructionGrowth({ meshes: [], stats: { totalTriangles: 0 } }, buildModuleGrowth(placements, options))
    : buildModuleMasonry(placements, options);
  return encodeConstructionGeometry(built);
}
