import {
  abs,
  cameraViewMatrix,
  faceDirection,
  max,
  oneMinus,
  positionView,
  transformDirection,
  vec3,
} from 'three/tsl';

const SPECULAR_AA_VARIANCE = 0.5;
const SPECULAR_AA_MAX_KERNEL = 0.36;

function decodeUpperHemisphereOctNormal(encoded) {
  const x = encoded.r;
  const z = encoded.g;
  const y = max(0, oneMinus(abs(x).add(abs(z))));
  return vec3(x, y, z).normalize();
}

/**
 * Geometric specular antialiasing (Kaplanyan/Tokuyoshi): roughness widens where
 * the normal changes faster than a pixel resolves. Wet sand's tight lobe otherwise
 * lands on alternate pixels at grazing angles and draws a dotted moiré.
 */
export function antialiasSpecularRoughness(roughness, normal) {
  const dx = normal.dFdx(), dy = normal.dFdy();
  const variance = dx.dot(dx).add(dy.dot(dy)).mul(SPECULAR_AA_VARIANCE);
  return roughness.mul(roughness).add(variance.min(SPECULAR_AA_MAX_KERNEL)).sqrt();
}

export function createTerrainSurfaceNormal({ encodedNormal, detailHeight, detailStrength }) {
  const worldNormal = decodeUpperHemisphereOctNormal(encodedNormal);
  const surfaceNormal = transformDirection(worldNormal, cameraViewMatrix);
  // Height and position derivatives must retain the same pixel footprint.
  // Normalizing only position made relief depend on distance/resolution and
  // can produce camera-dependent highlights on shallow banks.
  const sigmaX = positionView.dFdx();
  const sigmaY = positionView.dFdy();
  const r1 = sigmaY.cross(surfaceNormal);
  const r2 = surfaceNormal.cross(sigmaX);
  const determinant = sigmaX.dot(r1).mul(faceDirection);
  const gradient = determinant.sign().mul(
    detailHeight.dFdx().mul(r1)
      .add(detailHeight.dFdy().mul(r2))
      .mul(detailStrength),
  );
  return abs(determinant).mul(surfaceNormal).sub(gradient).normalize();
}
