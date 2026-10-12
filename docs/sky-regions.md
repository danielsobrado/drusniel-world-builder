# Regional skies

Each part of the map has its own air. `SkyLookController` resolves the sky in
this order:

time-of-day preset → **regional air** → weather overcast → snow country

Every stage is relative, so regional air works with any time of day and any
weather. A desert night stays night, and rain over a marsh is greyer still.

## Two scales

`stylized/sky/skyRegionClimate.js` samples the biome under the camera at two
scales.

| Scale | Where | Weight | Effect |
|---|---|---|---|
| Macro | rings at 3, 9 and 24 km, 8 directions each | 78 % | Sets the region's character. Skies differ a lot between distant parts of the map. |
| Local | centre plus rings at 120 and 400 m | 22 % | Nudges it. Crossing a field shifts the air slightly. |

Ground more than 600–1800 m above sea level blends into **alpine** air.

Two octaves of value noise add a per-area personality: haze, warmth and
cloudiness.

- The large octave has a 30 km wavelength. Two places with the same biome far
  apart still feel different.
- The small octave has a 1.5 km wavelength at a quarter of the amplitude, giving
  subtle variety nearby.

## Climates

`regionalSkyLook.js` maps Azgaar biomes to six climates plus temperate, the
identity.

| Climate | Biomes | Air |
|---|---|---|
| arid | hot and cold desert, savanna | dusty ochre horizon, warm haze, few clouds, harder sun |
| tropical | tropical forests, savanna | humid green haze, heavy cloud, saturated |
| wetland | wetland, temperate rainforest | low grey-green overcast, thick mist, weak sun |
| boreal | taiga, tundra, glacier | deep cold blue, thin wisps, crisp |
| coastal | sea and lakes | cyan horizon, breezy clouds, light sea haze |
| alpine | high ground | very deep zenith; clear when the country below is dry, misty when it is damp (see below) |

## Air character: mist, cloud form and snow

Biomes also give the air a **moisture** and **temperature**
(`skyRegionClimate.js`, `BIOME_AIR`), sampled with the same macro and local
rings. Height cools the air but keeps its moisture, so mountains above
rainforest are damp and mountains above desert are dry. Two more noise axes,
`mist` and `cloudForm`, vary places that share a climate.

`regionalSkyLook.js` (`airCharacter`, `applyRegionalCharacter`) turns these into
four values. Neutral air (moisture and temperature 0.5, zero personality)
changes nothing.

| Value | Driven by | Effect |
|---|---|---|
| `mist` 0..1 | damp air, `mist` noise | thicker distance haze (`fogDensityScale`, which also scales the aerial haze), a lower, softer cloud deck, a dimmer, more diffuse sun, and valley fog in the gorges (`main.js`) |
| cloud form −1..1 | `cloudForm` noise, warmth, damp | warm, damp air builds crisp, rounded cumulus (low `cloudSharpness`, `cloudDetail` below 1); cold or dry air draws soft, broken wisps |
| snow | cold, damp, mist | `snowBrightness` keeps snow below white so it still shows shape; cold, dry powder gets deep blue shade (`snowShade`, `snowBlue`); damp snow is duller and greyer; mist flattens the light |

The sky shader reads `cloudSharpness` and `cloudDetail` as uniforms, as do the
ground's cloud shadows. The snow values reach the terrain through
`snowLightUniforms` (`skyLight.js`).

Clouds use their own noise (`sky/cloudNoise.js`). The shared stylized hash
repeats every ten lattice cells, and that repetition drew the clouds as
diagonal streaks.

## Time of day

With `sky.cycle.enabled` (on by default) the clock blends the two time presets
the hour lies between (`SkyLookController.setTimeBlend`), so the sun and light
move continuously instead of stepping from preset to preset. Picking an
anchored preset in the Time menu moves the clock to its hour. Picking any other
preset pauses the clock on that look.

## Easing and jumps

- **Travel:** the controller eases the region at 0.08 per second, so a new
  country's air arrives over roughly 12 s of travel.
- **Jumps:** `SkyRegionSampler` resamples every 1.5 s. A move of more than
  1.5 km between samples, such as a teleport or a world load, is flagged as a
  jump, and the sky snaps to the new region at once.

## QA

- `node --test test/sky-region.test.js`
- In dev, `window.__editor.skyRegion.region` is the sampled region and
  `window.__editor.skyLooks.region` the eased one.
- On Eldara:
  - Felnesine is temperate.
  - Mugrord is boreal.
  - Grath'te is wetland, with fog around ×3.3.
  - Winchwark is a temperate–coastal mix.
