import { cylinder } from '../ProceduralWorkshopGeometry.js';
import { clamp } from '../village/HouseDesign.js';
import { lathe, ring } from './PropParts.js';

const COURSES = 2;
const COURSE_HEIGHT = 0.28;

/**
 * A tiered market fountain: a coursed stone basin with a coping to sit on, a
 * turned pedestal rising from the water, an upper bowl and a finial. `width`
 * sets the basin's outer diameter.
 */
export function buildFountain(kit, recipe) {
  const radius = clamp(recipe.width / 2, 1.4, 2.6);
  const wall = 0.34;
  const mid = radius - wall / 2;
  for (let course = 0; course < COURSES; course += 1) {
    const count = Math.max(12, Math.round(Math.PI * 2 * mid / 0.6));
    const offset = course % 2 === 0 ? 0 : 0.5;
    for (let index = 0; index < count; index += 1) {
      const angle = Math.PI * 2 * (index + offset) / count;
      kit.stone({
        width: Math.PI * 2 * mid / count * 0.95,
        height: COURSE_HEIGHT * 0.94,
        depth: wall,
        position: [Math.cos(angle) * mid, COURSE_HEIGHT * (course + 0.5) - 0.05, Math.sin(angle) * mid],
        rotation: [0, Math.PI / 2 - angle, 0],
      }, { heightRatio: course / COURSES });
    }
  }
  const top = COURSE_HEIGHT * COURSES - 0.05;
  kit.add('stone', kit.shade(ring({ inner: radius - wall - 0.04, outer: radius + 0.08, height: 0.12, position: [0, top + 0.06, 0] }), 'stone', 1));
  // The water stands a hand below the coping.
  kit.add('recess', cylinder({ radius: radius - wall, height: 0.04, position: [0, top - 0.12, 0], sides: 28 }));

  const pedestal = lathe([[0.42, 0], [0.34, 0.12], [0.2, 0.3], [0.17, 1.1], [0.24, 1.25], [0.12, 1.32]], { sides: 14 });
  kit.add('stone', kit.shade(pedestal, 'stone', 0.6));
  const bowlY = 1.32;
  const bowl = lathe([[0.12, 0], [0.55, 0.08], [0.82, 0.22], [0.86, 0.3], [0.7, 0.3], [0.1, 0.16]], { sides: 18, position: [0, bowlY, 0] });
  kit.add('stone', kit.shade(bowl, 'stone', 0.85));
  kit.add('recess', cylinder({ radius: 0.66, height: 0.02, position: [0, bowlY + 0.25, 0], sides: 18 }));
  const finial = lathe([[0.1, 0], [0.13, 0.12], [0.06, 0.3], [0.09, 0.42], [0.001, 0.62]], { sides: 10, position: [0, bowlY + 0.22, 0] });
  kit.add('stone', kit.shade(finial, 'stone', 1));
}
