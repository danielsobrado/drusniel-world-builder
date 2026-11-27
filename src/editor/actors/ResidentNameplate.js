import { hudInteractionBus } from '../player/hud/HudInteractionBus.js';

const MEMORY_KEY = 'drusniel.worldSim.met.v1';

/**
 * Who the player has met among the World Simulator's people: a runtime memory kept in
 * the browser, keyed by the simulator's person id, so it survives reloads and new
 * exports of the same scenario. Storage can be unavailable (private mode); then it lasts
 * the session.
 */
export class ResidentMemory {
  constructor(storage = globalThis.localStorage ?? null) {
    this.storage = storage;
    try { this.met = JSON.parse(storage?.getItem(MEMORY_KEY) ?? '{}') ?? {}; } catch { this.met = {}; }
  }
  get(personId) { return this.met[personId] ?? null; }
  /** Records a meeting; returns how it stood before (null at a first meeting). */
  remember(personId, when = new Date().toISOString()) {
    const before = this.met[personId] ?? null;
    this.met[personId] = { first: before?.first ?? when, last: when, times: (before?.times ?? 0) + 1 };
    try { this.storage?.setItem(MEMORY_KEY, JSON.stringify(this.met)); } catch { /* kept for the session */ }
    return before;
  }
}

function line(text, limit = 150) {
  if (!text) return '';
  const first = text.split(/(?<=[.!?])\s/)[0];
  return first.length > limit ? `${first.slice(0, limit - 1)}…` : first;
}

/**
 * The name of the named resident the player stands beside, with their trade and one
 * line: their own introduction at a first meeting, what is on their mind afterwards.
 * Publishes into the shared `hudInteractionBus` when `PlayerHud` is active.
 */
export class ResidentNameplate {
  constructor({ parent, settings, memory = new ResidentMemory() }) {
    Object.assign(this, { settings, memory });
    this.sourceId = 'resident-nameplate';
    this.element = document.createElement('div');
    this.element.className = 'hud-nearby';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.hidden = true;
    parent?.append(this.element);
    this.current = null;
  }
  nearest(entries, focus) {
    let best = null, bestDistance = this.settings.nameplateMeters;
    for (const entry of entries) {
      if (!entry.record.person) continue;
      const distance = Math.hypot(entry.x - focus.x, entry.z - focus.z);
      if (distance < bestDistance) { best = entry; bestDistance = distance; }
    }
    return best;
  }
  update(entries, focus) {
    const entry = focus ? this.nearest(entries, focus) : null;
    const id = entry?.record.id ?? null;
    if (id === this.current) return;
    this.current = id;
    if (!entry) {
      hudInteractionBus.clear(this.sourceId);
      this.element.hidden = true;
      this.element.replaceChildren();
      return;
    }
    const person = entry.record.person;
    const before = this.memory.remember(id);
    const subtitle = [entry.record.professionTitle, person.workplace].filter(Boolean).join(' · ');
    const snippet = before ? line(person.hooks?.[0]) || `Seems ${person.mood}.` : line(person.introduction);
    const footnote = before ? `Met ${before.times + 1} times` : 'First meeting';

    if (hudInteractionBus.hasConsumers) {
      this.element.hidden = true;
      hudInteractionBus.publish(this.sourceId, {
        kind: 'npc',
        target: person.name,
        subtitle,
        snippet,
        footnote,
      });
      return;
    }

    const name = document.createElement('strong');
    name.textContent = person.name;
    const trade = document.createElement('span');
    trade.className = 'hud-nearby__trade';
    trade.textContent = subtitle;
    const said = document.createElement('p');
    said.textContent = snippet;
    const memory = document.createElement('small');
    memory.textContent = footnote;
    this.element.replaceChildren(name, trade, said, memory);
    this.element.hidden = false;
  }
  dispose() {
    hudInteractionBus.clear(this.sourceId);
    this.element.remove();
  }
}
