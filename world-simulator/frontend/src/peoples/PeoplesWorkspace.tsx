import type { World } from '../api/types';
import type { ApiResult } from '../api/worldApi';
import { ApiView, Empty } from '../components/StateViews';
import type { Simulation } from '../simulation/useSimulation';
import { CultureComparison } from './CultureComparison';
import { PeoplesAssignment } from './PeoplesAssignment';
import { PopulationViews } from './PopulationViews';
import type { PeoplesData, PeoplesSelection } from './types';

export function PeoplesWorkspace({ result, sim, world, selection, onSelect }: {
  result: ApiResult<PeoplesData>; sim: Simulation; world: World | null;
  selection: PeoplesSelection | null; onSelect: (id: string) => void;
}) {
  if (!sim.active) return <Empty>Select a scenario to inspect its population.</Empty>;
  const base = `/api/scenarios/${encodeURIComponent(sim.active.id)}/peoples`;
  return <ApiView result={result} loadingLabel="Loading peoples and cultures…">
    {(data) => <div className="peoples-workspace">
      <PopulationViews data={data} selection={selection} world={world} onSelect={onSelect} />
      <CultureComparison key={base} data={data} base={base} />
      <PeoplesAssignment key={sim.active?.id} data={data} sim={sim} world={world} />
    </div>}
  </ApiView>;
}
