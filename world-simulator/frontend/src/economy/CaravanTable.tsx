import type { CalendarDate, Caravan } from '../api/types';
import { Empty } from '../components/StateViews';
import { cargoText, dayLabel } from './format';

export function CaravanTable({ caravans, date, delivered, label }: {
  caravans: Caravan[]; date: CalendarDate; delivered: boolean; label: string;
}) {
  if (!caravans.length) return <Empty>{delivered ? 'No caravan has arrived yet.' : 'No caravan is on the road.'}</Empty>;
  return (
    <table className="grid" aria-label={label}>
      <thead><tr><th>Caravan</th><th>Route</th><th>Cargo</th><th className="num">Value</th><th>Departed</th>
        <th>{delivered ? 'Arrived' : 'Arrives'}</th></tr></thead>
      <tbody>{caravans.map((c) => (
        <tr key={c.id}>
          <td className="cap">{c.kind}</td><td>{c.fromName} → {c.toName}</td><td className="muted">{cargoText(c.cargo)}</td>
          <td className="num">{c.value.toFixed(2)}</td><td className="nowrap">{dayLabel(c.departDay, date)}</td>
          <td className="nowrap">{dayLabel(c.arriveDay, date)}{!delivered && <span className="muted"> · in {c.arriveDay - date.day} days</span>}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}
