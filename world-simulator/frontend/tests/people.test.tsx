import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { PersonDetail, PersonRow, ScenarioStatus } from '../src/api/types';
import { PeopleWorkspace } from '../src/people/PeopleWorkspace';
import { PersonDetails } from '../src/people/PersonDetails';
import type { Simulation } from '../src/simulation/useSimulation';
import { date } from './economyFixture';
import { mockApi } from './helpers';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const active = { id: 'baseline-pilot', name: 'Pilot baseline', running: false, readOnly: null, date } as unknown as ScenarioStatus;
const sim = { active, version: 'v1' } as unknown as Simulation;
const row: PersonRow = {
  id: 'npc:113:7', name: 'Rrvhei', family: 'Formen', sex: 'male', birthDay: -17280, age: 48, settlementId: 'settlement:azgaar-burg:113',
  settlementName: 'Falanenerwin', householdId: 'household:113:4', role: 'worker', businessId: 'business:azgaar-burg:113:farm:1',
  workplace: 'Falanenerwin Farm 1', profession: 'farmhand', traderId: null, routeId: null,
  personality: { greed: 0.2, caution: 0.6, honesty: 0.9 }, idleMonths: 0, releaseDay: null, alive: true, deathDay: null, cause: null,
};
const meta = { page: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 }, sort: '', roles: { worker: 50, child: 20, outlaw: 1, imprisoned: 0 },
  deaths: 3, births: 2, arrivals: 1, settlements: [{ id: 'settlement:azgaar-burg:113', name: 'Falanenerwin', budget: 18 }] };

describe('PeopleWorkspace', () => {
  it('lists named people with their work and filters by role', async () => {
    const calls = mockApi({ '/api/scenarios/baseline-pilot/people': { data: [row], meta } });
    const onSelect = vi.fn();
    render(<PeopleWorkspace sim={sim} onSelect={onSelect} selectedId={null} />);
    const table = await screen.findByRole('table', { name: 'People' });
    expect(within(table).getByText('Rrvhei Formen')).toBeTruthy();
    expect(within(table).getByText('farmhand · Falanenerwin Farm 1')).toBeTruthy();
    expect(screen.getByText(/Falanenerwin 18/)).toBeTruthy();
    expect(screen.getByText('3 died')).toBeTruthy();
    fireEvent.click(within(table).getAllByRole('row')[1]);
    expect(onSelect).toHaveBeenCalledWith('npc:113:7');
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'outlaw' } });
    await vi.waitFor(() => expect(calls.at(-1)!.url).toContain('role=outlaw'));
  });
});

describe('PersonDetails', () => {
  it('tells the life story and links household, work and home', async () => {
    const detail: PersonDetail = {
      ...row, route: null,
      events: [{ day: 30, kind: 'hired', text: 'Hired as farmhand at Falanenerwin Farm 1' }, { day: 0, kind: 'introduced', text: 'Lives in Falanenerwin' }],
      household: { id: 'household:113:4', family: 'Formen', kind: 'couple', housing: 'cottage',
        members: [{ id: 'npc:113:8', name: 'Nasharmen', age: 57, role: 'retired', alive: true }] },
    };
    mockApi({ '/api/scenarios/baseline-pilot/people/': detail });
    const onSelect = vi.fn();
    render(<PersonDetails id="npc:113:7" sim={sim} onSelect={onSelect} />);
    await screen.findByText('Rrvhei Formen');
    expect(screen.getByText('The Formen household · cottage')).toBeTruthy();
    const life = screen.getByRole('list', { name: 'Life events' });
    expect(within(life).getAllByRole('listitem')[0].textContent).toContain('Hired as farmhand');
    fireEvent.click(screen.getByText('Nasharmen'));
    expect(onSelect).toHaveBeenCalledWith('npc:113:8');
    fireEvent.click(screen.getByText('farmhand · Falanenerwin Farm 1'));
    expect(onSelect).toHaveBeenCalledWith('business:azgaar-burg:113:farm:1');
  });
});
