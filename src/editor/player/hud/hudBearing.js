const DEGREES = 180 / Math.PI;

/**
 * Where a world-space direction sits relative to the camera, in degrees: 0 dead
 * ahead, positive to the right, ±180 behind. `yaw` is the camera's, whose forward
 * at 0 is -Z.
 */
export function relativeBearing(worldDx, worldDz, yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return Math.atan2(worldDx * cos - worldDz * sin, -worldDx * sin - worldDz * cos) * DEGREES;
}

/**
 * The sixteen compass points as world directions, labelled at every second one.
 * North is +Z and east is +X, the axes the Azgaar map lands on (cell z runs towards
 * -Z), so the letters agree with the minimap's north badge and with where the
 * burgs actually are.
 */
export const COMPASS_POINTS = Object.freeze(
  ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].flatMap((label, index) => [0, 1].map((step) => {
    const angle = ((index * 2 + step) * Math.PI) / 8;
    return Object.freeze({
      label: step ? '' : label,
      worldDx: Math.sin(angle),
      worldDz: Math.cos(angle),
    });
  })),
);
