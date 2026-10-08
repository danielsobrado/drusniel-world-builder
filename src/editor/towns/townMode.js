/**
 * Which renderer draws Azgaar burgs.
 *
 * SettlementView (src/editor/world/settlements/view) is the default. The
 * medieval-kit towns in this folder are opt-in: open the editor with
 * `?towns=kit` and they replace it (buildings, doors, interiors and their
 * colliders), since both draw houses on the same plots.
 */
export function kitTownsEnabled(search = globalThis.location?.search ?? '') {
  return new URLSearchParams(search).get('towns') === 'kit';
}
