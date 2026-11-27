/**
 * Custom illustrated dark-fantasy grimoire glyphs on the same 32x32 grid and
 * class vocabulary as spell_icons.js (`glyph-aura`, `glyph-fill`,
 * `glyph-light`, `glyph-line`, `glyph-shine`).
 */
const GRIMOIRE_GLYPHS = Object.freeze({
  tidalOrb: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="13" r="10"/>
    <path class="glyph-line glyph-line--soft" d="M4.5 25.5c2.8-1.6 5.5-1.6 8.2 0s5.5 1.6 8.2 0 5-1.6 6.6 0"/>
    <circle class="glyph-fill" cx="16" cy="13" r="7.2"/>
    <path class="glyph-light" d="M12.6 10.5a4.2 4.2 0 0 1 4.4-2.4"/>
  </svg>`,
  waterySphere: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="14" r="11"/>
    <path class="glyph-line glyph-line--soft" d="M5.5 26.5c3.4-1.4 7-1.4 10.5 0s7 1.4 10.5 0"/>
    <path class="glyph-fill" d="M16 4.6c4.6 0 7.8 3.2 7.2 7 2.3.8 3.1 3.6 1.3 5.2-1.8 1.6-4.4 1.2-5.4 2.6-1.6 1.8-4.6 1.8-6.2 0-1-1.4-3.6-1-5.4-2.6-1.8-1.6-1-4.4 1.3-5.2-.6-3.8 2.6-7 7.2-7Z"/>
    <path class="glyph-light" d="M12.8 8.8a3.8 3.8 0 0 1 4-1.5"/>
  </svg>`,
  rainCall: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="15" r="11.5"/>
    <path class="glyph-fill" d="M8.8 16a5 5 0 0 1 .5-9.8 6.8 6.8 0 0 1 13 1.8 4 4 0 0 1 .7 8Z"/>
    <path class="glyph-line" d="M10.5 20l-1.5 5M16 20l-1.5 6.2M21.5 20l-1.5 5"/>
  </svg>`,
  fireball: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="19" cy="13" r="10"/>
    <path class="glyph-line glyph-line--soft" d="M12.5 17.2 5.2 24.5M14.8 20.1 9.6 25.3M10.2 14.3l-4.5 4.5"/>
    <circle class="glyph-fill" cx="19.2" cy="12.6" r="6.8"/>
    <circle class="glyph-light" cx="20.7" cy="11.1" r="2.7"/>
  </svg>`,
  lightningBolt: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="16" r="11.5"/>
    <path class="glyph-fill" d="M18.4 3.5 7.4 17.5h6.9l-2.2 10.8 12-15.2h-7.2l1.5-9.6Z"/>
    <path class="glyph-light" d="M18.4 3.5 7.4 17.5h4.1l6.9-14Z"/>
  </svg>`,
  thunderwave: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="15" cy="16" r="11.5"/>
    <circle class="glyph-fill" cx="7" cy="16" r="3.1"/>
    <path class="glyph-line" d="M12.8 10.2a8.2 8.2 0 0 1 0 11.6"/>
    <path class="glyph-line" d="M18 7a12.8 12.8 0 0 1 0 18"/>
    <path class="glyph-line glyph-line--soft" d="M23.2 4.5a16.8 16.8 0 0 1 0 23"/>
  </svg>`,
  coneOfCold: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <polygon class="glyph-aura" points="5,16 27,6 27,26"/>
    <path class="glyph-fill" d="M4.5 16 26.5 6.5v19Z"/>
    <path class="glyph-shine" d="M18.5 11.5v9M14.5 13.7l8 4.6M14.5 18.3l8-4.6"/>
  </svg>`,
  iceStorm: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="15" r="11.5"/>
    <path class="glyph-fill" d="M8.8 16.5a5 5 0 0 1 .5-9.8 6.8 6.8 0 0 1 13 1.8 4 4 0 0 1 .7 8Z"/>
    <path class="glyph-line" d="m10.5 20.5-1.3 4.2M16 20.5l-1.3 6M21.5 20.5l-1.3 4.2"/>
  </svg>`,
  magicMissile: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="16" r="11"/>
    <path class="glyph-line" d="m5.5 8.5 6.5 3.8-6.5 3.8M13 12.5l6.5 3.8-6.5 3.8M20.5 16.5l6.5 3.8-6.5 3.8"/>
    <circle class="glyph-fill" cx="25.5" cy="7" r="2.5"/>
  </svg>`,
  shatter: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="16" r="11"/>
    <path class="glyph-fill" d="m16 3.5 2.6 8.2 8.4-2.5-5.5 6.8 6.2 5.9-8.4.4L16 28.5l-3.3-6.2-8.4-.4 6.2-5.9-5.5-6.8 8.4 2.5Z"/>
    <path class="glyph-light" d="m16 11 1.4 4.8-1.4 4.4-1.4-4.4Z"/>
  </svg>`,
  meteorSwarm: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="19" cy="19" r="9.5"/>
    <path class="glyph-line glyph-line--soft" d="M4.5 4.5 14 14M11 4l7.5 7.5M4 11l7.5 7.5"/>
    <circle class="glyph-fill" cx="20.2" cy="20.2" r="6.4"/>
    <circle class="glyph-light" cx="21.7" cy="18.7" r="2.4"/>
  </svg>`,
  acidSplash: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="15" r="11"/>
    <path class="glyph-fill" d="M16 4.2c3.9 4.6 6.2 8 6.2 11.2a6.2 6.2 0 0 1-12.4 0c0-3.2 2.3-6.6 6.2-11.2Z"/>
    <path class="glyph-line" d="M6.2 26.5h19.6M8.2 22.8l-2-1.8M23.8 22.8l2-1.8"/>
    <path class="glyph-shine" d="M13 16.2a3 3 0 0 0 2.6 2.8"/>
  </svg>`,
  blight: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="16" r="11.5"/>
    <path class="glyph-fill" d="M16 4.5a9.5 9.5 0 0 0-9.5 9.5c0 3.3 1.6 5.6 3.8 6.8V26h11.4v-5.2c2.2-1.2 3.8-3.5 3.8-6.8A9.5 9.5 0 0 0 16 4.5Z"/>
    <circle class="glyph-light" cx="12.2" cy="14" r="2.2"/>
    <circle class="glyph-light" cx="19.8" cy="14" r="2.2"/>
    <path class="glyph-shine" d="M13.8 22.5v2.6M18.2 22.5v2.6"/>
  </svg>`,
  cureWounds: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="16" r="11.5"/>
    <path class="glyph-fill" d="M16 26.5 6.2 17a5.9 5.9 0 0 1 8.4-8.4L16 10l1.4-1.4a5.9 5.9 0 0 1 8.4 8.4Z"/>
    <path class="glyph-shine" d="M16 12.6v7.8M12.1 16.5h7.8"/>
  </svg>`,
  fogCloud: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="15" r="11"/>
    <path class="glyph-fill" d="M8.2 18.5a4.6 4.6 0 0 1 .5-9.2 6.4 6.4 0 0 1 12.2 1.8 3.7 3.7 0 0 1 1.4 7.4Z"/>
    <path class="glyph-line glyph-line--soft" d="M5.5 23h14M10.5 26.8h15.5"/>
  </svg>`,
  stinkingCloud: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="15" r="11"/>
    <path class="glyph-fill" d="M8.2 19.5a4.6 4.6 0 0 1 .5-9.2 6.4 6.4 0 0 1 12.2 1.8 3.7 3.7 0 0 1 1.4 7.4Z"/>
    <circle class="glyph-fill" cx="9.2" cy="24.5" r="1.7"/>
    <circle class="glyph-fill" cx="16" cy="26.5" r="1.3"/>
    <circle class="glyph-fill" cx="22.4" cy="24" r="1.9"/>
  </svg>`,
  wallOfFire: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <polygon class="glyph-aura" points="3,25 16,6 29,25"/>
    <path class="glyph-fill" d="M7 26c-2.3 0-3.3-1.8-3.3-3.9 0-2.8 2-4.3 3.3-7.7 1 2.6 3.3 4.2 3.3 7.7 0 2.1-1 3.9-3.3 3.9Z"/>
    <path class="glyph-fill" d="M16 26c-3 0-4.2-2.2-4.2-4.9 0-3.8 2.6-5.9 4.2-10.5 1.3 3.6 4.2 5.6 4.2 10.5 0 2.7-1.3 4.9-4.2 4.9Z"/>
    <path class="glyph-fill" d="M25 26c-2.3 0-3.3-1.8-3.3-3.9 0-2.8 2-4.3 3.3-7.7 1 2.6 3.3 4.2 3.3 7.7 0 2.1-1 3.9-3.3 3.9Z"/>
    <path class="glyph-light" d="M16 24.8c-1.2 0-1.8-.8-1.8-2 0-1.4.9-2.3 1.8-3.8.6 1.3 1.8 2.3 1.8 3.8 0 1.2-.6 2-1.8 2Z"/>
  </svg>`,
  moonbeam: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="14" r="10.5"/>
    <path class="glyph-fill" d="M19.5 4a7.5 7.5 0 1 0 7 10.4A6 6 0 0 1 19.5 4Z"/>
    <path class="glyph-line glyph-line--soft" d="M11.5 17v10M16.5 19.5v7.5M6.5 19.5v7.5"/>
  </svg>`,
  sunbeam: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="10" cy="16" r="9.5"/>
    <circle class="glyph-fill" cx="9.5" cy="16" r="5"/>
    <path class="glyph-line" d="M16.5 16H28"/>
    <path class="glyph-line glyph-line--soft" d="M9.5 5v2.6M9.5 24.4V27M2.2 16h2M4.1 10.6l1.6 1.6M4.1 21.4l1.6-1.6"/>
    <circle class="glyph-light" cx="9.5" cy="16" r="2"/>
  </svg>`,
});

export function grimoireGlyph(spellId) {
  return GRIMOIRE_GLYPHS[spellId] ?? '';
}
