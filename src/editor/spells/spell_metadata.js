/**
 * Rich Drusniel spell metadata for tooltips, ability inspection, and active slot
 * readouts across Elements and Grimoire schools.
 */

const SPELL_METADATA = Object.freeze({
  fire: {
    name: 'Flame',
    targeting: 'Hand Stream',
    range: '5 m',
    description: 'Projects a roaring tongue of alchemical fire from the caster\'s palm, illuminating nearby stone and foliage.',
  },
  water: {
    name: 'Tide Surge',
    targeting: 'Hand Stream',
    range: '5 m',
    description: 'Channels a pressurized torrent of sea-cold water that dampens earth and extinguishes embers.',
  },
  air: {
    name: 'Gale Breath',
    targeting: 'Hand Stream',
    range: '6 m',
    description: 'Unleashes a focused draft of rushing wind, scattering dust and bending meadow grass along its path.',
  },
  earth: {
    name: 'Earthbreak',
    targeting: 'Terrain Sculpt',
    range: '10 m',
    description: 'Shatters and carves solid ground at the focal point, raising stone shards and leaving lasting terrain scars.',
  },
  lightning: {
    name: 'Arc Spark',
    targeting: 'Ray Strike',
    range: '24 m',
    description: 'Discharges a jagged bolt of skyfire instantaneously toward the targeted surface with sharp thunder.',
  },
  fireball: {
    name: 'Cinder Orb',
    targeting: 'Ballistic Arc',
    range: '45 m',
    description: 'Hurls an incandescent sphere along a gravity-bound arc that erupts in sparks upon impact.',
  },
  lightningBolt: {
    name: 'Lightning Bolt',
    targeting: 'Line Ray',
    range: '30 m',
    description: 'A blinding lance of forked lightning tears straight from hand to horizon.',
  },
  thunderwave: {
    name: 'Thunderwave',
    targeting: 'Self Shockwave',
    range: 'Self (8 m)',
    description: 'Emits a resonant concussive ring outward from the caster, flattening nearby grass and shaking the air.',
  },
  coneOfCold: {
    name: 'Cone of Cold',
    targeting: 'Frontal Cone',
    range: '18 m',
    description: 'Sweeps a fan of bitter rime and ice crystals across the ground, leaving frost-rimed terrain behind.',
  },
  iceStorm: {
    name: 'Ice Storm',
    targeting: 'Ground Tempest',
    range: '60 m',
    description: 'Summons jagged hail and sleet over a wide expanse, battering the earth in frozen fury.',
  },
  magicMissile: {
    name: 'Magic Missile',
    targeting: 'Volley',
    range: '36 m',
    description: 'Weaves three luminous darts of pure force that streak unerringly toward the targeted ground.',
  },
  shatter: {
    name: 'Shatter',
    targeting: 'Resonant Burst',
    range: '36 m',
    description: 'Detonates a discordant ring of force that cracks stone and sends shockwaves through the soil.',
  },
  meteorSwarm: {
    name: 'Meteor Swarm',
    targeting: 'Cataclysm',
    range: '120 m',
    description: 'Calls blazing celestial stones down from high altitude to scorch a distant battlefield.',
  },
  acidSplash: {
    name: 'Acid Splash',
    targeting: 'Ground Lob',
    range: '18 m',
    description: 'Flings a caustic globule that dissolves into hissing emerald mire on impact.',
  },
  blight: {
    name: 'Blight',
    targeting: 'Necrotic Drain',
    range: '30 m',
    description: 'Withers vitality in a targeted circle, turning living blades parched and ash-grey.',
  },
  cureWounds: {
    name: 'Cure Wounds',
    targeting: 'Self Restoration',
    range: 'Self',
    description: 'Draws pale golden restorative light around the caster, mending fatigue and soothing wounds.',
  },
  fogCloud: {
    name: 'Fog Cloud',
    targeting: 'Obscurement',
    range: '36 m',
    description: 'Conjures a dense bank of cool silver mist that hangs low across valleys and courtyards.',
  },
  stinkingCloud: {
    name: 'Stinking Cloud',
    targeting: 'Noxious Miasma',
    range: '27 m',
    description: 'Raises a billowing yellow-green miasma of bog fumes over the chosen point.',
  },
  wallOfFire: {
    name: 'Wall of Fire',
    targeting: 'Ground Barrier',
    range: '36 m',
    description: 'Ignites a towering curtain of roaring flames that scorches the earth beneath it.',
  },
  moonbeam: {
    name: 'Moonbeam',
    targeting: 'Celestial Pillar',
    range: '36 m',
    description: 'Bathes a narrow circle in pale lunar radiance descending silently from the heavens.',
  },
  sunbeam: {
    name: 'Sunbeam',
    targeting: 'Solar Ray',
    range: '18 m',
    description: 'Projects a searing beam of dawnlight from the caster\'s hand across the terrain.',
  },
  tidalOrb: {
    name: 'Tidal Orb',
    targeting: 'Hydro Sphere',
    range: '40 m',
    description: 'Forms a surging globe of brine and foam that crashes upon the targeted shore or meadow.',
  },
  rainCall: {
    name: 'Rain Call',
    targeting: 'Local Squall',
    range: '40 m',
    description: 'Gathers dark storm-vapour overhead to drench the ground in steady silver rain.',
  },
  waterySphere: {
    name: 'Watery Sphere',
    targeting: 'Containment',
    range: '30 m',
    description: 'Manifests a suspended vortex of swirling water hovering just above the earth.',
  },
});

const MANA_PER_CAST_MS = 1 / 10000;

export function getSpellMetadata(spellId, { school = 'Elements', slot = 1, label = '', castDurationMs = 1500 } = {}) {
  const entry = SPELL_METADATA[spellId] ?? {};
  const manaPercent = Math.max(1, Math.round(castDurationMs * MANA_PER_CAST_MS * 100));
  const castSeconds = (castDurationMs / 1000).toFixed(1).replace(/\.0$/, '');
  return {
    id: spellId,
    title: label || entry.name || spellId,
    school,
    slot,
    manaPercent,
    castSeconds: `${castSeconds}s`,
    targeting: entry.targeting ?? 'Targeted',
    range: entry.range ?? 'Medium',
    description: entry.description ?? 'Channels arcane essence into the world.',
  };
}
