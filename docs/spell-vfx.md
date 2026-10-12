# Spell VFX (grimoire)

The grimoire spells — Fireball, Lightning Bolt, Thunderwave, Cone of Cold, Ice
Storm, Magic Missile, Shatter, Meteor Swarm, Acid Splash, Blight, Cure Wounds,
Fog Cloud, Stinking Cloud, Wall of Fire, Moonbeam, Sunbeam — are drawn by a
fully procedural stack in `src/editor/vfx`. Nothing is baked: every sprite
comes from one 512² atlas (64 px tiles) rasterised at startup in ~80 ms.

They live on the spell dock's **Evocation** and **Mysteries** pages next to the
original **Elements** page. `[` / `]` switch pages; `1`–`8` cast the slot on
the page shown.

## Layout

| Folder | Role |
|--------|------|
| `atlas/` | Tile painters (puffs, fire flipbook, flames, shapes, solids, decals) and eight colour ramps in row 7. `ParticleAtlasLayout.js` is the tile map. |
| `particles/` | `ParticleType` records and registry, the CPU simulator (struct-of-arrays, sub-emitters, terrain collision, turbulence) and the depth-sorted buffer writer. |
| `render/` | The single instanced particle material, the draped decal layer, the light pool and camera shake. |
| `effects/` | `EffectDirector` (timelines: `at`, `during`, `every`, `stream`, `burst`, `press`), emitter shapes, projectiles, lightning paths, grass presses. |
| `types/` | All particle types, by family. |
| `recipes/` | One cue sheet per spell. `fireballExplosion` is the reference explosion. |
| `audio/` | Procedural Web Audio cues routed through the game's audio bus. |

The dock and targeting live in `src/editor/spells/grimoire` (catalog, caster,
glyphs); `spell_runtime.js` owns the `VfxSystem`.

## Rules that keep it fast

- **One draw call for every particle.** The particle material is premultiplied
  (One, OneMinusSrcAlpha): `additive` → 0 alpha adds light, cooling toward 0
  occludes, so fire turns into smoke inside one sorted draw. Five vec4 instance
  streams plus position and uv — seven of WebGPU's eight vertex buffers.
- **No real scene lights by default.** One point light, even at intensity 0,
  put every lit material on the punctual-light path: −2–6 % FPS and twice the
  hitches on `qa:perf chunk-cross`. Effect lights are virtual: they light smoke
  and decals through uniforms, and each paints a tinted light pool just above
  grass height. `createVfxSystem({ sceneLights: 1 })` brings one real light back
  if a scene needs it. Never hide/show lights per cast — it recompiles the world.
- **No shadow-casting point lights** — the terrain is at the 16-sampler cap.
  The explosion's smoke column fakes its sun shadow with a soft decal.
- **No `viewport*Texture` nodes** — no soft particles, no heat haze. Smoke fades
  against the terrain heightfield on the CPU instead.
- Idle cost is two hidden meshes and ~0.03 ms of CPU. Meteor Swarm peaks at
  ~6.5 k particles and ~3.5 ms of simulation.

## Tuning notes

- Puffs are shaded as a medium (`shadeVolume`): normal-driven self-shadowing,
  hemisphere ambient (sky on top, ground beneath), crevice occlusion in dense
  cores, backlit scattering and a small per-puff warm/cool shift. Keep every
  lighting cue keyed to the normal or the whole cloud, never to one sprite's
  own edge — anything that lights a sprite's fringe differently from its middle
  draws a circle round every puff where they overlap.

- Puffs and flames (`billow`, on by default for smoke, fire, flame and cloud
  tiles) boil in the shader: animated noise warps their tile UVs more as they
  age, and late in life they erode into wisps, so smoke changes shape rather
  than scaling a fixed image. Per-particle seed and life fraction ride in the
  E stream; varyings are packed into vec4s because WebGPU allows only 16
  vertex outputs.

- Units are metres and seconds; emission is linear HDR and the bloom threshold
  is ~2. `lighting.emissionScale` scales every sprite's glow at once.
- Grass is ~0.5 m tall. Spells press it through the meadow interaction map
  (`MeadowInteractionMap.pressDisc`, wired as `pressGround`): `blastWave` blows
  it flat outward and lets it spring back, `holdFlat` keeps it down under a
  scorch, puddle, frost or rune for as long as the mark lasts, so ground decals
  read in a meadow too. The map covers 27 m round the player; further out, rings,
  light pools and bubbles sit at 0.35–0.6 m so they clear the grass.
- Lights within ~2 m of the caster wash the screen out: hand lights ramp in
  (`attack` ≥ 0.3 s), and self spells keep their light weak and in front.

## QA

`node --test test/vfx-*.test.js` bakes the atlas, validates every type and runs
every recipe to completion against the particle budget. For pictures,
`tmp/vfx-driver.mjs` boots a headed Chromium once and serves casts and
screenshots over HTTP (`/cast?spell=fireball&shots=0.5,1,2&yaw=0.4&dist=20`);
`tmp/vfx-batch.sh` turns runs into contact sheets.
