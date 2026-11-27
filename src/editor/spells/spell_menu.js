import { emitAudio } from '../_clod_shims/audio.js';
import { createKeycapBadge } from '../../ui/design-system/components.js';
import { grimoireGlyph } from './grimoire/grimoire_icons.js';
import { defaultSpellConfig } from './spell_config.js';
import { spellGlyph } from './spell_icons.js';
import { SpellTooltip } from './spell_tooltip.js';

const MISS_FLASH_MS = 280;
const CAST_LABEL_MS = 1400;
const PAGE_STORAGE_KEY = 'simcity-dnd.spell-dock.page';
const SPELL_BUTTONS = Object.freeze([
  { id: 'fire', key: 1, method: 'playFire' },
  { id: 'water', key: 2, method: 'playWater' },
  { id: 'air', key: 3, method: 'playAir' },
  { id: 'earth', key: 4, method: 'playEarth' },
  { id: 'lightning', key: 5, method: 'playLightning' },
  { id: 'fireball', key: 6, method: 'playFireball' },
]);

function resolveMenuRoot(rootId, suppliedRoot) {
  if (suppliedRoot) return { root: suppliedRoot, owned: false };
  const existing = document.getElementById(rootId);
  if (existing) return { root: existing, owned: false };
  const root = document.createElement('nav');
  root.id = rootId;
  document.body.appendChild(root);
  return { root, owned: true };
}

function stopUiPropagation(event) {
  event.stopPropagation();
}

function readStoredPage() {
  try {
    return window.localStorage.getItem(PAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storePage(pageId) {
  try {
    window.localStorage.setItem(PAGE_STORAGE_KEY, pageId);
  } catch {
    // Private windows keep the page for this session only.
  }
}

function createSpellButton({ id, key, label, glyph, onClick, onInspect, onBlur }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'spell-slot';
  button.dataset.spell = id;
  button.title = `${label} (${key})`;
  button.setAttribute('aria-label', `${label} spell, key ${key}`);
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = `
    <span class="spell-slot__glyph">${glyph}</span>
    <svg class="spell-slot__channel" viewBox="0 0 48 48" preserveAspectRatio="none" aria-hidden="true">
      <rect x="1" y="1" width="46" height="46" rx="3" pathLength="100"/>
    </svg>
    <span class="spell-slot__sweep"></span>
    <span class="spell-slot__cooldown" aria-hidden="true"></span>
    <span class="spell-slot__mana-pip" aria-hidden="true"></span>
    <kbd class="spell-slot__key">${key}</kbd>
    <span class="spell-slot__label"></span>
  `;
  // Labels come from spells YAML and the grimoire catalog, so they are set as text.
  button.querySelector('.spell-slot__label').textContent = label;
  button.addEventListener('click', onClick);
  button.addEventListener('pointerenter', onInspect);
  button.addEventListener('focus', onInspect);
  button.addEventListener('pointerleave', onBlur);
  button.addEventListener('blur', onBlur);
  return button;
}

function createGrip(title) {
  const grip = document.createElement('span');
  grip.className = 'spell-menu-grip';
  grip.title = `${title} — drag to move`;
  grip.setAttribute('aria-hidden', 'true');
  grip.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>';
  return grip;
}

/**
 * Feedback for a cast that started: the ring round the slot drains over the
 * cast, the cooldown readout counts down cleanly, and the selected ability
 * readout surfaces briefly.
 */
function playCastFeedback(button, durationMs) {
  const ring = button.querySelector('.spell-slot__channel rect');
  const label = button.querySelector('.spell-slot__label');
  const sweep = button.querySelector('.spell-slot__sweep');
  const cooldown = button.querySelector('.spell-slot__cooldown');
  button.castAnimations?.forEach((animation) => animation.cancel());
  button.castAnimations = [
    sweep?.animate?.(
      [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }],
      { duration: durationMs, easing: 'linear' },
    ),
    ring?.animate?.(
      [{ strokeDashoffset: 0 }, { strokeDashoffset: 100 }],
      { duration: durationMs, easing: 'linear' },
    ),
    label?.animate?.(
      [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }],
      { duration: CAST_LABEL_MS, easing: 'ease-out' },
    ),
  ].filter(Boolean);

  if (cooldown) {
    window.clearInterval(button.cooldownInterval);
    if (durationMs >= 1000) {
      const endAt = performance.now() + durationMs;
      const tick = () => {
        const remaining = (endAt - performance.now()) / 1000;
        if (remaining <= 0.05) {
          cooldown.textContent = '';
          window.clearInterval(button.cooldownInterval);
          button.cooldownInterval = 0;
          return;
        }
        cooldown.textContent = remaining >= 10 ? String(Math.ceil(remaining)) : remaining.toFixed(1);
      };
      tick();
      button.cooldownInterval = window.setInterval(tick, 100);
    } else {
      cooldown.textContent = '';
    }
  }
}

/**
 * The page of the six elemental spells, from spells YAML and the VFX
 * controller's play methods.
 */
function elementsPage(config, controller) {
  return {
    id: 'elements',
    title: 'Elements',
    spells: SPELL_BUTTONS.map((descriptor) => {
      const entry = config[descriptor.id];
      return {
        id: descriptor.id,
        label: entry.label,
        glyph: spellGlyph(descriptor.id),
        castDurationMs: entry.castDurationMs,
        audio: { event: `spell.${descriptor.id}.cast`, volume: entry.audio.volume },
        play: (durationMs) => {
          const play = controller[descriptor.method];
          return typeof play === 'function' && play(durationMs) !== false;
        },
      };
    }),
  };
}

/**
 * The spell dock: school tabs above a quiet spell row, dragged by its grip, paged
 * by tabs (or `[` and `]`). Casting from a slot and casting from the number
 * keys (`castSlot`) share one path, so both get the same ring, miss flash,
 * detailed tooltip, and cast sound.
 *
 * @param {object} deps
 * @param {object} [deps.config] spells YAML config
 * @param {object} [deps.controller] elemental play methods
 * @param {Array<{ id: string, title: string, spells: Array<{ id: string, label: string, castMs: number }> }>} [deps.extraPages]
 * @param {(spellId: string) => boolean} [deps.castExtra] casts a spell from an extra page
 * @param {(castMs: number) => boolean} [deps.canCast] whether the caster can pay for a cast
 * @param {(castMs: number, spellId?: string) => void} [deps.onCast] a cast started
 * @param {() => void} [deps.onActivity] hotbar interaction or school switch
 */
export function createSpellMenu(deps = {}) {
  const config = deps.config ?? defaultSpellConfig;
  const controller = deps.controller ?? {};
  const { root, owned } = resolveMenuRoot(config.menu.rootId, deps.root);
  const resetTimers = new Map();
  let missFlashTimer = 0;
  let readoutTimer = 0;
  let dragOffset = null;
  const tooltip = new SpellTooltip(document.body);

  const pages = [
    elementsPage(config, controller),
    ...(deps.extraPages ?? []).map((page) => ({
      id: page.id,
      title: page.title,
      spells: page.spells.map((spell) => ({
        id: spell.id,
        label: spell.label,
        glyph: grimoireGlyph(spell.id),
        castDurationMs: spell.castMs,
        audio: null,
        play: () => deps.castExtra?.(spell.id) === true,
      })),
    })),
  ];
  let activePage = Math.max(0, pages.findIndex((page) => page.id === readStoredPage()));

  root.replaceChildren();
  root.classList.add('spell-dock');
  root.dataset.captureUi = '';
  root.setAttribute('aria-label', 'Spell menu');

  const readout = document.createElement('div');
  readout.className = 'spell-menu-readout';
  readout.setAttribute('aria-live', 'polite');

  const tabsBar = document.createElement('div');
  tabsBar.className = 'spell-menu-tabs-bar';
  const prevKey = createKeycapBadge('[', { className: 'spell-menu-nav-key' });
  const nextKey = createKeycapBadge(']', { className: 'spell-menu-nav-key' });
  const grip = createGrip(config.menu.title);
  const tabs = document.createElement('div');
  tabs.className = 'spell-menu-tabs';
  tabs.setAttribute('role', 'tablist');
  tabsBar.append(prevKey, tabs, nextKey);

  const slots = document.createElement('div');
  slots.className = 'spell-menu-slots';
  const buttons = new Map();
  const pageSlots = [];
  const tabButtons = [];

  const updateReadout = (label, school, slotNumber) => {
    window.clearTimeout(readoutTimer);
    readout.textContent = `${label} · ${school} · Quick slot ${slotNumber}`;
    readout.classList.add('is-visible');
    readoutTimer = window.setTimeout(() => {
      readout.classList.remove('is-visible');
    }, 2400);
  };

  const flashMiss = (button) => {
    window.clearTimeout(missFlashTimer);
    for (const other of buttons.values()) other.classList.remove('spell-miss');
    button.classList.add('spell-miss');
    missFlashTimer = window.setTimeout(() => {
      button.classList.remove('spell-miss');
      missFlashTimer = 0;
    }, MISS_FLASH_MS);
  };

  const castSpell = (descriptor, pageTitle, slotNumber) => {
    const button = buttons.get(descriptor.slotKey);
    if (!button) return false;

    // A slot is on cooldown for as long as its sweep runs.
    if (button.getAttribute('aria-pressed') === 'true') {
      flashMiss(button);
      return false;
    }

    window.clearTimeout(resetTimers.get(descriptor.slotKey));
    const fired = typeof descriptor.play === 'function'
      && (deps.canCast?.(descriptor.castDurationMs) ?? true)
      && descriptor.play(descriptor.castDurationMs) !== false;
    if (!fired) {
      button.setAttribute('aria-pressed', 'false');
      flashMiss(button);
      return false;
    }

    deps.onCast?.(descriptor.castDurationMs, descriptor.id);
    deps.onActivity?.();
    button.setAttribute('aria-pressed', 'true');
    playCastFeedback(button, descriptor.castDurationMs);
    updateReadout(descriptor.label, pageTitle, slotNumber);
    if (descriptor.audio) {
      emitAudio(descriptor.audio.event, {
        volume: descriptor.audio.volume,
        durationMs: descriptor.castDurationMs,
      });
    }
    resetTimers.set(descriptor.slotKey, window.setTimeout(() => {
      button.setAttribute('aria-pressed', 'false');
      const cooldown = button.querySelector('.spell-slot__cooldown');
      if (cooldown) cooldown.textContent = '';
      window.clearInterval(button.cooldownInterval);
      resetTimers.delete(descriptor.slotKey);
    }, descriptor.castDurationMs));
    return true;
  };

  const showPage = (index) => {
    tooltip.hide();
    activePage = ((index % pages.length) + pages.length) % pages.length;
    pageSlots.forEach((group, pageIndex) => {
      group.hidden = pageIndex !== activePage;
    });
    tabButtons.forEach((tab, pageIndex) => {
      tab.setAttribute('aria-selected', pageIndex === activePage ? 'true' : 'false');
    });
    storePage(pages[activePage].id);
    deps.onActivity?.();
  };

  pages.forEach((page, pageIndex) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'spell-menu-tab';
    tab.setAttribute('role', 'tab');
    tab.title = `${page.title} ([ / ] to switch)`;
    tab.textContent = page.title;
    tab.addEventListener('click', () => showPage(pageIndex));
    tabButtons.push(tab);
    tabs.append(tab);

    const group = document.createElement('div');
    group.className = 'spell-menu-page';
    group.dataset.page = page.id;
    page.spells.forEach((descriptor, slotIndex) => {
      // Pages may share a spell id (Elements and Evocation both hold a fireball).
      descriptor.slotKey = `${page.id}:${descriptor.id}`;
      const slotNumber = slotIndex + 1;
      const button = createSpellButton({
        id: descriptor.id,
        key: slotNumber,
        label: descriptor.label,
        glyph: descriptor.glyph,
        onClick: () => castSpell(descriptor, page.title, slotNumber),
        onInspect: () => {
          const insufficientMana = button.getAttribute('aria-disabled') === 'true';
          const coolingDown = button.getAttribute('aria-pressed') === 'true';
          tooltip.show(button, descriptor, {
            school: page.title,
            slot: slotNumber,
            insufficientMana,
            coolingDown,
          });
          deps.onActivity?.();
        },
        onBlur: () => tooltip.hide(),
      });
      buttons.set(descriptor.slotKey, button);
      group.append(button);
    });
    pageSlots.push(group);
    slots.append(group);
  });
  showPage(activePage);

  root.append(readout, tabsBar, grip, slots);
  root.addEventListener('pointerdown', stopUiPropagation);
  root.addEventListener('click', stopUiPropagation);

  const onDragMove = (event) => {
    if (!dragOffset) return;
    const maximumLeft = Math.max(0, window.innerWidth - root.offsetWidth);
    const maximumTop = Math.max(0, window.innerHeight - root.offsetHeight);
    const left = Math.max(0, Math.min(maximumLeft, event.clientX - dragOffset.x));
    const top = Math.max(0, Math.min(maximumTop, event.clientY - dragOffset.y));
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
  };

  const onDragEnd = () => {
    dragOffset = null;
    root.classList.remove('dragging');
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
  };

  const onDragStart = (event) => {
    if (!(event.target instanceof HTMLElement) || !grip.contains(event.target)) return;
    event.preventDefault();
    const rect = root.getBoundingClientRect();
    dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.top}px`;
    root.style.transform = 'none';
    root.style.bottom = 'auto';
    root.style.right = 'auto';
    root.classList.add('dragging');
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  };

  grip.addEventListener('pointerdown', onDragStart);

  const findDescriptor = (spellId) => {
    for (const page of pages) {
      const idx = page.spells.findIndex(({ id }) => id === spellId);
      if (idx >= 0) return { descriptor: page.spells[idx], pageTitle: page.title, slot: idx + 1 };
    }
    return null;
  };

  return {
    cast: (spellId) => {
      const found = findDescriptor(spellId);
      return found ? castSpell(found.descriptor, found.pageTitle, found.slot) : false;
    },
    /** Casts slot `index` (0-based) of the page on show. */
    castSlot: (index) => {
      const page = pages[activePage];
      const descriptor = page.spells[index];
      return descriptor ? castSpell(descriptor, page.title, index + 1) : false;
    },
    hasSlot: (index) => Boolean(pages[activePage].spells[index]),
    /** Greys out the spells `deps.canCast` refuses; call when the resource changes. */
    syncAvailability: () => {
      for (const page of pages) {
        for (const { slotKey, castDurationMs } of page.spells) {
          buttons.get(slotKey).setAttribute('aria-disabled', String(!(deps.canCast?.(castDurationMs) ?? true)));
        }
      }
    },
    setResting: (resting) => {
      root.classList.toggle('spell-dock--resting', Boolean(resting));
      if (resting) tooltip.hide();
    },
    cyclePage: (delta) => showPage(activePage + delta),
    get activePageId() {
      return pages[activePage].id;
    },
    castFire: () => castSpell(pages[0].spells[0], pages[0].title, 1),
    castWater: () => castSpell(pages[0].spells[1], pages[0].title, 2),
    castAir: () => castSpell(pages[0].spells[2], pages[0].title, 3),
    castEarth: () => castSpell(pages[0].spells[3], pages[0].title, 4),
    castLightning: () => castSpell(pages[0].spells[4], pages[0].title, 5),
    castFireball: () => castSpell(pages[0].spells[5], pages[0].title, 6),
    dispose() {
      for (const timer of resetTimers.values()) window.clearTimeout(timer);
      resetTimers.clear();
      for (const button of buttons.values()) {
        window.clearInterval(button.cooldownInterval);
        button.castAnimations?.forEach((animation) => animation.cancel());
      }
      window.clearTimeout(missFlashTimer);
      window.clearTimeout(readoutTimer);
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onDragEnd);
      root.removeEventListener('pointerdown', stopUiPropagation);
      root.removeEventListener('click', stopUiPropagation);
      grip.removeEventListener('pointerdown', onDragStart);
      tooltip.dispose();
      if (owned) root.remove();
      else root.replaceChildren();
    },
  };
}
