/**
 * Resolves crosshair state priority: cast > target > interact > explore.
 */
export function resolveReticleState({ casting = false, targeting = false, interacting = false } = {}) {
  if (casting) return 'cast';
  if (targeting) return 'target';
  if (interacting) return 'interact';
  return 'explore';
}

/**
 * Dynamic context-sensitive crosshair morphing smoothly between exploration dot,
 * antique-gold interaction diamond, arcane casting ring, and Bloodstone target
 * chevrons.
 */
export class HudReticle {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'hud-reticle';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.dataset.state = 'explore';
    this.element.hidden = true;
    this.element.innerHTML = `
      <span class="hud-reticle__dot"></span>
      <span class="hud-reticle__diamond"></span>
      <span class="hud-reticle__cast"></span>
      <span class="hud-reticle__target"><i></i><i></i><i></i><i></i></span>
    `;
    this.state = 'explore';
    this.visible = false;
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    this.element.hidden = !this.visible;
  }

  setContext(context) {
    const next = resolveReticleState(context);
    if (next === this.state) return;
    this.state = next;
    this.element.dataset.state = next;
  }

  dispose() {
    this.element.remove();
  }
}
