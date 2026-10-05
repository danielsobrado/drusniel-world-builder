/** Graph changes use the existing scene-settings reload handoff, preserving the world. */
export function mountRenderEnhancementsUi(root, runtime) {
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend'); legend.textContent = 'Visual quality'; fieldset.append(legend);
  const settings = runtime.config.stylizedSurface.enhancements;
  const controls = new Map();
  for (const [key, title, checked] of [
    ['cube', 'Local water reflections', settings.waterReflections.enabled],
    ['planar', 'Flat-water reflections', settings.waterReflections.planar],
    ['shadows', 'Long-range sun shadows', settings.shadowCascades === 2],
    ['snow', 'Snow surface relief', settings.snowRelief],
  ]) {
    const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked;
    input.disabled = innerWidth < 768 && key !== 'snow';
    label.append(input, ` ${title}`); fieldset.append(label); controls.set(key, input);
  }
  const note = document.createElement('p'); note.textContent = 'Applying quality reloads the world and preserves your edits.'; fieldset.append(note);
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Apply visual settings';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await runtime.setRenderEnhancements({ ...settings,
      waterReflections: { ...settings.waterReflections, enabled: controls.get('cube').checked, planar: controls.get('planar').checked },
      shadowCascades: controls.get('shadows').checked ? 2 : 1, snowRelief: controls.get('snow').checked }); }
    catch (error) { runtime.controller.emitNotice(error.message, true); button.disabled = false; }
  });
  fieldset.append(button); root.append(fieldset);
}
