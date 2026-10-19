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

function decodeUpperHemisphereOctNormal(encoded) {
  const x = encoded.r;
  const z = encoded.g;
  const y = max(0, oneMinus(abs(x).add(abs(z))));
  return vec3(x, y, z).normalize();
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
