import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { EconomyView, ScenarioStatus } from '../src/api/types';
import { EconomyWorkspace } from '../src/economy/EconomyWorkspace';
import { dayLabel } from '../src/economy/format';
import type { Simulation } from '../src/simulation/useSimulation';
import { mockApi } from './helpers';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const date = { day: 60, year: 1212, month: 3, dayOfMonth: 1, label: '1212-03-01' };
const active = { id: 'baseline-pilot', name: 'Pilot baseline', running: false, readOnly: null, date } as unknown as ScenarioStatus;
const sim = { active, version: 'v1' } as unknown as Simulation;
const good = (basePrice: number, price: number, demand: number) =>
  ({ basePrice, price, stock: 10, outsideSupply: 5, outsideDemand: 4, demand, supplied: 5, left: 0 });

const view: EconomyView = {
  date,
  settlements: [{
    settlementId: 'settlement:azgaar-burg:238', name: 'Vhaltha', population: 15747, economy: {
      marketId: 15, travelDays: 0, baselinePopulation: 15747, inventory: { Hemp: 0, Cloth: 2, Rations: 900000 },
      production: [
        { good: 'Cloth', source: 'workshop', units: 6, inputs: { Hemp: 6 }, produced: 0, limitedBy: 'Hemp' },
        { good: 'Sails', source: 'workshop', units: 5.75, inputs: { Cloth: 5.75 }, produced: 5.75, limitedBy: null },
      ],
      consumption: {}, bought: { Cloth: 5.75 }, sold: { Sails: 4 }, shortages: [{ good: 'Hemp', wanted: 6, obtained: 0 }],
      food: { ruralPopulation: 44619, hinterlandCells: 5, local: 238080, hinterland: 267714, eaten: 472410, wanted: 472410,
        security: 1, selfSufficiency: 1.07 },
      treasury: 120.5, tradeBalance: -3.2,
    },
  }],
  markets: [{
    marketId: 15, centerSettlementId: 'settlement:azgaar-burg:238', centerName: 'Vhaltha', centerInScope: true,
    goods: { Hemp: good(0.32, 1.28, 22), Cloth: good(4.91, 5.5, 9), Rations: good(0.0006, 0.0006, 3000) },
    priceHistory: [{ day: 0, prices: { Hemp: 0.32, Cloth: 4.91 } }, { day: 30, prices: { Hemp: 0.8, Cloth: 5.2 } },
      { day: 60, prices: { Hemp: 1.28, Cloth: 5.5 } }],
  }],
  caravans: [{ id: 'caravan:9', kind: 'purchase', marketId: 15, fromId: 'settlement:azgaar-burg:238', fromName: 'Vhaltha',
    toId: 'settlement:azgaar-burg:113', toName: 'Falanenerwin', cargo: { Wood: 2.5 }, value: 1.6, departDay: 60, arriveDay: 67 }],
  delivered: [],
};

describe('EconomyWorkspace', () => {
  it('shows a broken supply chain, the market prices and the caravans on the road', async () => {
    const calls = mockApi({ '/api/scenarios/baseline-pilot/economy': view });
    render(<EconomyWorkspace sim={sim} onSelect={() => {}} />);
    const production = await screen.findByRole('table', { name: 'Production' });
    expect(within(production).getByText('no Hemp')).toBeTruthy();
    expect(within(production).getByText('full output')).toBeTruthy();
    expect(screen.getByText('short: 0 of 6')).toBeTruthy();
    expect(screen.getByText(/44,619 rural inhabitants/)).toBeTruthy();

    const market = screen.getByRole('table', { name: 'Vhaltha market goods' });
    expect(within(market).getByText('+300%')).toBeTruthy();
    expect(within(market).getByText('0.60 /1,000'), 'rations are priced per thousand').toBeTruthy();
    const hemp = within(market).getByLabelText('Chart Hemp') as HTMLInputElement;
    expect(hemp.checked).toBe(true);
    fireEvent.click(hemp.closest('tr')!);
    expect(hemp.checked).toBe(false);

    const road = screen.getByRole('table', { name: 'Caravans on the road' });
    expect(within(road).getByText('Vhaltha → Falanenerwin')).toBeTruthy();
    expect(within(road).getByText(/in 7 days/)).toBeTruthy();
    expect(screen.getByText('No caravan has arrived yet.')).toBeTruthy();
    expect(calls[0].url).toContain('/economy?delivered=30');
  });

  it('turns scenario days into calendar dates', () => {
    expect(dayLabel(67, date)).toBe('1212-03-08');
    expect(dayLabel(360, date)).toBe('1213-01-01');
  });
});
