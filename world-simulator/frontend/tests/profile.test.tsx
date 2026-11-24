import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { BiographyContext, EventDetail, HistoryEventView, ScenarioStatus } from '../src/api/types';
import { EventDetails } from '../src/people/EventDetails';
import { Profile } from '../src/people/Profile';
import type { Simulation } from '../src/simulation/useSimulation';
import { date } from './economyFixture';
import { mockApi } from './helpers';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const active = { id: 'baseline-pilot', name: 'Pilot baseline', running: false, readOnly: null, date } as unknown as ScenarioStatus;
const sim = { active, version: 'v1' } as unknown as Simulation;
const base = '/api/scenarios/baseline-pilot/people/npc%3A113%3A7';

const event = (id: string, summary: string, extra: Partial<HistoryEventView> = {}): HistoryEventView => ({
  id, seq: Number(id.split(':')[1]), day: 0, date: '1190', datePrecision: 'year', kind: 'married', category: 'family',
  source: 'generated-prehistory', settlementId: null, locationId: null, routeId: null, businessId: null, caravanId: null, householdId: null,
  participants: [{ personId: 'npc:113:7', role: 'spouse', name: 'Rrvhei Formen' }], relatedEntities: [], facts: {}, causedBy: [],
  effects: [], importance: 5, visibility: 'settlement', summary, ...extra,
});

const context: BiographyContext = {
  personId: 'npc:113:7', tier: 'standard', asOf: '1213-01-01', targets: { facts: [5, 8], milestones: [5, 10], words: [100, 180] },
  identity: { name: 'Rrvhei Formen', sex: 'male', age: 48, born: '1164', birthplace: 'Olraharit', culture: 'Umbra’kori', ancestry: 'Dark elf', home: 'Falanenerwin',
    alive: true, died: null },
  household: { family: 'Formen', kind: 'couple', housing: 'cottage', homeId: 'building:113:cottage:4', members: ['Nasharmen Formen'] },
  relationships: [], work: { role: 'worker', profession: 'farmhand', workplace: 'Falanenerwin Farm 1', caravanMaster: null },
  circumstances: { townUnemployment: 0.01, foodSecurity: 1, idleMonths: 0 },
  milestones: [{ id: 'event:3', date: '1190', precision: 'year', kind: 'married', summary: 'Rrvhei Formen married Nasharmen Formen',
    source: 'generated-prehistory', role: 'spouse' }],
  settlementHistory: [], places: ['Falanenerwin', 'Olraharit'], knowledge: [],
  personality: { greed: 0.2, caution: 0.6, honesty: 0.9, temperament: 'sociable', values: ['family', 'duty'] },
  outlook: { fears: ['losing family'], ambitions: [], concerns: [], mood: 'settled' },
  hooks: [{ kind: 'family-danger', text: 'Worried about Haerreghr on the road to Vhaltha', basis: 'relative:npc:113:1' }],
  restrictions: ['Use only the facts listed here.'],
};

describe('Profile', () => {
  it('opens tabs for the life timeline and the biography facts', async () => {
    mockApi({
      [`${base}/context`]: context,
      [`${base}/biographies`]: [],
      '/api/llm/jobs': [],
      [`${base}/timeline`]: [event('event:3', 'Rrvhei Formen married Nasharmen Formen'),
        event('event:40', 'Rrvhei Formen: Hired as farmhand', { source: 'simulation', kind: 'hired', category: 'career', causedBy: ['event:39'] })],
    });
    const onSelect = vi.fn();
    render(<Profile sim={sim} personId="npc:113:7" name="Rrvhei Formen" onSelect={onSelect} selectedId={null} />);
    expect(await screen.findByText(/1164 in Olraharit/)).toBeTruthy();
    expect(screen.getByText('Umbra’kori')).toBeTruthy();
    expect(screen.getByText('Dark elf')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Life' }));
    const life = await screen.findByRole('list', { name: 'Life timeline' });
    expect(within(life).getByText('reconstructed past')).toBeTruthy();
    expect(within(life).getByText(/has causes/)).toBeTruthy();
    fireEvent.click(within(life).getByText('Rrvhei Formen: Hired as farmhand'));
    expect(onSelect).toHaveBeenCalledWith('event:40');

    fireEvent.click(screen.getByRole('tab', { name: 'Biography' }));
    expect(await screen.findByText('Worried about Haerreghr on the road to Vhaltha')).toBeTruthy();
    expect(screen.getByText('Use only the facts listed here.')).toBeTruthy();
    expect(screen.getByText(/Regenerating prose never changes these facts/)).toBeTruthy();
    expect(await screen.findAllByText('Not written yet.')).toHaveLength(4);
  });
});

describe('EventDetails', () => {
  it('shows participants, causes and consequences as links', async () => {
    const detail: EventDetail = {
      ...event('event:40', 'Rrvhei Formen: Lost work', { source: 'simulation', kind: 'lost-work', datePrecision: 'month', date: '1213-02-01',
        causedBy: ['event:39'] }),
      causes: [event('event:39', 'Falanenerwin Tavern closed', { source: 'simulation', kind: 'closed', participants: [] })],
      consequences: [event('event:55', 'Rrvhei Formen took to the road', { source: 'simulation', kind: 'outlaw' })],
    };
    mockApi({ '/api/scenarios/baseline-pilot/history/events/': detail });
    const onSelect = vi.fn();
    render(<EventDetails id="event:40" sim={sim} onSelect={onSelect} />);
    await screen.findByText('Rrvhei Formen: Lost work');
    fireEvent.click(screen.getByText(/Falanenerwin Tavern closed/));
    expect(onSelect).toHaveBeenCalledWith('event:39');
    fireEvent.click(screen.getByText(/took to the road/));
    expect(onSelect).toHaveBeenCalledWith('event:55');
    fireEvent.click(screen.getByText('Rrvhei Formen'));
    expect(onSelect).toHaveBeenCalledWith('npc:113:7');
  });
});
