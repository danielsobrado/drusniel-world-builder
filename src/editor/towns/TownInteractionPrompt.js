import { hudInteractionBus, parseLegacyPromptText } from '../player/hud/HudInteractionBus.js';
import './towns.css';

let nextPromptId = 1;

/**
 * "[E] Open door" / portal interaction prompt.
 * Publishes to the shared `hudInteractionBus` when `PlayerHud` is mounted,
 * and falls back to its local Drusniel-styled DOM card in standalone harnesses.
 */
export class TownInteractionPrompt {
  constructor(parent = document.body, { kind = 'door' } = {}) {
    this.sourceId = `town-prompt-${nextPromptId++}`;
    this.kind = kind;
    this.element = document.createElement('div');
    this.element.className = 'town-prompt';
    this.element.hidden = true;
    this.key = document.createElement('kbd');
    this.key.textContent = 'E';
    this.label = document.createElement('span');
    this.element.append(this.key, this.label);
    parent.append(this.element);
    this.text = '';
  }

  show(text, structured = null) {
    const signature = structured ? JSON.stringify(structured) : String(text ?? '');
    if (signature === this.text) return;
    this.text = signature;

    if (hudInteractionBus.hasConsumers) {
      this.element.hidden = true;
      if (!text && !structured) {
        hudInteractionBus.clear(this.sourceId);
        return;
      }
      const payload = structured ?? parseLegacyPromptText(text, this.kind);
      if (payload) hudInteractionBus.publish(this.sourceId, payload);
      else hudInteractionBus.clear(this.sourceId);
      return;
    }

    this.element.hidden = !text;
    this.label.textContent = text;
  }

  dispose() {
    hudInteractionBus.clear(this.sourceId);
    this.element.remove();
  }
}
