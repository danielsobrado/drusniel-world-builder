/**
 * A Stillmeadow (B14) camera pose from `cameras.yaml`: the spawn of
 * `__worldVisualQa.loadStillmeadow`, `offsetForward` metres in along its approach,
 * or, with `offsetFromTownEdge`, that many metres before the first building beside
 * the approach (`settlementFixture.townEdgeForward`).
 */
export function stillmeadowPose(approach, spec) {
  const fixture = approach.settlementFixture;
  const yaw = (approach.yawDegrees * Math.PI) / 180;
  const fromEdge = spec.offsetFromTownEdge != null && Number.isFinite(fixture.townEdgeForward);
  const dist = fromEdge ? fixture.townEdgeForward - spec.offsetFromTownEdge : (spec.offsetForward ?? 0);
  return {
    x: fixture.canonicalX - Math.sin(yaw) * dist,
    z: fixture.canonicalZ - Math.cos(yaw) * dist,
    yaw: yaw + (spec.yawOffset ?? 0),
    pitch: spec.pitch,
    mode: spec.mode,
    heightAboveGround: spec.heightAboveGround,
    fov: spec.fov,
  };
}
