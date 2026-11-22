import { useCallback, useState } from 'react';
import { paths, useApi } from './api/worldApi.js';
import { AppBar } from './shell/AppBar.jsx';
import { IconRail } from './shell/IconRail.jsx';
import { WorkspaceBar } from './shell/WorkspaceBar.jsx';
import { EMPTY_FILTERS, ExplorerPanel } from './shell/ExplorerPanel.jsx';
import { Inspector } from './shell/Inspector.jsx';
import { StatusBar } from './shell/StatusBar.jsx';
import { WORKSPACES } from './shell/workspaces.js';
import { useLayout, useShortcuts } from './shell/useLayout.js';
import { ApiView } from './components/StateViews.jsx';
import { WorldSummary } from './components/WorldSummary.jsx';
import { PopulationChart } from './components/PopulationChart.jsx';
import { SettlementTable } from './components/SettlementTable.jsx';
import { BudgetComparison } from './components/BudgetComparison.jsx';
import { WorldMap } from './components/WorldMap.jsx';
import { PilotSettlements } from './components/PilotSettlements.jsx';

export default function App() {
  const { layout, update, reset } = useLayout();
  useShortcuts({ workspaces: WORKSPACES, update, layout });
  const health = useApi(paths.health);
  const world = useApi(paths.world);
  const summary = useApi(paths.summary);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState(null);
  const select = useCallback((id) => { setSelectedId(id); update({ rightOpen: true }); }, [update]);
  const go = useCallback((workspace) => update({ workspace }), [update]);
  const classes = summary.data?.classes;

  const views = {
    overview: () => <ApiView result={summary}>{(data) => <><WorldSummary summary={data} /><PopulationChart summary={data} /></>}</ApiView>,
    atlas: () => <ApiView result={world}>{(data) => <WorldMap world={data} states={summary.data?.states} filters={filters} selectedId={selectedId} onSelect={select} />}</ApiView>,
    settlements: () => <SettlementTable filters={filters} classes={classes} selectedId={selectedId} onSelect={select} />,
    budget: () => <BudgetComparison classes={classes} />,
    pilot: () => <PilotSettlements classes={classes} onSelect={select} onShowAtlas={() => go('atlas')} />,
  };
  const workspace = views[layout.workspace] ? layout.workspace : 'overview';

  return (
    <div className="app" style={{ '--inspector-width': `${layout.rightWidth}px` }}>
      <AppBar world={world.data} summary={summary.data} onResetLayout={reset} />
      <WorkspaceBar world={world.data} workspaces={WORKSPACES} active={workspace} onSelect={go} layout={layout} update={update} />
      <div className={`body${layout.leftOpen ? ' left-open' : ''}${layout.rightOpen ? ' right-open' : ''}`}>
        <IconRail workspaces={WORKSPACES} active={workspace} onSelect={go} />
        {layout.leftOpen && <ExplorerPanel summary={summary.data} filters={filters} setFilters={setFilters} selectedId={selectedId} onSelect={select} />}
        <main className="workspace" aria-label={WORKSPACES.find((w) => w.id === workspace).label}>{views[workspace]()}</main>
        {layout.rightOpen && <Inspector selectedId={selectedId} classes={classes} width={layout.rightWidth} onSelect={select}
          onResize={(rightWidth) => update({ rightWidth })} onClose={() => update({ rightOpen: false })} />}
      </div>
      <StatusBar health={health} summary={summary} />
    </div>
  );
}
