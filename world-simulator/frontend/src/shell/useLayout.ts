import type { Workspace } from './workspaces';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'drusniel-world-simulator.layout.v1';
export interface Layout { workspace: string; leftOpen: boolean; rightOpen: boolean; rightWidth: number }

const DEFAULT: Layout = { workspace: 'overview', leftOpen: true, rightOpen: true, rightWidth: 360 };

function read(): Layout {
  // Phones start with both side panels closed so the workspace is visible first.
  const base = typeof window !== 'undefined' && window.innerWidth < 900 ? { ...DEFAULT, leftOpen: false, rightOpen: false } : DEFAULT;
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return base;
  }
}

/** Panel state saved per browser; storage failures fall back to the default layout. */
export function useLayout() {
  const [layout, setLayout] = useState<Layout>(read);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch { /* private mode: layout is not remembered */ }
  }, [layout]);
  const update = useCallback((patch: Partial<Layout>) => setLayout((l) => ({ ...l, ...patch })), []);
  const reset = useCallback(() => setLayout(read()), []);
  return { layout, update, reset };
}

/** 1–n switch workspace, [ and ] toggle the side panels, / focuses search. */
export function useShortcuts({ workspaces, update, layout }: {
  workspaces: readonly Workspace[]; update: (patch: Partial<Layout>) => void; layout: Layout;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest?.('input, select, textarea')) return;
      const index = Number(event.key) - 1;
      if (workspaces[index]) update({ workspace: workspaces[index].id });
      else if (event.key === '[') update({ leftOpen: !layout.leftOpen });
      else if (event.key === ']') update({ rightOpen: !layout.rightOpen });
      else if (event.key === '/') {
        event.preventDefault();
        update({ leftOpen: true });
        requestAnimationFrame(() => document.getElementById('explorer-search')?.focus());
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [workspaces, update, layout.leftOpen, layout.rightOpen]);
}
