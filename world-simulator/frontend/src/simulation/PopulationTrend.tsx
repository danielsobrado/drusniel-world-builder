import { useMemo } from 'react';
import type { ScenarioState } from '../api/types';
import { IndexedTrend, SERIES } from '../components/IndexedTrend';
import { fmt } from '../components/format';

/**
 * Population indexed to the scenario start (100 = imported), one line per settlement,
 * so settlements of very different size share one honest axis. Larger scopes show the total.
 */
export function PopulationTrend({ state }: { state: ScenarioState }) {
  const series = useMemo(() => {
    const first = state.history[0]?.population ?? {};
    const pick = state.settlements.length <= SERIES.length
      ? state.settlements.map((s) => ({ id: s.settlementId, name: s.name, base: first[s.settlementId] || 1, read: (p: Record<string, number>) => p[s.settlementId] ?? 0 }))
      : [{ id: 'total', name: 'All settlements', base: Object.values(first).reduce((a, b) => a + b, 0) || 1,
          read: (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0) }];
    return pick.map((s, i) => ({ id: s.id, name: s.name, base: s.base, color: SERIES[i], values: state.history.map((h) => s.read(h.population)) }));
  }, [state]);
  return (
    <IndexedTrend series={series} days={state.history.map((h) => h.day)} startLabel={`${state.startYear}-01-01`} endLabel={state.date.label}
      label="Population indexed to the scenario start" format={fmt} />
  );
}
