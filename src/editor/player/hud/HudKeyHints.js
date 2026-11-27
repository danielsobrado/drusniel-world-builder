import { HUD_PHASE } from './hudState.js';

/** How long the controls stay up once the player has taken the mouse. */
const REST_AFTER_MS = 6000;

function hintColumns({ canToggleCamera, canBoost }) {
  return [
    { key: 'WASD', label: 'Move' },
    { key: 'Shift', label: 'Run' },
    canBoost ? { key: 'Shift ×2', label: 'Stride' } : null,
    canToggleCamera ? { key: 'V', label: 'Camera' } : null,
    { key: 'I', label: 'Bag' },
    { key: 'M', label: 'Map' },
    { key: 'N', label: 'Compass' },
    { key: 'H', label: 'Hotbar' },
    { key: 'Esc', label: 'Pause' },
  ].filter(Boolean);
}

/**
 * Quiet bottom-left control legend shown briefly when entering exploration mode
 * and faded out cleanly once the player takes control. Location names now live
 * in the cinematic discovery banner instead of a permanent debug label here.
 */
export class HudKeyHints {
  constructor({ canToggleCamera = false, canBoost = false } = {}) {
    this.element = document.createElement('section');
    this.element.className = 'hud-legend';
    this.element.hidden = true;
    this.element.innerHTML = `<dl class="hud-keys" aria-label="Controls"></dl>`;
    this.keys = this.element.querySelector('.hud-keys');
    for (const column of hintColumns({ canToggleCamera, canBoost })) {
      const cell = document.createElement('div');
      const key = document.createElement('dt');
      key.textContent = column.key;
      const label = document.createElement('dd');
      label.textContent = column.label;
      cell.append(key, label);
      this.keys.append(cell);
    }
    this.engaged = null;
    this.restTimer = 0;
    this.allowed = true;
  }

  setAllowed(allowed) {
    this.allowed = Boolean(allowed);
    if (!this.allowed) this.element.hidden = true;
  }

  render(phase, { engaged }) {
    const visible = phase === HUD_PHASE.walking && this.allowed;
    this.element.hidden = !visible;
    if (!visible) {
      this.engaged = null;
      this.wake();
      return;
    }
    if (engaged === this.engaged) return;
    this.engaged = engaged;
    this.wake();
    if (engaged) {
      this.restTimer = setTimeout(() => this.keys.classList.add('is-resting'), REST_AFTER_MS);
    }
  }

  wake() {
    clearTimeout(this.restTimer);
    this.restTimer = 0;
    this.keys.classList.remove('is-resting');
  }

  dispose() {
    clearTimeout(this.restTimer);
    this.element.remove();
  }
}
