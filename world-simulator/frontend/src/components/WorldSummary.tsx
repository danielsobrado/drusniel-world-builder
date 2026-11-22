import type { ReactNode } from 'react';
import type { Summary } from '../api/types';
import { fmt } from './format';

function Tile({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className={`tile${tone ? ` tile-${tone}` : ''}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  );
}

export function WorldSummary({ summary }: { summary: Summary }) {
  const { world, counts, population, npcBudget, referenceCheck, populationInterpretation, sourceSettings, connectivity } = summary;
  const activeCultures = summary.cultures.filter((c) => c.settlementCount > 0).length;
  const mismatches = referenceCheck ? Object.entries(referenceCheck).filter(([, c]) => !c.matches) : [];
  return (
    <section className="section">
      <div className="section-head">
        <h1>{world.name}</h1>
        <span className="muted">{world.fileName} · Azgaar {world.azgaarVersion} · seed {world.seed}</span>
      </div>
      <div className="tiles">
        <Tile label="Named settlements" value={fmt(counts.settlements)} note={`${summary.capitals} capitals · ${summary.ports} ports`} />
        <Tile label="Total population" value={fmt(population.total)} note="named + rural inhabitants" />
        <Tile label="Named-settlement population" value={fmt(population.named)} />
        <Tile label="Rural population" value={fmt(population.rural)} />
        <Tile label="States · provinces" value={`${counts.states} · ${summary.provinceCount}`} />
        <Tile label="Cultures" value={counts.cultures} note={`${activeCultures} with named settlements`} />
        <Tile label="NPC target (config)" value={fmt(npcBudget.target)} />
        <Tile label="NPCs allocated (computed)" value={fmt(npcBudget.allocated)} tone={npcBudget.feasible ? 'good' : 'bad'}
          note={npcBudget.feasible ? 'Feasible within class ranges' : npcBudget.reason} />
        <Tile label="Road-connected" value={fmt(connectivity.roadConnectedSettlements)} note={`${connectivity.isolatedSettlements} off the land network · ${connectivity.roadComponents} components`} />
      </div>
      <div className="notes">
        <p><strong>Population units.</strong> {populationInterpretation.canonical} (rate {sourceSettings.populationRate}, urbanization {sourceSettings.urbanization}).
          {' '}The game's settlement renderer reads burg population as thousands, which {populationInterpretation.gameRenderingAgrees ? 'agrees with' : 'differs from'} this map's scale; the sim projection stores raw points.</p>
        {referenceCheck && (mismatches.length === 0
          ? <p className="good">Reference counts verified: {Object.entries(referenceCheck).map(([k, c]) => `${c.observed} ${k}`).join(', ')}.</p>
          : <p className="bad">Reference mismatch: {mismatches.map(([k, c]) => `${k} expected ${c.expected}, observed ${c.observed}`).join('; ')}.</p>)}
      </div>
    </section>
  );
}
