import { restoreWorldSnapshot, createCommandJournal, createEventHistory } from './snapshot.js';
import { SimulationHistory, boundedReasonLog } from './SimulationHistory.js';
import { createLedger } from '../economy/stockFlow.js';
import { createLodController } from '../lod/simLod.js';
import { listEntities } from '../model/worldState.js';

/** Isolated replay state; the live world adopts it only after complete success. */
export function createSimulationReplay({ snapshot, sequence, dispatcher, config, store }) {
  const restored = restoreWorldSnapshot(snapshot), ledger = createLedger(), lod = createLodController(config);
  for (const settlement of listEntities(restored.state, 'settlement', { includeDestroyed: true })) {
    lod.setTier(settlement.id, settlement.data.simTier ?? 'A');
  }
  const snapshotSequence = snapshot.commandRange?.sequence ?? snapshot.commandRange?.count ?? 0;
  if (!Number.isSafeInteger(snapshotSequence) || snapshotSequence < 0) throw new Error('invalid_snapshot:command_sequence');
  const journal = createCommandJournal(), history = new SimulationHistory({ journal, store, config: config.persistence });
  const stage = { definition: restored.definition, state: restored.state, ledger, lod, journal, history,
    events: createEventHistory(), reasons: boundedReasonLog(config.persistence.maximumReasonLogEntries),
    sequence: Math.max(sequence, snapshotSequence), count: 0 };
  stage.apply = command => {
    if (!history.canAccept()) return { ok: false, code: 'history_archive_backpressure' };
    const result = dispatcher.dispatch(stage.state, command, { definition: stage.definition, config, ledger, lod });
    if (!result.ok) return result;
    stage.state = result.state; stage.count++;
    history.append(command);
    for (const event of result.events) stage.events.append(event, { important: true });
    const suffix = `:${stage.definition.worldId}:`, index = command.id.lastIndexOf(suffix);
    if (index >= 0) {
      const value = Number(command.id.slice(index + suffix.length));
      if (Number.isSafeInteger(value) && value >= 0) stage.sequence = Math.max(stage.sequence, value);
    }
    if (result.result?.reasonCodes) stage.reasons.push(...result.result.reasonCodes);
    return result;
  };
  return stage;
}
