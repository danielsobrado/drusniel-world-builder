import { WorkshopCommandBus } from '../kernel/WorkshopCommandBus.js';
import { WorkshopHistory } from '../history/WorkshopHistory.js';
import { WorkshopPreviewTransaction } from '../kernel/WorkshopPreviewTransaction.js';
import { createWorkshopDocumentFromRecipe } from '../kernel/WorkshopRecipeBridge.js';
import {
  createWorkshopCompositionEntities,
  readWorkshopComposition,
  workshopCompositionEntityId,
} from '../model/composition/WorkshopCompositionEntities.js';
import { normalizeWorkshopComposition } from '../ProceduralWorkshopComposition.js';
import { createShapePreset } from './ShapePresets.js';
import { shapeCapability } from './ShapeRegistry.js';
import { shapeRecord } from './ShapeValidation.js';

function validateComposition(composition) {
  const normalized = normalizeWorkshopComposition(composition);
  if (!normalized?.primitives.length) throw new Error('Keep at least one construction shape.');
  if (normalized.primitives.some((p) => !shapeCapability(p.kind)))
    throw new Error('The shape editor requires registered construction shapes.');
  return normalized;
}

export class WorkshopShapeSession {
  constructor(composition = createShapePreset('rounded-cottage')) {
    this.bus = new WorkshopCommandBus(createWorkshopDocumentFromRecipe({
      composition: validateComposition(composition),
    }));
    this.history = new WorkshopHistory(this.bus);
    this.transaction = null;
  }
  get document() {
    return this.transaction?.previewDocument ?? this.bus.document;
  }
  get composition() {
    return readWorkshopComposition(this.document);
  }
  get primitives() {
    return this.composition.primitives;
  }
  getPrimitive(id) {
    return this.document.getEntity(workshopCompositionEntityId(id))?.properties.primitive ?? null;
  }
  begin(label = 'Reshape construction') {
    if (!this.transaction) this.transaction = new WorkshopPreviewTransaction(this.bus, label);
  }
  update(id, changes) {
    const current = this.getPrimitive(id);
    if (!current) throw new Error(`Unknown shape: ${id}.`);
    shapeRecord(changes, 'Shape changes');
    if (changes.id !== undefined && changes.id !== id)
      throw new Error('A shape update cannot change its identity.');
    if (changes.kind !== undefined && changes.kind !== current.kind)
      throw new Error('A shape update cannot change its kind.');
    const primitive = normalizeWorkshopComposition({
      primitives: [{ ...current, ...changes }],
    }).primitives[0];
    const entity = createWorkshopCompositionEntities({
      primitives: [primitive],
    })[0];
    const command = {
      type: 'entity.put',
      entity,
      label: 'Reshape construction',
    };
    return this.transaction ? this.transaction.dispatch(command) : this.bus.dispatch(command);
  }
  replace(composition, label = 'Choose construction') {
    const next = createWorkshopCompositionEntities(validateComposition(composition));
    this.cancel();
    const current = this.primitives;
    return this.bus.dispatch({
      type: 'document.batch',
      label,
      commands: [
        ...current.map((p) => ({
          type: 'entity.remove',
          id: workshopCompositionEntityId(p.id),
        })),
        ...next.map((entity) => ({ type: 'entity.put', entity })),
      ],
    });
  }
  add(primitive) {
    shapeRecord(primitive, 'Shape');
    if (this.getPrimitive(primitive.id)) throw new Error(`Duplicate shape id: ${primitive.id}.`);
    validateComposition({
      primitives: [...this.primitives, primitive],
    });
    const entity = createWorkshopCompositionEntities({
      primitives: [primitive],
    })[0];
    this.commit();
    return this.bus.dispatch({
      type: 'entity.put',
      entity,
      label: 'Add construction',
    });
  }
  remove(id) {
    if (!this.getPrimitive(id)) throw new Error(`Unknown shape: ${id}.`);
    if (this.primitives.length <= 1) throw new Error('Keep at least one construction shape.');
    this.commit();
    return this.bus.dispatch({
      type: 'entity.remove',
      id: workshopCompositionEntityId(id),
      label: 'Remove construction',
    });
  }
  commit() {
    if (!this.transaction) return null;
    const result = this.transaction.commit();
    this.transaction = null;
    return result;
  }
  cancel() {
    if (!this.transaction) return null;
    const result = this.transaction.cancel();
    this.transaction = null;
    return result;
  }
  undo() {
    this.cancel();
    return this.history.undo();
  }
  redo() {
    this.cancel();
    return this.history.redo();
  }
  captureRuntimeState() {
    return {
      composition: readWorkshopComposition(this.bus.document),
      history: this.history.captureRuntimeState(),
    };
  }
  restoreRuntimeState(state) {
    this.replace(state.composition);
    this.history.restoreRuntimeState(state.history);
  }
  dispose() {
    this.cancel();
    this.history.dispose();
  }
}
