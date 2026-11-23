import type { Personality, Scorecard } from '../api/types';
import { fmt } from '../components/format';

const TRAITS: { key: keyof Personality; label: string; hint: string }[] = [
  { key: 'greed', label: 'Greed', hint: 'pushes towards smuggling and cheaper escorts' },
  { key: 'caution', label: 'Caution', hint: 'hires more guards, hides less' },
  { key: 'honesty', label: 'Honesty', hint: 'holds back from smuggling' },
];

/** Personality as three labelled bars; the number is always shown, never colour alone. */
export function TraitBars({ personality, compact = false }: { personality: Personality; compact?: boolean }) {
  return (
    <div className={`traits${compact ? ' traits-compact' : ''}`} role="list" aria-label="Personality">
      {TRAITS.map((t) => (
        <div key={t.key} className="trait" role="listitem" title={t.hint}>
          <span className="trait-label">{compact ? t.label[0] : t.label}</span>
          <span className="trait-bar"><span style={{ width: `${personality[t.key] * 100}%` }} /></span>
          <b>{personality[t.key].toFixed(2)}</b>
        </div>
      ))}
    </div>
  );
}

/** Reputation 0–100 with its standing in words. */
export function Reputation({ value }: { value: number }) {
  const standing = value >= 80 ? 'trusted' : value >= 40 ? 'steady' : value >= 15 ? 'doubted' : 'disgraced';
  const status = value >= 40 ? 'ok' : value >= 15 ? 'strained' : 'critical';
  return <span className={`status status-${status}`}>{value.toFixed(0)} · {standing}</span>;
}

export function ScorecardFields({ card }: { card: Scorecard }) {
  const rows: [string, string][] = [
    ['Trips', fmt(card.trips)],
    ['Value carried', card.valueCarried.toFixed(1)],
    ['Commission earned', card.commission.toFixed(1)],
    ['Tax paid', card.taxPaid.toFixed(1)],
    ['Tax evaded', `${card.taxEvaded.toFixed(1)} on ${fmt(card.smuggled)} trips with hidden cargo`],
    ['Caught smuggling', `${fmt(card.caught)} times · fined ${card.fines.toFixed(1)}`],
    ['Raided', `${fmt(card.raids)} times · lost ${card.lossesValue.toFixed(1)}`],
    ['Guards hired', `${fmt(card.guardsHired)} (${card.trips ? (card.guardsHired / card.trips).toFixed(1) : '0'} a trip)`],
    ['Household upkeep', card.livingCosts.toFixed(1)],
    ['Invested · dividends', `${card.invested.toFixed(1)} · ${card.dividends.toFixed(1)}`],
  ];
  return (
    <dl className="fields">
      <div className="field"><dt>Reputation</dt><dd><Reputation value={card.reputation} /></dd></div>
      {rows.map(([k, v]) => <div key={k} className="field"><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}
