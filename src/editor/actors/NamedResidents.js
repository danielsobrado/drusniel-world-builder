/**
 * The World Simulator's named people as a settlement's walking residents. Each keeps the
 * simulator's id, so the same person is the same walker every visit, and stands where
 * their life is: a caravan master at the market stalls, an innkeeper at the tavern door,
 * a farmhand out along the main street, the retired on a bench. Their route runs from
 * there to another gathering place, so they cross the town's streets rather than circle
 * one spot. Children are left out until there is a child model.
 */

const DOOR_FOR = Object.freeze({ innkeeper: 'tavern', smith: 'smithy', baker: 'bakery', cleric: 'chapel' });

/** Spot kinds a person is found at, most fitting first. */
export function preferredSpots(person) {
  const kinds = [];
  if (DOOR_FOR[person.profession]) kinds.push(DOOR_FOR[person.profession]);
  const sector = person.workplace?.sector;
  if (person.role === 'trader' || sector === 'trade') kinds.push('stall', 'square');
  else if (sector === 'crafts' || sector === 'services') kinds.push('shop', 'stall');
  else if (sector === 'agriculture' || sector === 'extraction') kinds.push('street');
  else if (sector === 'security') kinds.push('street', 'square');
  if (person.role === 'retired') kinds.push('bench', 'square');
  if (person.role === 'unemployed') kinds.push('square', 'bench', 'street');
  kinds.push('square', 'street');
  return kinds;
}

function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function title(text) {
  return text ? text.replace(/(^|\s)\S/g, letter => letter.toUpperCase()) : 'Town Resident';
}

/** Up to `count` walkers from the settlement's export document; `spots` come from SettlementGathering. */
export function namedResidents(settlement, document, { count, spots, settings, centre }) {
  const people = document.residents.filter(person => person.role !== 'child').slice(0, count);
  const used = new Map();
  const take = kinds => {
    for (const kind of kinds) {
      const index = spots.findIndex((spot, i) => spot.kind === kind && !used.has(i));
      if (index >= 0) return index;
    }
    if (!spots.length) return -1;
    let best = 0;                                   // every fitting spot is taken: share the least used one
    for (let i = 1; i < spots.length; i++) if ((used.get(i) ?? 0) < (used.get(best) ?? 0)) best = i;
    return best;
  };
  let guard = settlement.capital;
  return people.map(person => {
    const seed = hashString(person.id);
    const index = take(preferredSpots(person));
    const lap = index >= 0 ? used.get(index) ?? 0 : 0;
    if (index >= 0) used.set(index, lap + 1);
    const angle = seed / 0xffffffff * Math.PI * 2;
    const home = index >= 0 ? spots[index] : centre;
    const x = home.x + Math.cos(angle) * lap * 1.4, z = home.z + Math.sin(angle) * lap * 1.4;
    const other = spots.find(spot => spot.kind !== home.kind && (spot.kind === 'square' || spot.kind === 'street'));
    const paladin = guard && person.workplace?.sector === 'security';
    if (paladin) guard = false;                    // a capital's first guard wears the radiant armour, as before
    return {
      id: person.id, settlementId: settlement.id, kind: paladin ? 'paladin' : 'villager',
      profession: person.profession ?? person.role, professionTitle: title(person.profession ?? person.role), role: person.role,
      x, z, wander: settings.wanderRadius, seed,
      route: other ? [{ x, z }, { x: other.x, z: other.z }] : null,
      person: {
        name: `${person.name} ${person.family}`, profession: person.profession, role: person.role,
        workplace: person.workplace?.name ?? null, mood: person.mood, hooks: person.hooks,
        introduction: person.introduction?.text ?? null, scenario: document.scenarioName, date: document.date,
      },
    };
  });
}
