import type { HistoryEventView } from '../api/types';

/** API shapes of the Validation Lab (PR8). */

export interface InterventionTargets {
  settlements: { id: string; name: string; granary: number }[];
  businesses: { id: string; name: string; kind: string; good: string | null; settlement: string; filled: number; named: number }[];
  routes: { id: string; name: string; mode: 'land' | 'sea'; bandits: number }[];
}

export interface ReplayResult {
  replayable: boolean; reason?: string; matches?: boolean; seconds?: number; commands?: number; date?: string;
  state?: { live: string; replayed: string; matches: boolean };
  history?: { live: string; replayed: string; liveCount: number; replayedCount: number; matches: boolean };
}

export interface Check { id: string; label: string; passed: boolean; checked: number; problems: string[]; problemCount: number }
export interface Validation { passed: boolean; checks: Check[]; replayable: boolean; seconds: number; date: string }

export interface Pair { a: number | null; b: number | null; delta: number | null }
export interface PersonState { alive: boolean; role: string; settlement: string; workplace: string | null }
export interface Comparison {
  a: { scenarioId: string; snapshotId: string | null; name: string };
  b: { scenarioId: string; snapshotId: string | null; name: string };
  dates: { a: string; b: string; same: boolean };
  settlements: { settlementId: string; name: string; measures: Record<string, Pair>; production: ({ good: string } & Pair)[] }[];
  routes: { routeId: string; name: string; mode: string; bandits: Pair }[];
  people: { compared: number; onlyA: number; onlyB: number; changedBy: Record<string, number>; changedCount: number;
    changed: { personId: string; name: string; changed: string[]; a: PersonState; b: PersonState }[] };
  history: { shared: number; afterA: number; afterB: number; kinds: ({ kind: string } & Pair)[];
    notableA: Notable[]; notableB: Notable[] };
}
export interface Notable { id: string; date: string; kind: string; source: string; summary: string }

export interface Trace { root: string; nodes: (HistoryEventView & { depth: number })[]; edges: [string, string][] }

export interface Stats { mean: number | null; p95: number | null; last: number | null }
export interface Metrics {
  steps: { count: number; months: number; msPerMonth: Stats; phases?: Record<string, Stats>; recent: { day: number; days: number; months: number; ms: number; events: number }[] };
  size: { people: number; alive: number; relationships: number; events: number; stateKb: number; journal: number | null };
  llm: { calls: number; byKind: Record<string, { count: number } & Stats>; recent: { kind: string; seconds: number; model: string }[] };
}
