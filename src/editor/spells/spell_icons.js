/**
 * Custom illustrated dark-fantasy spell glyphs on a 32x32 grid.
 * Consistent stroke weight, subtle arcane ring framing, and layered silhouette
 * classes (`glyph-aura`, `glyph-fill`, `glyph-light`, `glyph-line`, `glyph-shine`).
 */
const SPELL_GLYPHS = Object.freeze({
  fire: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="17" r="11.5"/>
    <path class="glyph-fill" d="M16 4c1.6 4.7 7.2 7.3 7.2 14a7.2 7.2 0 0 1-14.4 0c0-3.5 1.7-6 3.7-7.7.3 2.5 1.3 4 2.7 4.7-.7-4.1-.4-7.6.8-11Z"/>
    <path class="glyph-light" d="M16.4 16c1 1.7 3.1 2.7 3.1 5.1a3.4 3.4 0 0 1-6.8 0c0-1.8 1-3 2.3-3.9.2.9.5 1.5 1.1 1.8-.2-1.1 0-2 .3-3Z"/>
  </svg>`,
  water: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="17" r="11.5"/>
    <path class="glyph-fill" d="M16 4.5c4.8 5.8 7.6 10 7.6 14.2a7.6 7.6 0 0 1-15.2 0C8.4 14.5 11.2 10.3 16 4.5Z"/>
    <path class="glyph-shine" d="M12.2 18.6a4 4 0 0 0 3.6 4"/>
    <path class="glyph-line glyph-line--soft" d="M6.5 26.5c3-1.4 6-1.4 9.5 0s6.5 1.4 9.5 0"/>
  </svg>`,
  air: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="16" r="11.5"/>
    <path class="glyph-line" d="M5.5 12.2h13.2a3.6 3.6 0 1 0-3.6-3.6"/>
    <path class="glyph-line" d="M5.5 17.2h18a3.6 3.6 0 1 1-3.6 3.6"/>
    <path class="glyph-line glyph-line--soft" d="M6 22.2h8.2"/>
  </svg>`,
  earth: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <polygon class="glyph-aura" points="16,4 27,16 16,28 5,16"/>
    <path class="glyph-fill" d="M5.5 23.5 9.8 11.5l6.2-4.2 6.8 4 3.2 12-6.7 3.4h-7.8l-6-3.2Z"/>
    <path class="glyph-light" d="m9.8 11.5 6.2-4.2 6.8 4-6.7 5.5-6.3-5.3Z"/>
  </svg>`,
  lightning: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="16" cy="16" r="11.5"/>
    <path class="glyph-fill" d="M18.4 3.5 7.4 17.5h6.9l-2.2 10.8 12-15.2h-7.2l1.5-9.6Z"/>
    <path class="glyph-light" d="M18.4 3.5 7.4 17.5h4.1l6.9-14Z"/>
  </svg>`,
  fireball: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <circle class="glyph-aura" cx="19" cy="13" r="10"/>
    <path class="glyph-line glyph-line--soft" d="M12.5 17.2 5.2 24.5M14.8 20.1 9.6 25.3M10.2 14.3l-4.5 4.5"/>
    <circle class="glyph-fill" cx="19.2" cy="12.6" r="6.8"/>
    <circle class="glyph-light" cx="20.7" cy="11.1" r="2.7"/>
  </svg>`,
});

export function spellGlyph(spellId) {
  return SPELL_GLYPHS[spellId] ?? '';
}
