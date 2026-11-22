import { useRef } from 'react';
import { Icon } from './Icon.jsx';
import { SettlementDetails } from '../components/SettlementDetails.jsx';
import { Empty } from '../components/StateViews.jsx';

const MIN = 280;
const MAX = 640;

/** The one shared inspector: whatever is selected anywhere shows here. Drag the left edge to resize. */
export function Inspector({ selectedId, classes, width, onResize, onClose, onSelect }) {
  const drag = useRef(null);
  const onPointerDown = (event) => {
    drag.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event) => {
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
          ? <SettlementDetails id={selectedId} classes={classes} onSelect={onSelect} />
          : <Empty>Select a settlement in the table, atlas, explorer tree or pilot view.</Empty>}
      </div>
    </aside>
  );
}
