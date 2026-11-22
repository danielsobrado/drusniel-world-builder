import { attribute, cos, dot, float, modelWorldMatrix, normalLocal, positionLocal,
  sin, transformNormalToView, vec3, vec4 } from 'three/tsl';
import { canonicalFromRender, sampleWorldWind, windWaveCoordinates } from '../weather/wind/worldWindState.js';
import { groundDetailWindPosition } from './groundDetailWind.js';
import { applyShaderGroundConform } from './groundSeating.js';
import { resolvePlantMotion } from './PlantMotionProfiles.js';
import { plantSwayTime } from './plantSway.js';

function rotate(vector, direction, angle) {
  const axis = vec3(direction.y, 0, direction.x.negate());
  const c = cos(angle), s = sin(angle);
  return vector.mul(c).add(axis.cross(vector).mul(s))
    .add(axis.mul(dot(axis, vector)).mul(float(1).sub(c)));
}

/** Rigid fallback for plants without authored leaf/branch attachment channels.
 * Rotation after instancing preserves world-space leaf shape even on scaled
 * instances. The root attribute is uploaded with placement, never per frame.
 *
 * When `groundConform` is enabled, lower vertices also conform in the vertex
 * shader to the exact GPU `GroundContactField` surface while upper stems remain
 * phototropically upright.
 */
export function applyPlantMotion(material, { wind, height, profile = 'woody-shrub', groundConform = false } = {}) {
  const motion = resolvePlantMotion(profile);
  material.userData.plantMotionProfile = motion.id;
  const conform = Boolean(groundConform && height > 0);
  if (conform) material.userData.plantMotionAnchor = true;
  if (!wind || !(height > 0) || motion.give === 0) {
    if (conform) {
      material.positionNode = applyShaderGroundConform(material.positionNode ?? positionLocal, {
        height,
        rootNode: attribute('instancePlantRoot', 'vec3'),
        conformShare: 0.55,
      });
    }
    return material;
  }
  if (!motion.rigid) {
    const swayed = groundDetailWindPosition(wind, height);
    material.positionNode = conform
      ? applyShaderGroundConform(swayed, {
        height,
        rootNode: attribute('instancePlantRoot', 'vec3'),
        conformShare: 0.65,
      })
      : swayed;
    return material;
  }
  material.userData.plantMotionAnchor = true;
  material.userData.plantMotionReach = height * 2 * Math.sin(motion.maximumAngle / 2);
  const root = attribute('instancePlantRoot', 'vec3');
  const world = modelWorldMatrix.mul(vec4(root, 1)).xz;
  const field = sampleWorldWind(world);
  const phase = windWaveCoordinates(canonicalFromRender(world)).along.mul(wind.frequency ?? .47)
    .add(plantSwayTime.mul(wind.speed ?? 1.3))
    .add(attribute('instanceDither', 'vec3').y.mul(.9));
  const angle = float(wind.lean ?? .05).add(sin(phase).mul(wind.strength ?? .1))
    .mul(field.envelope.clamp(0, 3.5)).mul(2 * motion.give)
    .clamp(-motion.maximumAngle, motion.maximumAngle);
  const rotated = root.add(rotate(positionLocal.sub(root), field.direction, angle));
  material.positionNode = conform
    ? applyShaderGroundConform(rotated, { height, rootNode: root, conformShare: 0.45 })
    : rotated;
  material.normalNode = transformNormalToView(rotate(normalLocal, field.direction, angle))
    .toVarying('plantMotionNormal').normalize();
  return material;
}
