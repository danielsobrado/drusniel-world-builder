import type { PageMeta, SettlementClass, SettlementRow } from '../api/types';
import type { Filters } from '../shell/ExplorerPanel';
import { useEffect, useState } from 'react';
import { paths, useApi } from '../api/worldApi';
import { classLabel, fmt } from './format';
import { Empty, ErrorState, Loading } from './StateViews';

const COLUMNS = [
  { key: 'name', label: 'Settlement' },
  { key: 'stateName', label: 'State' },
  { key: 'cultureName', label: 'Culture' },
  { key: 'population', label: 'Population', numeric: true },
  { key: 'class', label: 'Class' },
  { key: 'npcs', label: 'NPC budget', numeric: true },
];
const PAGE_SIZE = 50;

/** Server-side paged, filtered and sorted settlement explorer. */
export function SettlementTable({ filters, classes, selectedId, onSelect }: {
  filters: Filters; classes?: SettlementClass[]; selectedId?: string | null; onSelect: (id: string) => void;
}) {
  const [sort, setSort] = useState<{ key: string; order: 'asc' | 'desc' }>({ key: 'population', order: 'desc' });
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filters, sort]);
  const result = useApi<SettlementRow[], PageMeta>(paths.settlements({ ...filters, sort: sort.key, order: sort.order, page, pageSize: PAGE_SIZE }));
  const info = result.meta?.page;
  const toggleSort = (key: string) => setSort((s) => (s.key === key ? { key, order: s.order === 'asc' ? 'desc' : 'asc' } : { key, order: key === 'name' ? 'asc' : 'desc' }));

  return (
    <section className="section section-fill">
      <div className="section-head">
        <h2>Settlement explorer</h2>
        <span className="muted">{info ? `${fmt(info.totalItems)} settlements match` : ' '}</span>
      </div>
      {result.error ? <ErrorState error={result.error} onRetry={result.reload} /> : (
        <div className="table-wrap">
          <table className="grid" aria-label="Settlements">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} className={c.numeric ? 'num' : undefined} aria-sort={sort.key === c.key ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="sort" onClick={() => toggleSort(c.key)}>
                      {c.label}{sort.key === c.key ? (sort.order === 'asc' ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                ))}
                <th>Capital</th>
              </tr>
            </thead>
            <tbody className={result.loading ? 'is-loading' : undefined}>
              {result.data?.map((s) => (
                <tr key={s.id} className={s.id === selectedId ? 'selected' : undefined} onClick={() => onSelect(s.id)}
                  tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(s.id); }} aria-selected={s.id === selectedId}>
                  <td>{s.name}{s.pilot && <span className="badge badge-pilot" title="Pilot settlement">pilot</span>}</td>
                  <td>{s.stateName}</td>
                  <td>{s.cultureName}</td>
                  <td className="num">{fmt(s.population)}</td>
                  <td><span className={`class-tag class-${s.class}`}>{classLabel(classes, s.class)}</span></td>
                  <td className="num">{fmt(s.npcs)}</td>
                  <td>{s.capital ? <span className="badge" title="State capital">♔ capital</span> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!result.data && <Loading />}
          {result.data?.length === 0 && <Empty>No settlements match these filters.</Empty>}
        </div>
      )}
      {info && info.totalPages > 1 && (
        <div className="pager">
          <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {info.page} of {info.totalPages}</span>
          <button type="button" className="btn" disabled={page >= info.totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}
