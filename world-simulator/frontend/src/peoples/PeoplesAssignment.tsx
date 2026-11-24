import { useState, type FormEvent } from 'react';
import type { World } from '../api/types';
import type { Simulation } from '../simulation/useSimulation';
import type { PeoplesData } from './types';

export function PeoplesAssignment({ data, sim, world }: { data: PeoplesData; sim: Simulation; world: World | null }) {
  const [name, setName] = useState('');
  const [settlement, setSettlement] = useState('');
  const [culture, setCulture] = useState('');
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [share, setShare] = useState(80);
  const towns = (world?.markers ?? data.settlements).toSorted((a, b) => a.name.localeCompare(b.name));
  const valid = name.trim() && settlement && (culture || primary) &&
    (!secondary || (primary && secondary !== primary && Number.isInteger(share) && share >= 1 && share <= 99));

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const ancestryWeights = primary ? (secondary ? { [primary]: share / 100, [secondary]: (100 - share) / 100 } : { [primary]: 1 }) : undefined;
    const selected = data.cultures[culture];
    const placement = culture === 'neutral' ? { cultureId: null, cultureSeedId: null } : selected?.status === 'core' ?
      { cultureId: culture } : selected?.status === 'seed' ? { cultureSeedId: culture } : {};
    const result = await sim.create({
      name: name.trim(), scope: { type: 'settlements', settlementIds: [settlement] },
      peoples: { [settlement]: { ...placement, ancestryWeights } },
    });
    if (result) setName('');
  }

  return <details className="section">
    <summary>New scenario with explicit assignments</summary>
    <form className="peoples-controls" onSubmit={(event) => void create(event)}>
      <label>Scenario name <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required /></label>
      <label>Settlement <select value={settlement} onChange={(e) => setSettlement(e.target.value)} required>
        <option value="">Select a settlement</option>
        {towns.map((town) => <option key={town.id} value={town.id}>{town.name}</option>)}
      </select></label>
      <label>Local culture <select value={culture} onChange={(e) => setCulture(e.target.value)}>
        <option value="">Use map mapping</option><option value="neutral">Unmapped</option>
        {Object.entries(data.cultures).map(([id, row]) => <option value={id} key={id}>{row.displayName}{row.status === 'seed' ? ' · Seed' : ''}</option>)}
      </select></label>
      <label>Primary ancestry <select value={primary} onChange={(e) => { setPrimary(e.target.value); if (!e.target.value || e.target.value === secondary) setSecondary(''); }}>
        <option value="">Use culture distribution</option>
        {Object.entries(data.ancestries).map(([id, row]) => <option value={id} key={id}>{row.label}</option>)}
      </select></label>
      {primary && <label>Secondary ancestry <select value={secondary} onChange={(e) => setSecondary(e.target.value)}>
        <option value="">None</option>
        {Object.entries(data.ancestries).filter(([id]) => id !== primary).map(([id, row]) => <option value={id} key={id}>{row.label}</option>)}
      </select></label>}
      {secondary && <label>Primary ancestry percentage <input type="number" min={1} max={99} value={share}
        onChange={(e) => setShare(e.target.valueAsNumber)} required /></label>}
      {sim.error && <p role="alert">{sim.error.message}</p>}
      <button type="submit" className="btn" disabled={!valid || sim.busy}>Create scenario</button>
    </form>
  </details>;
}
