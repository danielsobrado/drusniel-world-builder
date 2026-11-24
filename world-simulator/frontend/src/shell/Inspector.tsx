import { useRef, type PointerEvent, type ReactNode } from 'react';
import type { SettlementClass } from '../api/types';
import type { Simulation } from '../simulation/useSimulation';
import { BusinessDetails } from '../society/BusinessDetails';
import { TraderDetails } from '../roads/TraderDetails';
import { PersonDetails } from '../people/PersonDetails';
import { EventDetails } from '../people/EventDetails';
import { TravelDetails } from '../travel/TravelDetails';
import { Icon } from './Icon';
import { SettlementDetails } from '../components/SettlementDetails';
import { Empty } from '../components/StateViews';

const MIN = 280;
const MAX = 640;

/** The one shared inspector: whatever is selected anywhere shows here. Drag the left edge to resize. */
export function Inspector({ selectedId, classes, width, onResize, onClose, onSelect, sim, content }: {
  selectedId: string | null; classes?: SettlementClass[]; width: number; onResize: (width: number) => void;
  onClose: () => void; onSelect: (id: string) => void; sim?: Simulation; content?: ReactNode;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onResize(Math.min(MAX, Math.max(MIN, drag.current.width + drag.current.x - event.clientX)));
  };
  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize inspector"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; }} />
      <div className="panel-title inspector-title">
        <span>Inspector</span>
        <button type="button" className="icon-btn" aria-label="Close inspector" onClick={onClose}><Icon name="close" size={15} /></button>
      </div>
      <div className="inspector-body">
        {content ?? (!selectedId ? <Empty>Select a settlement, business, trader or person anywhere in the workbench.</Empty>
          : ['journey:', 'travel:', 'caravan:', 'route:'].some((prefix) => selectedId.startsWith(prefix)) && sim?.active
            ? <TravelDetails id={selectedId} sim={sim} onSelect={onSelect} />
          : selectedId.startsWith('business:') && sim?.active ? <BusinessDetails id={selectedId} sim={sim} onSelect={onSelect} />
          : selectedId.startsWith('npc:trader:') && sim?.active ? <TraderDetails id={selectedId} sim={sim} onSelect={onSelect} />
          : selectedId.startsWith('npc:') && sim?.active ? <PersonDetails id={selectedId} sim={sim} onSelect={onSelect} />
          : selectedId.startsWith('event:') && sim?.active ? <EventDetails id={selectedId} sim={sim} onSelect={onSelect} />
          : <SettlementDetails id={selectedId} classes={classes} onSelect={onSelect} sim={sim} />)}
      </div>
    </aside>
  );
}
