// Frozen pre-optimization reference from 392af5ba; preserves event ordering and failure semantics.
import { listEntities } from '../../src/sim/model/worldState.js';
import { planGrainShipment } from '../../src/sim/logistics/shipments.js';

export function referenceMatchTradeOffers(state, definition, { commandId, config, ordinalBase = 0 } = {}) {
  const sells = listEntities(state, 'tradeOffer', { includeDestroyed: false })
    .filter((o) => o.data.kind === 'sell' && o.status === 'active')
    .sort((a, b) => a.data.limitPrice - b.data.limitPrice || a.id.localeCompare(b.id));
  const buys = listEntities(state, 'tradeOffer', { includeDestroyed: false })
    .filter((o) => o.data.kind === 'buy' && o.status === 'active')
    .sort((a, b) => b.data.limitPrice - a.data.limitPrice || a.id.localeCompare(b.id));
  const events = [];
  const reasonCodes = [];
  const shipments = [];
  let ordinal = ordinalBase;
  const used = new Set();

  for (const buy of buys) {
    if (used.has(buy.id)) continue;
    for (const sell of sells) {
      if (used.has(sell.id)) continue;
      if (buy.data.commodityId !== sell.data.commodityId) continue;
      if (buy.data.settlementId === sell.data.settlementId) continue;
      if (buy.data.limitPrice < sell.data.limitPrice) continue;
      const quantity = Math.min(buy.data.quantity, sell.data.quantity);
      if (quantity <= 0) continue;
      try {
        const planned = planGrainShipment(state, definition, {
          commandId: `${commandId}:match`,
          originSettlementId: sell.data.settlementId,
          destinationSettlementId: buy.data.settlementId,
          commodityId: buy.data.commodityId,
          quantity,
          ordinal,
          config,
        });
        events.push(...planned.events);
        const buyRemaining = buy.data.quantity - quantity;
        const sellRemaining = sell.data.quantity - quantity;
        buy.data.quantity = buyRemaining;
        sell.data.quantity = sellRemaining;
        events.push({
          type: 'entity.patched',
          entityIds: [buy.id],
          payload: {
            kind: 'tradeOffer',
            id: buy.id,
            status: buyRemaining > 0 ? 'active' : 'inactive',
            dataPatch: { quantity: buyRemaining },
          },
        });
        events.push({
          type: 'entity.patched',
          entityIds: [sell.id],
          payload: {
            kind: 'tradeOffer',
            id: sell.id,
            status: sellRemaining > 0 ? 'active' : 'inactive',
            dataPatch: { quantity: sellRemaining },
          },
        });
        if (buyRemaining <= 0) used.add(buy.id);
        if (sellRemaining <= 0) used.add(sell.id);
        shipments.push(planned.shipmentId);
        reasonCodes.push({
          code: 'trade_matched',
          buyOfferId: buy.id,
          sellOfferId: sell.id,
          shipmentId: planned.shipmentId,
          quantity,
          buyRemaining,
          sellRemaining,
        });
        ordinal += 3;
        break;
      } catch (error) {
        reasonCodes.push({
          code: 'trade_match_failed',
          buyOfferId: buy.id,
          sellOfferId: sell.id,
          reason: error.code ?? error.message,
        });
      }
    }
  }
  return { events, reasonCodes, shipments, nextOrdinal: ordinal };
}

