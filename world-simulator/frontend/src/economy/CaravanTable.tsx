import type { CalendarDate, Caravan } from '../api/types';
import { Empty } from '../components/StateViews';
import { cargoText, dayLabel } from './format';

function Incident({ c }: { c: Caravan }) {
  if (Object.keys(c.lost).length) return <span className="status status-critical">raided: {cargoText(c.lost)}</span>;
  if (c.caught) return <span className="status status-critical">smuggling caught</span>;
  if (c.smuggled) return <span className="status status-strained">hid {c.smuggled.toFixed(1)}</span>;
  return <span className="muted">—</span>;
}

export function CaravanTable({ caravans, date, delivered, label, onSelect }: {
  caravans: Caravan[]; date: CalendarDate; delivered: boolean; label: string; onSelect?: (id: string) => void;
}) {
  if (!caravans.length) return <Empty>{delivered ? 'No caravan has arrived yet.' : 'No caravan is on the road.'}</Empty>;
  return (
    <table className="grid" aria-label={label}>
      <thead><tr><th>Caravan</th><th>Route</th><th>Master</th><th className="num">Guards</th><th>Cargo</th><th className="num">Value</th>
        <th>Departed</th><th>{delivered ? 'Arrived' : 'Arrives'}</th><th>Incident</th></tr></thead>
      <tbody>{caravans.map((c) => (
        <tr key={c.id} onClick={c.traderId && onSelect ? () => onSelect(c.traderId!) : undefined}>
          <td className="cap">{c.kind}</td><td>{c.fromName} → {c.toName}</td><td>{c.traderName ?? <span className="muted">market</span>}</td>
          <td className="num">{c.guards}</td><td className="muted">{cargoText(c.cargo)}</td>
          <td className="num">{c.value.toFixed(2)}</td><td className="nowrap">{dayLabel(c.departDay, date)}</td>
          <td className="nowrap">{dayLabel(c.arriveDay, date)}{!delivered && <span className="muted"> · in {c.arriveDay - date.day} days</span>}</td>
          <td><Incident c={c} /></td>
        </tr>
      ))}</tbody>
    </table>
  );
}
