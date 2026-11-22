import { useRef, type PointerEvent } from 'react';
import type { SettlementClass } from '../api/types';
import type { Simulation } from '../simulation/useSimulation';
import { Icon } from './Icon';
import { SettlementDetails } from '../components/SettlementDetails';
import { Empty } from '../components/StateViews';

const MIN = 280;
const MAX = 640;

/** The one shared inspector: whatever is selected anywhere shows here. Drag the left edge to resize. */
export function Inspector({ selectedId, classes, width, onResize, onClose, onSelect, sim }: {
  selectedId: string | null; classes?: SettlementClass[]; width: number; onResize: (width: number) => void;
  onClose: () => void; onSelect: (id: string) => void; sim?: Simulation;
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
        {selectedId
          ? <SettlementDetails id={selectedId} classes={classes} onSelect={onSelect} sim={sim} />
          : <Empty>Select a settlement in the table, atlas, explorer tree or pilot view.</Empty>}
      </div>
    </aside>
  );
}
