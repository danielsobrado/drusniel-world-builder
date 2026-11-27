import { createKeycapBadge } from '../../../ui/design-system/components.js';

/**
 * Unified Witcher 3 / KCD-inspired contextual interaction card for doors,
 * portals, gatherables, and nearby named residents.
 */
export class HudInteractionPrompt {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'hud-interaction';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.hidden = true;

    this.head = document.createElement('div');
    this.head.className = 'hud-interaction__head';

    this.title = document.createElement('strong');
    this.title.className = 'hud-interaction__title';

    this.subtitle = document.createElement('span');
    this.subtitle.className = 'hud-interaction__subtitle';

    this.head.append(this.title, this.subtitle);

    this.actionRow = document.createElement('div');
    this.actionRow.className = 'hud-interaction__action';

    this.snippet = document.createElement('p');
    this.snippet.className = 'hud-interaction__snippet';

    this.footnote = document.createElement('small');
    this.footnote.className = 'hud-interaction__footnote';

    this.element.append(this.head, this.actionRow, this.snippet, this.footnote);
    this.allowed = true;
    this.current = null;
  }

  setAllowed(allowed) {
    this.allowed = Boolean(allowed);
    this.syncVisibility();
  }

  show(entry) {
    this.current = entry ?? null;
    if (!entry) {
      this.element.hidden = true;
      return;
    }
    this.element.dataset.kind = entry.kind ?? 'object';
    this.title.textContent = entry.target;
    this.subtitle.textContent = entry.subtitle ?? '';
    this.subtitle.hidden = !entry.subtitle;

    if (entry.action) {
      const badge = createKeycapBadge(entry.key || 'E');
      const verb = document.createElement('span');
      verb.textContent = entry.action;
      this.actionRow.replaceChildren(badge, verb);
      this.actionRow.hidden = false;
    } else {
      this.actionRow.replaceChildren();
      this.actionRow.hidden = true;
    }

    this.snippet.textContent = entry.snippet ?? '';
    this.snippet.hidden = !entry.snippet;
    this.footnote.textContent = entry.footnote ?? '';
    this.footnote.hidden = !entry.footnote;
    this.syncVisibility();
  }

  syncVisibility() {
    this.element.hidden = !this.allowed || !this.current;
  }

  dispose() {
    this.element.remove();
  }
}
