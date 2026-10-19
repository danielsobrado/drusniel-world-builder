# Lore authority and Astalor ↔ Eldara crosswalk

This document prevents **narrative geography** (the Astalor setting on drusniel.com) from being silently conflated with **map/import geography** (Azgaar map `Eldara`). A playable imported map may implement these places, but the names are not automatically interchangeable.

## Authority hierarchy

1. **Published narrative lore:** https://www.drusniel.com/ and specific nation articles below; canonical **names, themes, broad relationships**, not technical cell IDs.
2. **Game's authored canonical cultural definitions:** `config/cultures.yaml`, including material, form, economy, rites, and ancestry/culture/polity separations.
3. **Eldara map data:** `maps/Eldara Full 2026-07-23-20-37.json` and `docs/reference/eldara-local-cultures-populations.md`. Owns state/province/burg/cell positions and source culture mapping, NOT fantasy-world lore claims.
4. **New visual briefs here:** concrete asset proposals consistent with 1–3, but **not canon** until approved.

## Realm mapping

| Published lore realm | Current game state / mapping | People or canonical culture | Mapping confidence | Important distinction |
|---|---|---|---|---|
| Lumeshirean Divine Empire | `Lumeshire` | `lumish`, plus `zuraldarr` in eastern highlands | direct name, cultural branch explicit | Imperial capital must differ from Zuraldi autonomous mountain village |
| Contian Theocracy | `Contia` | `contian`; small Elenori presence | direct thematic match, name abbreviation | Mage academy ≠ ordinary industrial or border settlement |
| Empire of Frostgard | `Frostgard` | `norths`; Jotunn communities as locally appropriate | direct | Coast, inland and giant-border sub-branches differ |
| Mountain Kingdom of Stonehold | `Ironpeak` state, `vondari` people | `vondari` | **working crosswalk only: verify place-name equivalence** | Stonehold is public lore; Ironpeak is map-state label; keep both fields |
| Kingdom of Elenoria | `Elenoria` | `elenori` | direct | Deep forest core differs from border envoys |
| Grukmar Tribes | `Grukmar` | `orc-peoples`, `goblin-peoples`, `rakhnid-broods`, some Jotunn | direct realm, multi-peoples | No single 'orc city' template for all of Grukmar |
| Umbra'kor Dominion | `Umbra'kor` | `umbra-kori`, Elenori enclaves | direct | Cavern depth and political house control vary |
| Wyrmreach Dominion | `Wyrmreach` | regional Orc, Goblin, Jotunn, Serpent, Rakhnid seeds; rare Draconic remnant; others | direct name; **architectural detail uncertain** | Published lore intentionally mysterious: don't invent settled capital style as fact |

### Published site sources

- Overall: https://www.drusniel.com/the-regions-of-astalor/
- Lumeshire: https://www.drusniel.com/the-resilient-defense-of-the-lumeshirean-divine-empire/
- Zuraldi: https://www.drusniel.com/the-zuraldarr/
- Contian: https://www.drusniel.com/the-contian-theocracys-quest-for-magical-supremacy/
- Frostgard: https://www.drusniel.com/ice-and-iron-the-warriors-of-the-empire-of-frostgard/
- Stonehold: https://www.drusniel.com/forge-and-fire-the-mountain-kingdom-of-stoneholds-stand-against-chaos/
- Elenoria: https://www.drusniel.com/eternal-woods-the-kingdom-of-elenorias-dance-with-nature/
- Grukmar: https://www.drusniel.com/the-unruly-might-of-the-grukmar-tribes/
- Umbra'kor: https://www.drusniel.com/the-umbrakor-dominions-pact-with-darkness/
- Wyrmreach: https://www.drusniel.com/the-mysteries-of-the-wyrmreach-dominion/

## Rules for conflict resolution

- Save *both* `loreRealmKey` and `azgaarStateId`; never overwrite the map state name just to display Stonehold. Display alias resolution should be an explicitly reviewed mapping.
- Distinguish `ancestry` (person), `culture` (social practices), `polity` (ruler), `faith` (religion), and `architectureFamily` (asset/art system). Any race can live in many cultures.
- Region style = local culture × landscape × economy/role × wealth × settlement scale × regime/history. `polity` only affects banners, officials, law and civic monumental assets where applicable.
- Map roles use actual water/road/elevation/biome data. No harbor in a landlocked burg; no open sky above an underground residence.
- External religion/ancestry claims do not override a site's ambiguity; put details under `proposal` pending approval.
