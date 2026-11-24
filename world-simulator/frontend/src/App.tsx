import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import type { Summary, World } from './api/types';
import { paths, useApi } from './api/worldApi';
import { AppBar } from './shell/AppBar';
import { IconRail } from './shell/IconRail';
import { WorkspaceBar } from './shell/WorkspaceBar';
import { EMPTY_FILTERS, ExplorerPanel } from './shell/ExplorerPanel';
import { Inspector } from './shell/Inspector';
import { StatusBar } from './shell/StatusBar';
import { WORKSPACES } from './shell/workspaces';
import { useLayout, useShortcuts } from './shell/useLayout';
import { ApiView } from './components/StateViews';
import { WorldSummary } from './components/WorldSummary';
import { PopulationChart } from './components/PopulationChart';
import { SettlementTable } from './components/SettlementTable';
import { BudgetComparison } from './components/BudgetComparison';
import { WorldMap } from './components/WorldMap';
import { PilotSettlements } from './components/PilotSettlements';
import { ScenarioExplorer } from './simulation/ScenarioExplorer';
import { SimulationWorkspace } from './simulation/SimulationWorkspace';
import { useSimulation } from './simulation/useSimulation';
import { HouseholdsWorkspace } from './society/HouseholdsWorkspace';
import { BusinessesWorkspace } from './society/BusinessesWorkspace';
import { EconomyWorkspace } from './economy/EconomyWorkspace';
import { RoadsWorkspace } from './roads/RoadsWorkspace';
import { PeopleWorkspace } from './people/PeopleWorkspace';
import { DialogueLab } from './narration/DialogueLab';
import { useLlm } from './narration/useLlm';
import { PeoplesExplorer } from './peoples/PeoplesExplorer';
import { PeoplesInspector } from './peoples/PeoplesInspector';
import { PeoplesWorkspace } from './peoples/PeoplesWorkspace';
import type { PeoplesData, PeoplesSelection } from './peoples/types';
import { LabWorkspace } from './lab/LabWorkspace';

export default function App() {
  const { layout, update, reset } = useLayout();
  useShortcuts({ workspaces: WORKSPACES, update, layout });
  const health = useApi<{ status: string }>(paths.health);
  const world = useApi<World>(paths.world);
  const summary = useApi<Summary>(paths.summary);
  const sim = useSimulation();
  const llm = useLlm();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const select = useCallback((id: string) => { setSelectedId(id); update({ rightOpen: true }); }, [update]);
  const go = useCallback((workspace: string) => update({ workspace }), [update]);
  const [peoplesSelection, setPeoplesSelection] = useState<PeoplesSelection | null>(null);
  const peoples = useApi<PeoplesData>(layout.workspace === 'peoples' && sim.active
    ? `/api/scenarios/${encodeURIComponent(sim.active.id)}/peoples?v=${encodeURIComponent(sim.version)}` : null);
  const selectPeoples = (choice: PeoplesSelection) => {
    setPeoplesSelection(choice);
    setSelectedId(null);
    update({ rightOpen: true });
  };
  const classes = summary.data?.classes;

  const views: Record<string, () => ReactNode> = {
    overview: () => <ApiView result={summary}>{(data) => <><WorldSummary summary={data} /><PopulationChart summary={data} /></>}</ApiView>,
    atlas: () => <ApiView result={world}>{(data) => <WorldMap world={data} states={summary.data?.states} filters={filters} selectedId={selectedId} onSelect={select} />}</ApiView>,
    settlements: () => <SettlementTable filters={filters} classes={classes} selectedId={selectedId} onSelect={select} />,
    budget: () => <BudgetComparison classes={classes} />,
    pilot: () => <PilotSettlements classes={classes} onSelect={select} onShowAtlas={() => go('atlas')} />,
    simulation: () => <SimulationWorkspace sim={sim} summary={summary.data} onSelect={select} />,
    households: () => <HouseholdsWorkspace sim={sim} onSelect={select} />,
    businesses: () => <BusinessesWorkspace sim={sim} onSelect={select} selectedId={selectedId} />,
    economy: () => <EconomyWorkspace sim={sim} onSelect={select} />,
    roads: () => <RoadsWorkspace sim={sim} onSelect={select} selectedId={selectedId} />,
    people: () => <PeopleWorkspace sim={sim} onSelect={select} selectedId={selectedId} />,
    peoples: () => <PeoplesWorkspace result={peoples} sim={sim} world={world.data} selection={peoplesSelection} onSelect={select} />,
    dialogue: () => <DialogueLab sim={sim} llm={llm.status} />,
    lab: () => <LabWorkspace sim={sim} onSelect={select} />,
  };
  const workspace = views[layout.workspace] ? layout.workspace : 'overview';

  return (
    <div className="app" style={{ '--inspector-width': `${layout.rightWidth}px` } as CSSProperties}>
      <AppBar world={world.data} summary={summary.data} sim={sim} onResetLayout={reset} llm={llm.status} />
      <WorkspaceBar world={world.data} workspaces={WORKSPACES} active={workspace} onSelect={go} layout={layout} update={update} />
      <div className={`body${layout.leftOpen ? ' left-open' : ''}${layout.rightOpen ? ' right-open' : ''}`}>
        <IconRail workspaces={WORKSPACES} active={workspace} onSelect={go} />
        {layout.leftOpen && (workspace === 'peoples'
          ? <PeoplesExplorer data={peoples.data} selection={peoplesSelection} onSelect={selectPeoples} />
          : ['simulation', 'households', 'businesses', 'economy', 'roads', 'people', 'dialogue', 'lab'].includes(workspace)
          ? <ScenarioExplorer sim={sim} />
          : <ExplorerPanel summary={summary.data} filters={filters} setFilters={setFilters} selectedId={selectedId} onSelect={select} />)}
        <main className="workspace" aria-label={WORKSPACES.find((w) => w.id === workspace)?.label}>{views[workspace]()}</main>
        {layout.rightOpen && <Inspector selectedId={selectedId} classes={classes} width={layout.rightWidth} onSelect={select} sim={sim}
          content={workspace === 'peoples' && !selectedId ?
            <PeoplesInspector data={peoples.data} selection={peoplesSelection} /> : undefined}
          onResize={(rightWidth) => update({ rightWidth })} onClose={() => update({ rightOpen: false })} />}
      </div>
      <StatusBar health={health} summary={summary} sim={sim} llm={llm.status} />
    </div>
  );
}
