import type { Summary } from '../api/types';
import { fmt } from './format';

/** Settlement count and population per size class as paired horizontal bars. */
export function PopulationChart({ summary }: { summary: Summary }) {
  const rows = summary.classDistribution;
  const maxCount = Math.max(...rows.map((r) => r.count), 1);
  const maxPop = Math.max(...rows.map((r) => r.population), 1);
  return (
    <section className="section">
      <div className="section-head"><h2>Settlement classes</h2><span className="muted">Worldbuilding thresholds from config/simulator.yaml</span></div>
      <table className="bars" aria-label="Settlement class distribution">
        <thead><tr><th>Class</th><th>Range</th><th>Settlements</th><th>Population</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.label}</th>
              <td className="muted num">{fmt(r.minPopulation)}{r.maxPopulation ? `–${fmt(r.maxPopulation - 1)}` : '+'}</td>
              <td><div className="bar"><span style={{ width: `${(r.count / maxCount) * 100}%` }} /><b>{fmt(r.count)}</b></div></td>
              <td><div className="bar bar-alt"><span style={{ width: `${(r.population / maxPop) * 100}%` }} /><b>{fmt(r.population)}</b></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
