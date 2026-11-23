import type { Diagnostics } from '../api/types';
import { useApi } from '../api/worldApi';
import { fmt } from '../components/format';
import { ApiView } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';

/** Businesses against people and buildings: enterprises are not buildings; farms work outside, crafts often from home. */
export function DiagnosticsTable({ sim }: { sim: Simulation }) {
  const result = useApi<Diagnostics[]>(sim.active ? `/api/scenarios/${encodeURIComponent(sim.active.id)}/diagnostics?v=${sim.version}` : null);
  return (
    <ApiView result={result} loadingLabel="Checking plausibility…">
      {(rows) => (
        <div className="table-scroll">
          <table className="grid" aria-label="Business plausibility">
            <thead><tr><th>Settlement</th><th className="num">Businesses</th><th className="num">Per 1,000 people</th><th className="num">Workers each</th>
              <th className="num">Rural</th><th className="num">From home</th><th className="num">Urban premises</th><th className="num">Per dwelling building</th><th>Flags</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.settlementId}>
                <td>{r.name}</td><td className="num">{fmt(r.businesses)}</td><td className="num">{r.businessesPerThousand}</td>
                <td className="num">{r.employeesPerBusiness}</td><td className="num">{fmt(r.ruralOperations)}</td><td className="num">{fmt(r.homeWorkshops)}</td>
                <td className="num">{fmt(r.urbanPremises)}</td><td className="num">{r.urbanPremisesPerDwelling}</td>
                <td>{r.flags.length ? <span className="status status-strained">{r.flags.join('; ')}</span> : <span className="status status-ok">plausible</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </ApiView>
  );
}
