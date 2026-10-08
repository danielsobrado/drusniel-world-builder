/**
 * Authored surface sets standing in for the workshop's synthesised ones.
 *
 * A caller that already holds photographed timber or plaster — a settlement
 * dressing its houses — generates inside `withWorkshopSurfaceOverrides`, and
 * `createWorkshopMaterials` then samples those maps instead of baking its own.
 * Scoped to one synchronous generation, so workshop authoring, baked objects
 * and headless tests never see an override they did not ask for.
 */

let active = null;

/**
 * @param {?{ timber?: object, plaster?: object, stone?: object, roof?: object, timberTint?: string }} surfaces
 *   sets of `{ color, normal, arm }` textures, by family. Plaster, stone and
 *   roof sets must be neutral: the finish, the per-stone and the per-tile
 *   colours tint them. `timberTint` colours the timber set.
 * @param {() => T} generate
 * @returns {T}
 * @template T
 */
export function withWorkshopSurfaceOverrides(surfaces, generate) {
  const previous = active;
  active = surfaces ?? null;
  try {
    return generate();
  } finally {
    active = previous;
  }
}

/** The override for one family (`timber`, `plaster`, `stone`, `roof`) or value (`timberTint`), or null. */
export function workshopSurfaceOverride(family) {
  return active?.[family] ?? null;
}
