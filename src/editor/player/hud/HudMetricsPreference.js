export const HUD_METRICS_STORAGE_KEY = 'world.hud.metrics.v1';
export const HUD_METRICS_EVENT = 'world:hud-metrics';
export function readHudMetricsPreference(storage) {
  try {return (storage??globalThis.localStorage)?.getItem(HUD_METRICS_STORAGE_KEY)==='true';}catch{return false;}
}
export function writeHudMetricsPreference(value,{storage,target=globalThis.document}={}) {
  const enabled=Boolean(value);
  try {(storage??globalThis.localStorage)?.setItem(HUD_METRICS_STORAGE_KEY,String(enabled));}catch{ /* Storage is optional. */ }
  target?.dispatchEvent(new CustomEvent(HUD_METRICS_EVENT,{detail:{enabled}}));
  return enabled;
}
