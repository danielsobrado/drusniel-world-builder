import { useState, type ChangeEvent, type Dispatch, type SetStateAction } from 'react';
import type { RegionSummary, SettlementRow, Summary } from '../api/types';
import { paths, useApi } from '../api/worldApi';
import { Icon } from './Icon';
import { fmt } from '../components/format';
import { ErrorState, Loading } from '../components/StateViews';

export interface Filters { q: string; class: string; state: string; culture: string; capital: string; minPopulation: string; maxPopulation: string }

export const EMPTY_FILTERS: Filters = Object.freeze({ q: '', class: '', state: '', culture: '', capital: '', minPopulation: '', maxPopulation: '' });

function StateNode({ state, open, onToggle, onFilter, selectedId, onSelect }: {
  state: RegionSummary; open: boolean; onToggle: () => void; onFilter: () => void; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const list = useApi<SettlementRow[]>(open ? paths.settlements({ state: state.id, sort: 'name', pageSize: 200 }) : null);
  return (
    <li>
      <div className="tree-row">
        <button type="button" className={`tree-toggle${open ? ' open' : ''}`} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${state.name}`} onClick={onToggle}>
          <Icon name="chevron" size={14} />
        </button>
        <span className="swatch" style={{ background: state.color ?? 'var(--muted)' }} />
        <button type="button" className="tree-label" title="Filter by this state" onClick={onFilter}>{state.name}</button>
        <span className="tree-count">{state.settlementCount}</span>
      </div>
      {open && (
        <ul className="tree-children">
          {list.error && <li><ErrorState error={list.error} onRetry={list.reload} /></li>}
          {!list.data && !list.error && <li><Loading /></li>}
          {list.data?.map((s) => (
            <li key={s.id}>
              <button type="button" className={`tree-leaf${s.id === selectedId ? ' selected' : ''}`} onClick={() => onSelect(s.id)}>
                <span>{s.name}{s.capital ? ' ♔' : ''}</span><span className="tree-count">{fmt(s.population)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Search, filters and the State > Settlement tree; filters are shared with the table and atlas. */
export function ExplorerPanel({ summary, filters, setFilters, selectedId, onSelect }: {
  summary: Summary | null; filters: Filters; setFilters: Dispatch<SetStateAction<Filters>>; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const [openStates, setOpenStates] = useState<Set<string>>(() => new Set());
  const set = (key: keyof Filters) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters((f) => ({ ...f, [key]: event.target.value }));
  const toggle = (id: string) => setOpenStates((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const active = Object.values(filters).some(Boolean);
  return (
    <aside className="explorer" aria-label="World explorer">
      <div className="panel-title">World Explorer</div>
      <div className="search">
        <Icon name="search" size={15} />
        <input id="explorer-search" type="search" placeholder="Search settlements…  (/)" value={filters.q} onChange={set('q')} aria-label="Search settlements" />
      </div>
      <div className="filters">
        <label>Class
          <select value={filters.class} onChange={set('class')}>
            <option value="">All classes</option>
            {summary?.classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label>State
          <select value={filters.state} onChange={set('state')}>
            <option value="">All states</option>
            {summary?.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Culture
          <select value={filters.culture} onChange={set('culture')}>
            <option value="">All cultures</option>
            {summary?.cultures.filter((c) => c.settlementCount > 0).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Capital
          <select value={filters.capital} onChange={set('capital')}>
            <option value="">Any</option><option value="true">Capitals</option><option value="false">Not capitals</option>
          </select>
        </label>
        <div className="filter-pair">
          <label>Min pop.<input type="number" min="0" inputMode="numeric" value={filters.minPopulation} onChange={set('minPopulation')} /></label>
          <label>Max pop.<input type="number" min="0" inputMode="numeric" value={filters.maxPopulation} onChange={set('maxPopulation')} /></label>
        </div>
        <button type="button" className="btn btn-ghost" disabled={!active} onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>
      </div>
      <div className="panel-title">States</div>
      <ul className="tree">
        {summary?.states.map((s) => (
          <StateNode key={s.id} state={s} open={openStates.has(s.id)} onToggle={() => toggle(s.id)}
            onFilter={() => setFilters((f) => ({ ...f, state: s.id }))} selectedId={selectedId} onSelect={onSelect} />
        ))}
      </ul>
    </aside>
  );
}
