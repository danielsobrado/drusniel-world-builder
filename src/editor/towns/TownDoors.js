const OPEN_SPEED = Math.PI * 1.2;
const DEFAULT_REACH = 2.4;
const VERTICAL_REACH = 1.6;

/**
 * Doors you can open: find the nearest door to the walker, toggle it, swing it.
 *
 * A closed door is a collider; an opening door drops its collider at once (so
 * the walker is never shoved by a swinging leaf) and a closing door restores it
 * only when it is shut.
 */
export class TownDoorController {
  constructor({ streamer, collisionSource, reach = DEFAULT_REACH }) {
    this.streamer = streamer;
    this.collisionSource = collisionSource;
    this.reach = reach;
    this.focused = null;
  }

  /** Nearest door within reach of a canonical position, or null. */
  findNearest(position) {
    let best = null;
    for (const town of this.streamer.towns.values()) {
      const { anchor } = town.layout;
      town.layout.doors.forEach((door, index) => {
        const dx = anchor.x + door.centre[0] - position.x;
        const dz = anchor.z + door.centre[2] - position.z;
        const dy = door.centre[1] - 1 - position.y;
        const distance = Math.hypot(dx, dz);
        if (distance > this.reach || Math.abs(dy) > VERTICAL_REACH) return;
        if (!best || distance < best.distance) best = { town, index, distance };
      });
    }
    return best;
  }

  /** Re-target the focused door for a walker at `position` (canonical), or none. */
  focus(position) {
    this.focused = position ? this.findNearest(position) : null;
    return this.focused;
  }

  isOpen(target) {
    return target.town.doorTargets[target.index] > 0;
  }

  toggle(target = this.focused) {
    if (!target) return false;
    const { town, index } = target;
    const door = town.layout.doors[index];
    const opening = !this.isOpen(target);
    town.doorTargets[index] = opening ? door.openYaw : 0;
    if (opening) {
      this.collisionSource?.setBoxEnabled(this.streamer.ownerId(town.id), door.box, false);
    }
    return true;
  }

  update(deltaSeconds) {
    const step = OPEN_SPEED * Math.max(0, deltaSeconds);
    for (const town of this.streamer.towns.values()) {
      const { doorAngles, doorTargets } = town;
      for (let index = 0; index < doorAngles.length; index += 1) {
        const target = doorTargets[index];
        const angle = doorAngles[index];
        if (angle === target) continue;
        const next = angle < target ? Math.min(target, angle + step) : Math.max(target, angle - step);
        doorAngles[index] = next;
        town.mesh.setDoorAngle(index, next);
        if (next === 0 && target === 0) {
          const door = town.layout.doors[index];
          this.collisionSource?.setBoxEnabled(this.streamer.ownerId(town.id), door.box, true);
        }
      }
    }
  }
}
