import { useState, type FormEvent } from 'react';
import type { HistoryEventView } from '../api/types';
import { useApi } from '../api/worldApi';
import { fmt } from '../components/format';
import { ApiView } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';
import type { InterventionTargets } from './types';

type Kind = 'disaster' | 'granary-loss' | 'bandit-surge';
const KINDS: { id: Kind; label: string; help: string }[] = [
  { id: 'disaster', label: 'Business lost to disaster', help: 'Its named workers lose work now, and the town loses that share of the trade.' },
  { id: 'granary-loss', label: 'Spoiled granary', help: 'Blight takes part of the town’s food store; hunger follows if it cannot buy more.' },
  { id: 'bandit-surge', label: 'Outlaw surge', help: 'More bandits (or pirates at sea) gather on one route; raids follow.' },
];

/** Inject a designer's event at the scenario's current day; everything after it is the ordinary simulation. */
export function InterventionPanel({ sim, onRecorded }: { sim: Simulation; onRecorded: (events: HistoryEventView[]) => void }) {
  const active = sim.active;
  const targets = useApi<InterventionTargets>(active ? `/api/scenarios/${encodeURIComponent(active.id)}/interventions/targets?v=${sim.version}` : null);
  const [kind, setKind] = useState<Kind>('disaster');
  const [target, setTarget] = useState('');
  const [cause, setCause] = useState('collapse');
  const [share, setShare] = useState(50);
  const [bandits, setBandits] = useState(8);
  const [note, setNote] = useState('');
  if (!active) return null;

  const submit = async (e: FormEvent, id: string) => {
    e.preventDefault();
    const body = kind === 'disaster' ? { kind, businessId: id, cause, note }
      : kind === 'granary-loss' ? { kind, settlementId: id, share: share / 100, note } : { kind, routeId: id, bandits, note };
    const events = await sim.intervene(body);
    if (events) { onRecorded(events); setNote(''); }
  };
  const blocked = active.running ? 'Pause the scenario first.' : active.readOnly ? 'This scenario is read-only.' : null;

  return (
    <ApiView result={targets} loadingLabel="Listing targets…">
      {(t) => {
        const options = kind === 'disaster'
          ? [...t.businesses].sort((a, b) => b.named - a.named || a.name.localeCompare(b.name))
            .map((b) => ({ id: b.id, label: `${b.name} · ${b.settlement} · ${fmt(b.filled)} workers, ${b.named} named` }))
          : kind === 'granary-loss' ? t.settlements.map((s) => ({ id: s.id, label: `${s.name} · granary ${fmt(s.granary)} rations` }))
            : t.routes.map((r) => ({ id: r.id, label: `${r.name} · ${r.mode === 'sea' ? 'sea lane' : 'road'} · ${r.bandits} outlaws` }));
        const chosen = options.some((o) => o.id === target) ? target : options[0]?.id ?? '';
        return (
          <form className="lab-form" onSubmit={(e) => void submit(e, chosen)} aria-label="Intervention">
            <div className="segmented" role="radiogroup" aria-label="Intervention kind">
              {KINDS.map((k) => (
                <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className={`chip${kind === k.id ? '' : ' chip-muted'}`}
                  onClick={() => { setKind(k.id); setTarget(''); }}>{k.label}</button>
              ))}
            </div>
            <p className="muted small">{KINDS.find((k) => k.id === kind)?.help}</p>
            <label className="field"><span>{kind === 'disaster' ? 'Business' : kind === 'granary-loss' ? 'Settlement' : 'Route'}</span>
              <select value={chosen} onChange={(e) => setTarget(e.target.value)} aria-label="Target">
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select></label>
            {kind === 'disaster' && (
              <label className="field"><span>What happened</span>
                <select value={cause} onChange={(e) => setCause(e.target.value)} aria-label="Cause">
                  <option value="collapse">Collapse</option><option value="fire">Fire</option><option value="flood">Flood</option>
                </select></label>)}
            {kind === 'granary-loss' && (
              <label className="field"><span>Share spoiled: {share}%</span>
                <input type="range" min={10} max={100} step={5} value={share} onChange={(e) => setShare(Number(e.target.value))} aria-label="Share spoiled" /></label>)}
            {kind === 'bandit-surge' && (
              <label className="field"><span>More outlaws</span>
                <input type="number" min={1} max={200} value={bandits} onChange={(e) => setBandits(Number(e.target.value))} aria-label="More outlaws" /></label>)}
            <label className="field"><span>Note (kept with the event)</span>
              <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="the lower gallery gave way" aria-label="Note" /></label>
            <div className="lab-actions">
              <button type="submit" className="btn" disabled={Boolean(blocked) || sim.busy || !chosen}>Apply on {active.date.label}</button>
              {blocked && <span className="muted small">{blocked}</span>}
            </div>
          </form>
        );
      }}
    </ApiView>
  );
}
