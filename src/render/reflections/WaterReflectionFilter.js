import { abs, normalize, select, vec2, vec3 } from 'three/tsl';

/** Bounded spatial filtering of the existing captures. No new targets/passes. */
export function filteredWaterCube(source, direction, roughness) {
  const axis = select(abs(direction.y).greaterThan(.9), vec3(1, 0, 0), vec3(0, 1, 0));
  const tangent = normalize(direction.cross(axis));
  const across = direction.cross(tangent);
  const spread = roughness.mul(.16);
  const diagonal = tangent.add(across.mul(.7)).mul(spread);
  return source.sample(direction).rgb.mul(.5)
    .add(source.sample(normalize(direction.add(diagonal))).rgb.mul(.25))
    .add(source.sample(normalize(direction.sub(diagonal))).rgb.mul(.25));
}

export function filteredWaterPlanar(source, uv, roughness, resolution) {
  const spread = vec2(1 / (resolution * 2), 1 / resolution).mul(roughness.mul(5));
  return source.sample(uv.clamp(0, 1)).rgb.mul(.5)
    .add(source.sample(uv.add(spread).clamp(0, 1)).rgb.mul(.25))
    .add(source.sample(uv.sub(spread).clamp(0, 1)).rgb.mul(.25));
}
