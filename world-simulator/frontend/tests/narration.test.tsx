import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ChatPanel } from '../src/narration/ChatPanel';
import { ProseSection } from '../src/narration/ProseSection';
import { mockApi } from './helpers';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const people = '/api/scenarios/baseline-pilot/people/npc%3A113%3A1';

describe('ProseSection', () => {
  it('shows written prose with its model, staleness and fact-check warnings, and queues rewrites', async () => {
    const calls = mockApi({
      [`${people}/biographies`]: (_url: string, init?: RequestInit) => init?.method === 'POST' ? [{ id: 1 }] : [
        { person: 'npc:113:1', kind: 'short', text: 'Haerreghr Yuethe crossed the roads for thirty years.', provider: 'local-llm',
          model: 'qwen2.5:3b', created: '2026-11-23T10:00:00', warnings: ['names the record does not know: Zorblax'], stale: true },
      ],
      '/api/llm/jobs': [],
    });
    render(<ProseSection scenarioId="baseline-pilot" personId="npc:113:1" />);
    const card = await screen.findByRole('article', { name: 'Short biography' });
    await within(card).findByText(/crossed the roads/);
    expect(within(card).getByText('stale')).toBeTruthy();
    expect(within(card).getByText(/qwen2.5:3b/)).toBeTruthy();
    expect(within(card).getByText(/Zorblax/)).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Regenerate' }));
    await vi.waitFor(() => expect(calls.some((c) => c.init?.method === 'POST' && String(c.init?.body).includes('"short"'))).toBe(true));
  });
});

describe('ChatPanel', () => {
  it('starts a conversation and shows the reply and its source', async () => {
    const calls = mockApi({
      [`${people}/conversations`]: (_url: string, init?: RequestInit) => init?.method === 'POST'
        ? { id: 7, person: 'npc:113:1', title: 'Talk', day: 60 } : [],
      '/api/scenarios/baseline-pilot/conversations/7/messages': [
        { id: 1, role: 'user', text: 'Any news?', provider: null, model: null, warnings: [] },
        { id: 2, role: 'npc', text: 'They say bandits robbed a caravan.', provider: 'draft', model: 'draft writer', warnings: [] },
      ],
    });
    render(<ChatPanel scenarioId="baseline-pilot" personId="npc:113:1" name="Haerreghr Yuethe" />);
    fireEvent.change(await screen.findByLabelText('Say something to Haerreghr Yuethe'), { target: { value: 'Any news?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Say' }));
    const log = screen.getByRole('log', { name: 'Conversation with Haerreghr Yuethe' });
    expect(await within(log).findByText('They say bandits robbed a caravan.')).toBeTruthy();
    expect(within(log).getByText('draft writer, no model')).toBeTruthy();
    expect(calls.filter((c) => c.init?.method === 'POST').map((c) => c.url)).toEqual([
      `${people}/conversations`, '/api/scenarios/baseline-pilot/conversations/7/messages']);
  });
});
