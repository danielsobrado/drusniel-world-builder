import { createKeycapBadge, createOrnamentRule } from '../../ui/design-system/components.js';
import { getSpellMetadata } from './spell_metadata.js';

/**
 * Detailed BG3 / Elden Ring-inspired inspection tooltip for hovered or focused
 * spell slots, plus a compact active-ability readout line.
 */
export class SpellTooltip {
  constructor(parent = document.body) {
    this.element = document.createElement('aside');
    this.element.className = 'spell-tooltip ds-card';
    this.element.setAttribute('role', 'tooltip');
    this.element.hidden = true;

    this.header = document.createElement('div');
    this.header.className = 'spell-tooltip__header';
    this.titleEl = document.createElement('strong');
    this.titleEl.className = 'spell-tooltip__title';
    this.subtitleEl = document.createElement('span');
    this.subtitleEl.className = 'spell-tooltip__subtitle';
    this.header.append(this.titleEl, this.subtitleEl);

    this.stats = document.createElement('div');
    this.stats.className = 'spell-tooltip__stats';
    this.description = document.createElement('p');
    this.description.className = 'spell-tooltip__desc';

    this.footer = document.createElement('div');
    this.footer.className = 'spell-tooltip__footer';

    this.element.append(
      this.header,
      this.stats,
      createOrnamentRule({ className: 'spell-tooltip__rule' }),
      this.description,
      this.footer,
    );
    parent.append(this.element);
  }

  show(anchor, descriptor, { school, slot, insufficientMana = false, coolingDown = false } = {}) {
    if (!anchor || !descriptor) return;
    const meta = getSpellMetadata(descriptor.id, {
      school,
      slot,
      label: descriptor.label,
      castDurationMs: descriptor.castDurationMs,
    });
    this.titleEl.textContent = meta.title;
    this.subtitleEl.textContent = `${meta.school} · Slot ${meta.slot}`;
    this.description.textContent = meta.description;

    this.stats.replaceChildren(
      createStatPill('Mana', `${meta.manaPercent}%`, insufficientMana ? 'is-danger' : 'is-mana'),
      createStatPill('Cooldown', meta.castSeconds, coolingDown ? 'is-warn' : ''),
      createStatPill('Range', meta.range, ''),
    );

    this.footer.replaceChildren(
      createKeycapBadge(String(meta.slot)),
      createFooterText(insufficientMana ? 'Insufficient Mana' : coolingDown ? 'Recharging' : meta.targeting),
    );
    this.footer.classList.toggle('is-danger', insufficientMana);

    this.element.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const tipRect = this.element.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(window.innerWidth - tipRect.width - 12, rect.left + rect.width / 2 - tipRect.width / 2),
    );
    const top = Math.max(12, rect.top - tipRect.height - 14);
    this.element.style.left = `${Math.round(left)}px`;
    this.element.style.top = `${Math.round(top)}px`;
  }

  hide() {
    this.element.hidden = true;
  }

  dispose() {
    this.element.remove();
  }
}

function createStatPill(label, value, extraClass) {
  const pill = document.createElement('span');
  pill.className = `spell-tooltip__stat${extraClass ? ` ${extraClass}` : ''}`;
  const name = document.createElement('small');
  name.textContent = label;
  const val = document.createElement('strong');
  val.textContent = value;
  pill.append(name, val);
  return pill;
}

function createFooterText(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}
