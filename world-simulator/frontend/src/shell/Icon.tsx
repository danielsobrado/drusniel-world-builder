// Stroke icons on a 24px grid, drawn to share one weight and style.
const PATHS: Record<string, string> = {
  overview: 'M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-4H4z',
  atlas: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  settlements: 'M3 20h18M5 20V10l4-3 4 3v10M13 20v-6h6v6M8 13h2M8 16h2',
  budget: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a2.5 2.5 0 1 0 0-5M18 14c2.4.6 4 2.9 4 6',
  pilot: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z',
  panelLeft: 'M4 4h16v16H4zM9 4v16',
  panelRight: 'M4 4h16v16H4zM15 4v16',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  chevron: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  play: 'M7 5l12 7-12 7z',
  pause: 'M8 5v14M16 5v14',
};

export function Icon({ name, size = 18, title }: { name: string; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
