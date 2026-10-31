import { hudIcon } from './hudIcons.js';
import { HUD_PHASE } from './hudState.js';

/** Mana is the primary resource: it owns the large diamond and the tall bar. */
const VITALS = Object.freeze([
  { id: 'mana', label: 'Mana' },
  { id: 'stamina', label: 'Stamina' },
  { id: 'life', label: 'Life' },
  { id: 'energy', label: 'Energy' },
]);

/**
 * The vitals cluster on the left of the walking HUD: mana as a tall bar over a
 * diamond of four resource gems, each filling from the bottom.
 *
 * shortcut: nothing in the game tracks these yet, so they sit full; call `set`
 * from the system that introduces them.
 */
export class HudVitals {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'hud-vitals';
    this.element.hidden = true;
    this.bar = document.createElement('div');
    this.bar.className = 'hud-vitals__bar';
    this.bar.append(document.createElement('i'));
    this.element.append(this.bar);

    this.gems = new Map(VITALS.map(({ id, label }) => {
      const gem = document.createElement('div');
      gem.className = `hud-vital hud-vital--${id}`;
      gem.setAttribute('role', 'meter');
      gem.setAttribute('aria-label', label);
      gem.setAttribute('aria-valuemin', '0');
      gem.setAttribute('aria-valuemax', '100');
      gem.innerHTML = `<i></i>${hudIcon(id)}`;
      this.element.append(gem);
      return [id, gem];
    }));
    for (const { id } of VITALS) this.set(id, 1);
  }

  render(phase) {
    this.element.hidden = phase !== HUD_PHASE.walking;
  }

  /** @param {'mana' | 'stamina' | 'life' | 'energy'} id @param {number} level 0..1 */
  set(id, level) {
    const percent = Math.round(Math.min(1, Math.max(0, level)) * 100);
    const gem = this.gems.get(id);
    gem.style.setProperty('--level', `${percent}%`);
    gem.setAttribute('aria-valuenow', String(percent));
    if (id === 'mana') this.bar.style.setProperty('--level', `${percent}%`);
  }

  dispose() {
    this.element.remove();
  }
}
