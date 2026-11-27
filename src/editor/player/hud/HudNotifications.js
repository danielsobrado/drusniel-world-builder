import { createOrnamentRule } from '../../../ui/design-system/components.js';

const DEFAULT_DURATION_MS = 4200;
const QUIET_DURATION_MS = 2600;
const MAX_QUEUE = 4;

/**
 * Queued upper-center cinematic notification banner for location discoveries,
 * arrivals, quest updates, spell unlocks, XP gains, and world events.
 */
export class HudNotifications {
  constructor() {
    this.element = document.createElement('section');
    this.element.className = 'hud-notification';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.hidden = true;

    this.eyebrow = document.createElement('span');
    this.eyebrow.className = 'hud-notification__eyebrow';

    this.title = document.createElement('strong');
    this.title.className = 'hud-notification__title';

    this.rule = createOrnamentRule({ className: 'hud-notification__rule' });

    this.region = document.createElement('span');
    this.region.className = 'hud-notification__region';

    this.subtitle = document.createElement('span');
    this.subtitle.className = 'hud-notification__subtitle';

    this.element.append(this.eyebrow, this.title, this.rule, this.region, this.subtitle);

    this.queue = [];
    this.active = false;
    this.hideTimer = 0;
    this.exitTimer = 0;
  }

  /**
   * Queues a cinematic banner notification.
   * @param {{
   *   kind?: 'location-discovered' | 'location-entered' | 'quest-update' | 'spell-unlocked' | 'xp-gain' | 'world-event' | 'system',
   *   eyebrow?: string,
   *   title: string,
   *   region?: string,
   *   subtitle?: string,
   *   durationMs?: number,
   * }} payload
   */
  notify(payload) {
    if (!payload?.title) return;
    const entry = {
      kind: payload.kind ?? 'system',
      eyebrow: payload.eyebrow ?? '',
      title: String(payload.title),
      region: payload.region ?? '',
      subtitle: payload.subtitle ?? '',
      durationMs: payload.durationMs ?? (
        payload.kind === 'location-discovered' ? DEFAULT_DURATION_MS : QUIET_DURATION_MS
      ),
    };
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push(entry);
    if (!this.active) this.showNext();
  }

  showNext() {
    const next = this.queue.shift();
    if (!next) {
      this.active = false;
      this.element.hidden = true;
      return;
    }
    this.active = true;
    this.element.dataset.kind = next.kind;
    this.eyebrow.textContent = next.eyebrow;
    this.eyebrow.hidden = !next.eyebrow;
    this.title.textContent = next.title;
    this.rule.hidden = next.kind !== 'location-discovered' && !next.region && !next.subtitle;
    this.region.textContent = next.region;
    this.region.hidden = !next.region;
    this.subtitle.textContent = next.subtitle;
    this.subtitle.hidden = !next.subtitle;

    this.element.classList.remove('is-leaving');
    this.element.hidden = false;

    clearTimeout(this.hideTimer);
    clearTimeout(this.exitTimer);
    this.hideTimer = setTimeout(() => {
      this.element.classList.add('is-leaving');
      this.exitTimer = setTimeout(() => {
        this.showNext();
      }, 240);
    }, next.durationMs);
  }

  clear() {
    clearTimeout(this.hideTimer);
    clearTimeout(this.exitTimer);
    this.queue.length = 0;
    this.active = false;
    this.element.hidden = true;
    this.element.classList.remove('is-leaving');
  }

  dispose() {
    this.clear();
    this.element.remove();
  }
}
