/**
 * Shared contextual interaction bus for doors, location portals, NPCs,
 * gatherables, and world objects. Resolves the highest-priority active prompt.
 */

const SOURCE_PRIORITY = Object.freeze({
  portal: 40,
  door: 30,
  gather: 20,
  object: 15,
  npc: 10,
});

function serialize(entry) {
  if (!entry) return '';
  return `${entry.sourceId}|${entry.kind}|${entry.target}|${entry.action}|${entry.key}|${entry.subtitle}|${entry.snippet}`;
}

export function parseLegacyPromptText(text, kind = 'object') {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return null;
  if (/^open door$/i.test(trimmed)) {
    return { target: 'Wooden door', action: 'Open', key: 'E', kind: 'door' };
  }
  if (/^close door$/i.test(trimmed)) {
    return { target: 'Wooden door', action: 'Close', key: 'E', kind: 'door' };
  }
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx > 0) {
    return {
      action: trimmed.slice(0, spaceIdx),
      target: trimmed.slice(spaceIdx + 1),
      key: 'E',
      kind,
    };
  }
  return { target: trimmed, action: 'Interact', key: 'E', kind };
}

class InteractionBus {
  constructor() {
    this.sources = new Map();
    this.listeners = new Set();
    this.lastSignature = '';
  }

  get hasConsumers() {
    return this.listeners.size > 0;
  }

  publish(sourceId, payload) {
    if (!payload || !payload.target) {
      this.clear(sourceId);
      return;
    }
    const kind = payload.kind ?? 'object';
    const next = Object.freeze({
      sourceId,
      kind,
      priority: payload.priority ?? SOURCE_PRIORITY[kind] ?? 10,
      target: String(payload.target),
      action: String(payload.action ?? ''),
      key: String(payload.key ?? 'E'),
      subtitle: String(payload.subtitle ?? ''),
      snippet: String(payload.snippet ?? ''),
      footnote: String(payload.footnote ?? ''),
    });
    this.sources.set(sourceId, next);
    this.emit();
  }

  clear(sourceId) {
    if (!this.sources.delete(sourceId)) return;
    this.emit();
  }

  current() {
    let best = null;
    for (const entry of this.sources.values()) {
      if (!best || entry.priority > best.priority) best = entry;
    }
    return best;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.current());
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit() {
    const active = this.current();
    const signature = serialize(active);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    for (const listener of this.listeners) listener(active);
  }

  reset() {
    this.sources.clear();
    this.lastSignature = '';
    for (const listener of this.listeners) listener(null);
  }
}

export const hudInteractionBus = new InteractionBus();
export { InteractionBus };
