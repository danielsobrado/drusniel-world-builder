import { HUD_PHASE } from './hudState.js';

const VITALS = Object.freeze([
  { id: 'life', label: 'Health', primary: true },
  { id: 'mana', label: 'Mana', primary: false },
  { id: 'stamina', label: 'Stamina', primary: false },
  { id: 'energy', label: 'Stride', primary: false, contextual: true },
]);
const LOW_PERCENT = 25;
const XP_DISPLAY_MS = 3200;

const EFFECT_ICONS = Object.freeze({
  exhausted: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v4m0 0-2.5 2M8 6l2.5 2M4 13h8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`,
  boost: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 9.5 8 3l-1 4.5h6L8 13l1-3.5H3Z" fill="currentColor"/></svg>`,
  water: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 9c1.8-1.4 3.6-1.4 5.5 0s3.7 1.4 5.5 0M2.5 12.2c1.8-1.4 3.6-1.4 5.5 0s3.7 1.4 5.5 0" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`,
  arcane: `<svg viewBox="0 0 16 16" aria-hidden="true"><polygon points="8,1.5 13.5,8 8,14.5 2.5,8" stroke="currentColor" stroke-width="1.4" fill="none"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>`,
});

function createBarMarkup({ id, label }) {
  const row = document.createElement('div');
  row.className = `hud-vital-row hud-vital-row--${id}`;
  row.innerHTML = `
    <div class="hud-vital-meta">
      <span class="hud-vital-label">${label}</span>
      <span class="hud-vital-value">100%</span>
    </div>
    <div class="hud-vital hud-vital--${id}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" data-value="100">
      <div class="hud-vital__track">
        <span class="hud-vital__trail"></span>
        <span class="hud-vital__fill"></span>
        <span class="hud-vital__regen"></span>
      </div>
    </div>
  `;
  return {
    row,
    bar: row.querySelector('.hud-vital'),
    value: row.querySelector('.hud-vital-value'),
  };
}

/**
 * Drusniel resource cluster:
 *   - Dominant Health bar (Bloodstone)
 *   - Secondary Mana (Arcane Blue) and Stamina (Sage)
 *   - Contextual Boost Energy bar shown only while active or recharging
 *   - Transient Experience bar shown only when XP changes
 *   - Status-effect icon strip below the resource cluster
 */
export class HudVitals {
  constructor() {
    this.element = document.createElement('section');
    this.element.className = 'hud-vitals';
    this.element.setAttribute('aria-label', 'Player resources');
    this.element.hidden = true;

    this.bars = new Map();
    this.lastPercent = new Map();
    this.customEffects = new Map();
    this.builtinSignature = '';
    this.xpHideTimer = 0;

    for (const descriptor of VITALS) {
      const ui = createBarMarkup(descriptor);
      if (descriptor.contextual) ui.row.hidden = true;
      this.bars.set(descriptor.id, ui);
      this.lastPercent.set(descriptor.id, 100);
      this.element.append(ui.row);
    }

    this.xpRow = document.createElement('div');
    this.xpRow.className = 'hud-vital-xp';
    this.xpRow.hidden = true;
    this.xpRow.innerHTML = `
      <span class="hud-vital-xp__label"></span>
      <div class="hud-vital-xp__track"><span class="hud-vital-xp__fill"></span></div>
    `;
    this.xpLabel = this.xpRow.querySelector('.hud-vital-xp__label');
    this.xpFill = this.xpRow.querySelector('.hud-vital-xp__fill');

    this.effectsRow = document.createElement('div');
    this.effectsRow.className = 'hud-vitals__effects';
    this.effectsRow.hidden = true;

    this.element.append(this.xpRow, this.effectsRow);

    for (const { id } of VITALS) this.set(id, 1);
  }

  setShowNumbers(enabled) {
    this.element.dataset.showNumbers = enabled ? 'true' : 'false';
  }

  setResting(resting) {
    this.element.classList.toggle('is-resting', Boolean(resting));
  }

  /** @param {Record<string, number>} levels @param {{ regenerating?: Record<string, boolean>, spent?: Record<string, boolean> }} [meta] */
  show(levels, meta = {}) {
    for (const [id, level] of Object.entries(levels)) {
      this.set(id, level, Boolean(meta.regenerating?.[id]));
    }
    const energyRow = this.bars.get('energy')?.row;
    if (energyRow) {
      energyRow.hidden = (levels.energy ?? 1) >= 0.995;
    }
    this.syncBuiltinEffects({
      exhausted: Boolean(meta.spent?.stamina),
      boostLow: Boolean(meta.spent?.energy),
    });
  }

  showExperience(xp) {
    if (!xp || !(xp.lastGain > 0)) return;
    clearTimeout(this.xpHideTimer);
    this.xpRow.hidden = false;
    this.xpLabel.textContent = `Level ${xp.level} · +${Math.round(xp.lastGain)} XP`;
    this.xpFill.style.transform = `scaleX(${Math.min(1, Math.max(0, xp.progress)).toFixed(4)})`;
    this.xpHideTimer = setTimeout(() => {
      this.xpRow.hidden = true;
    }, XP_DISPLAY_MS);
  }

  syncBuiltinEffects({ exhausted = false, boostLow = false, waterState = 'dry' } = {}) {
    const next = [];
    if (exhausted) next.push({ id: 'exhausted', label: 'Exhausted', tone: 'warn', icon: 'exhausted' });
    if (boostLow) next.push({ id: 'stride', label: 'Winded', tone: 'arcane', icon: 'boost' });
    if (waterState && waterState !== 'dry') {
      next.push({
        id: 'water',
        label: waterState === 'swimming' ? 'Swimming' : 'Wading',
        tone: 'info',
        icon: 'water',
      });
    }
    const signature = next.map((e) => `${e.id}:${e.label}`).join('|');
    if (signature === this.builtinSignature) return;
    this.builtinSignature = signature;
    this.builtinEffects = next;
    this.renderEffects();
  }

  setEffect({ id, label, tone = 'info', icon = 'arcane' }) {
    this.customEffects.set(id, { id, label, tone, icon });
    this.renderEffects();
  }

  clearEffect(id) {
    if (this.customEffects.delete(id)) this.renderEffects();
  }

  hasActiveEffects() {
    return (this.builtinEffects?.length ?? 0) > 0 || this.customEffects.size > 0;
  }

  renderEffects() {
    const all = [...(this.builtinEffects ?? []), ...this.customEffects.values()];
    this.effectsRow.hidden = all.length === 0;
    if (all.length === 0) {
      this.effectsRow.replaceChildren();
      return;
    }
    const nodes = all.map((effect) => {
      const badge = document.createElement('div');
      badge.className = `hud-effect hud-effect--${effect.tone ?? 'info'}`;
      badge.title = effect.label;
      badge.setAttribute('aria-label', effect.label);
      badge.innerHTML = EFFECT_ICONS[effect.icon] ?? EFFECT_ICONS.arcane;
      return badge;
    });
    this.effectsRow.replaceChildren(...nodes);
  }

  render(phase) {
    this.element.hidden = phase !== HUD_PHASE.walking;
  }

  /** @param {'mana' | 'stamina' | 'life' | 'energy'} id @param {number} level 0..1 */
  set(id, level, regenerating = false) {
    const ui = this.bars.get(id);
    if (!ui) return;
    const clamped = Math.min(1, Math.max(0, level));
    const percent = Math.round(clamped * 100);
    const prev = this.lastPercent.get(id) ?? 100;
    this.lastPercent.set(id, percent);

    ui.bar.style.setProperty('--level-ratio', clamped.toFixed(4));
    ui.bar.setAttribute('aria-valuenow', String(percent));
    ui.bar.dataset.value = String(percent);
    ui.bar.classList.toggle('is-low', percent <= LOW_PERCENT);
    ui.bar.classList.toggle('is-healing', percent > prev);
    ui.bar.classList.toggle('is-regenerating', regenerating && percent < 100);
    ui.value.textContent = `${percent}%`;
  }

  dispose() {
    clearTimeout(this.xpHideTimer);
    this.element.remove();
  }
}
