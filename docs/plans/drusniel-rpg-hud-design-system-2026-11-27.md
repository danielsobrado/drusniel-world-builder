# Drusniel Dark-Fantasy RPG UI/HUD Design System & Roadmap

Date: 2026-11-27  
Status: Active (Phases 1–8 in implementation; Phases 9–18 planned)

## 1. Grounded Audit of `main`

The existing player-mode HUD and world-map overlays in `main` were assembled across multiple feature drops and exhibit prototype visual drift:

| Symptom in `main` | Current Source in Repo | Resolution in Phases 1–8 |
|---|---|---|
| Excessive metallic brass gradients and marble textures | `src/editor/player/hud/hudTheme.css` (`--hud-brass`, `--hud-marble`), `hudVitals.css`, `hudCompass.css` | Replace with restrained Drusniel Obsidian (`#151B20`), Slate (`#303A40`), muted Antique Gold hairlines (`#B8A176`), and Parchment (`#E5DCC8`). |
| Desktop compass completely hidden (`display: none`) | `src/editor/player/hud/hudDesktopLayout.css` | Restore top-center Skyrim/KCD-inspired horizon compass in `'full'` and `'compass'` navigation modes. |
| Equal-weight vitals bars without clear hierarchy, labels, or status effects | `src/editor/player/hud/HudVitals.js`, `hudVitals.css`, `PlayerVitals.js` | Dominant Health bar (`Bloodstone #A34D49`), secondary Mana (`Arcane Blue #729BBC`) and Stamina (`#839A67`), contextual Boost Energy (`Mystic Violet #A08ABF`), event-driven XP strip, delayed damage trail, regeneration glow, optional numbers, and status-effect tiles. |
| Minimap dominated by flat saturated Azgaar biome polygons, thick double ring, and permanent `Hot Desert` badge | `src/editor/map/regionMapPainter.js`, `HudRegionMap.js`, `HudMinimap.js`, `hudMinimap.css` | Desaturated cartographic palette + cached NW hillshade & elevation contours, roads/trails/rivers/markers, 1px hairline ring, contextual region subtitle, 3 navigation modes (`full`, `compass`, `immersive`), and 3 zoom presets (`close`, `standard`, `wide`). |
| Scenic Tour button overlapping/crowding the right side | `src/editor/ui/NaturalGladeChrome.css` (`.scenic-tour-button`) | Move `.scenic-tour-button` to the top-left utility cluster beside `.view-mode-switcher`; hide all HUD and tour chrome during active Scenic Tour (`[data-scenic-tour="true"]`). |
| Hard-to-read school tabs (`Elements`, `Evocation`, `Mysteries`, `Tides`) and flat spell glyphs without inspection tooltips | `src/editor/spells/spell_menu.js`, `spell_menu.css`, `spell_icons.js`, `grimoire_icons.js` | Obsidian backing for school tabs, `[` / `]` + gamepad shoulder hints, custom 32×32 multi-layer dark-fantasy SVG icons, numeric cooldowns, insufficient-mana visual state, active ability readout, and BG3/Elden Ring inspection tooltip. |
| Permanent bottom-left location/scene debug text (`HIGHFIELD`) | `src/editor/player/hud/HudKeyHints.js`, `src/main.js` | Remove permanent bottom-left location debug text; introduce `LocationDiscoveryTracker` + `HudNotifications` for transient cinematic `NEW LOCATION DISCOVERED` banners and arrival cards. |
| Separate plain door/portal prompt and marbled NPC nameplate | `src/editor/towns/TownInteractionPrompt.js`, `src/editor/actors/ResidentNameplate.js`, `PlayerHud.js` | Shared `HudInteractionBus` + `HudInteractionPrompt` (`[E] Open` / `Talk` / `Enter`) + dynamic `HudReticle` (`explore`, `interact`, `cast`, `target`). |
| Full-viewport `backdrop-filter: blur` on world map overlay | `src/editor/map/worldMap.css` | Replace blur with solid obsidian-slate scrim (`rgb(12 16 19 / 84%)`) to protect WebGPU frame rate. |

---

## 2. Drusniel Design System

### Color Tokens (`config/ui-tokens.yaml` & `src/ui/design-system/tokens.js`)

- **Obsidian**: `#151B20` (primary panel surface, 72–88% opacity)
- **Slate**: `#303A40` (recessed wells, muted hairlines, dividers)
- **Antique Gold**: `#B8A176` (restraint-first accent, active borders, cardinal North, ornament rules)
- **Parchment**: `#E5DCC8` (primary headings, location titles, high-legibility labels)
- **Bloodstone**: `#A34D49` (health fill, combat target reticle, danger notices)
- **Arcane Blue**: `#729BBC` (mana fill, spell-casting state, insufficient-mana indicator)
- **Stamina**: `#839A67` (stamina fill, traversal/endurance cues)
- **Mystic Violet**: `#A08ABF` (exploration boost energy, arcane status effects)
- **Muted Silver**: `#A6ADB0` (secondary metadata, subtitles, distance readouts)

### Typography

- **Display / Headings & Locations**: `Cinzel` (`CinzelVariable.woff2`)
- **Lore / Narrative / Descriptions**: `Source Serif 4` (`SourceSerif4Variable.woff2`, `SourceSerif4Variable-Italic.woff2`)
- **Functional UI & Tabular Metrics**: `Inter` (`InterVariable.woff2`)

### Spatial, Border & Motion Rules

- **Screen edge margins**: `24–32 px` at 1080p (`clamp(24px, 2.5vw, 32px)`), scaled cleanly on ultrawide (`>= 21:9`) and mobile viewports.
- **Spacing scale**: `4, 8, 12, 16, 24, 32 px`.
- **Borders**: `1 px` hairlines (`rgb(184 161 118 / 32%)` or `rgb(166 173 176 / 22%)`), corner radius `2–6 px`.
- **Ability slots**: `50 px` base (`44–56 px` range, scaled by `--ds-hud-scale`).
- **Animation**: `120–240 ms` GPU-only (`transform`, `opacity`), respecting `.natural-reduced-motion`. Zero `backdrop-filter: blur` during gameplay.

---

## 3. Architecture Mapping

```text
config/ui-tokens.yaml                  Canonical design tokens spec
src/ui/design-system/
  ├── tokens.js                        Frozen JS token & enum exports (tested against YAML)
  ├── tokens.css                       CSS custom properties (--ds-*)
  ├── typography.css                   @font-face declarations & type role classes
  ├── components.css                   Shared keycap badges, ornament rules, card surfaces
  └── components.js                    DOM helpers (createKeycapBadge, createOrnamentRule)
src/editor/player/hud/
  ├── HudPreferences.js                Scale, nav mode, minimap zoom, labels, auto-hide
  ├── HudContextMode.js                Exploration / Combat / Immersive / Scenic Tour / Building
  ├── HudVitals.js                     Dominant Health, Mana, Stamina, Boost Energy, XP, Effects
  ├── HudCompass.js                    Horizon compass with landmarks & focus readout
  ├── HudMinimap.js                    Thin-ring dial, 3 zoom presets, transient region label
  ├── HudRegionMap.js                  Azgaar region window & zoom preset support
  ├── HudNotifications.js              Queued cinematic banners (location discovery, quests, XP)
  ├── LocationDiscoveryTracker.js      500ms-throttled site/settlement/region discovery detector
  ├── HudInteractionBus.js             Priority-resolved interaction publisher (portal > door > npc)
  ├── HudInteractionPrompt.js          Unified contextual prompt ([E] Open / Talk / Enter)
  ├── HudReticle.js                    Dynamic crosshair (explore / interact / cast / target)
  └── PlayerHud.js                     HUD orchestrator wired to context modes & frame updates
src/editor/spells/
  ├── spell_metadata.js                Metadata, mana %, range, targeting & descriptions
  ├── spell_tooltip.js / .css          Detailed spell inspection card & active slot readout
  ├── spell_icons.js                   32×32 illustrated elemental SVG icons
  └── grimoire/grimoire_icons.js       32×32 illustrated grimoire SVG icons
src/editor/map/
  └── regionMapPainter.js              Desaturated cartographic palette + cached NW hillshade
```

Editor/Simulator tooling (`src/editor/EditorUi.js`, `src/editor/ui/NaturalEditorUi.js`, `src/editor/ui/workspace/`) remains strictly decoupled from the player-facing RPG HUD.

---

## 4. 18-Phase Roadmap

| Phase | Scope | Priority | Status |
|---|---|---|---|
| 1 | Design tokens, typography & shared primitives | Critical | In Progress (Wave 1) |
| 2 | HUD positioning, ultrawide rails & responsive scaling | Critical | In Progress (Wave 1) |
| 3 | Health, mana, stamina, boost energy, XP & status effects | Critical | In Progress (Wave 1) |
| 4 | Ability hotbar, custom illustrated SVG icons & tooltips | Critical | In Progress (Wave 1) |
| 5 | Exploration compass & desaturated cartographic relief minimap | Critical | In Progress (Wave 1) |
| 6 | Context-sensitive HUD modes (Exploration, Combat, Immersive, Scenic Tour, Building) | High | In Progress (Wave 1) |
| 7 | Location discovery tracker & cinematic notifications | High | In Progress (Wave 1) |
| 8 | Shared contextual interaction prompts & dynamic crosshair | High | In Progress (Wave 1) |
| 9 | Combat damage indicators, enemy health plates & stagger/status polish | High | Planned (Wave 2) |
| 10 | Expanded tooltip comparison & ability quick-assign inspector | High | Planned (Wave 2) |
| 11 | Interactive Azgaar world map cartography & legend polish | High | Planned (Wave 2) |
| 12 | Inventory & equipment character screen unification | High | Planned (Wave 2) |
| 13 | Spellbook & progression screens | High | Planned (Wave 2) |
| 14 | Quest journal, bestiary & lore codex | Medium | Planned (Wave 3) |
| 15 | Cinematic main menu & transition polish | Medium | Planned (Wave 3) |
| 16 | Procedural UI audio cues & micro-transition polish | High | Planned (Wave 3) |
| 17 | Full gamepad prompt switching & accessibility presets | High | Planned (Wave 3) |
| 18 | Automated Playwright visual regression & HUD perf budget gates | Critical | Planned (Wave 3) |
