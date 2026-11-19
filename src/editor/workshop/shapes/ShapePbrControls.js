import { BUILTIN_WORKSHOP_MATERIAL_PRESETS } from '../ProceduralWorkshopMaterialConfig.js';
import { WORKSHOP_PBR_PRESET_LIST } from '../ProceduralWorkshopPbrPresets.js';

const PBR_SLOTS = Object.freeze([
  { family: 'trim', label: 'Stone, masonry & crown' },
  { family: 'walls', label: 'Wall core & mortar' },
  { family: 'roof', label: 'Roof & parapet deck' },
  { family: 'inserts', label: 'Doors & timber' },
  { family: 'metal', label: 'Iron & metalwork' },
]);

function groupedPresetOptions() {
  const groups = new Map();
  for (const preset of WORKSHOP_PBR_PRESET_LIST) {
    const key = `PBR · ${preset.category}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(preset);
  }
  const village = [];
  const classic = [];
  for (const preset of Object.values(BUILTIN_WORKSHOP_MATERIAL_PRESETS)) {
    if (preset.pbrAsset) continue;
    if (preset.proceduralSurface) village.push(preset);
    else classic.push(preset);
  }
  if (village.length) groups.set('Village procedural surfaces', village);
  if (classic.length) groups.set('Classic procedural tones', classic);
  const options = ['<option value="">Default procedural</option>'];
  for (const [label, items] of groups) {
    options.push(
      `<optgroup label="${label}">${items.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}</optgroup>`,
    );
  }
  return options.join('');
}

export function shapePbrMarkup() {
  const options = groupedPresetOptions();
  return `<div class="workshop-shape-fields" data-shape-section="pbr">
    ${PBR_SLOTS.map(({ family, label }) => `<label>${label}<select data-pbr-region="${family}">${options}</select></label>`).join('')}
    <div class="workshop-shape-actions">
      <button type="button" data-shape-action="pbr-sync-stone">Match stone to deck</button>
      <button type="button" data-shape-action="pbr-reset">Reset shape PBR</button>
      <button type="button" data-shape-action="pbr-open-painter">Paint &amp; custom PBR maps…</button>
    </div>
    <p class="workshop-shape-hint">Full-PBR presets load Albedo, Normal &amp; Roughness/AO maps on demand and persist when baked into the world.</p>
  </div>`;
}

export function syncShapePbrControls(editor) {
  const p = editor.primitive;
  const doc = editor.onGetMaterials?.();
  if (!p) return;
  for (const select of editor.root.querySelectorAll('[data-pbr-region]')) {
    const family = select.dataset.pbrRegion;
    const regionId = `${p.id}:${family}`;
    const current = doc?.materialAreaOverrides?.[regionId] ?? '';
    if (current && !Array.from(select.options).some((opt) => opt.value === current)) {
      const custom = doc?.materialLibrary?.presets?.[current];
      const option = document.createElement('option');
      option.value = current;
      option.textContent = custom?.label ?? current;
      select.append(option);
    }
    select.value = current;
  }
}

export function applyShapePbrInput(editor, event, preview) {
  const family = event.target.dataset.pbrRegion;
  if (!family) return false;
  if (preview) return true;
  const p = editor.primitive;
  if (!p) return true;
  const presetId = event.target.value;
  const overrides = { [`${p.id}:${family}`]: presetId || null };
  // For flat-top towers, syncing trim stone onto parapet deck keeps battlements cohesive when deck has no override.
  if (family === 'trim' && p.crown && p.crown.style !== 'none') {
    const doc = editor.onGetMaterials?.();
    if (!doc?.materialAreaOverrides?.[`${p.id}:deck`]) {
      overrides[`${p.id}:deck`] = presetId || null;
    }
  }
  editor.onSetMaterialOverrides?.(overrides, presetId ? `Applied ${presetId} PBR material.` : 'Returned area to procedural material.');
  editor.changed();
  return true;
}

export function applyShapePbrAction(editor, action) {
  const p = editor.primitive;
  if (!p) return false;
  if (action === 'pbr-sync-stone') {
    const doc = editor.onGetMaterials?.();
    const stone = doc?.materialAreaOverrides?.[`${p.id}:trim`] ?? '';
    if (!stone) {
      editor.onStatus?.('Choose a Stone, masonry & crown PBR texture first.', false);
      return true;
    }
    editor.onSetMaterialOverrides?.({ [`${p.id}:deck`]: stone, [`${p.id}:supports`]: stone }, 'Matched stone PBR to deck and supports.');
    return true;
  }
  if (action === 'pbr-reset') {
    const overrides = {};
    for (const family of ['trim', 'walls', 'roof', 'deck', 'inserts', 'metal', 'supports', 'rails']) {
      overrides[`${p.id}:${family}`] = null;
    }
    editor.onSetMaterialOverrides?.(overrides, 'Shape PBR overrides cleared.');
    return true;
  }
  if (action === 'pbr-open-painter') {
    editor.onOpenMaterialMode?.();
    return true;
  }
  return false;
}
