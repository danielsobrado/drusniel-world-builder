export function shapeDetailMarkup() {
  return `<div data-shape-section="details"><label>Generated detail<select data-shape-action="detail-select"></select></label>
    <div class="workshop-shape-actions"><button type="button" data-shape-action="detail-suppress">Hide detail</button><button type="button" data-shape-action="detail-reset">Reset detail</button></div>
    <label class="workshop-check"><input type="checkbox" data-shape-action="curve-edit"/>Edit curve control points</label></div>`;
}

export function syncShapeDetailControls(editor) {
  const p = editor.primitive, section = editor.root.querySelector('[data-shape-section="details"]');
  const automatic = editor.resolvedPlans.get(p?.id)?.decorations ?? [];
  const details = [...automatic, ...(p?.suppressed ?? []).filter((key) => key.startsWith('detail:') && !automatic.some((d) => d.id === key))
    .map((id) => ({ id, role: `Hidden ${id.endsWith(':chimney') ? 'chimney' : 'window-box'}`, openingId: id.split(':box-')[1] }))];
  section.hidden = !p;
  if (!details.some((d) => d.id === editor.detailId)) editor.detailId = details[0]?.id;
  const select = section.querySelector('[data-shape-action="detail-select"]');
  select.replaceChildren(...details.map((d) => {
    const option = document.createElement('option'); option.value = d.id; option.textContent = `${d.role} · ${d.openingId ?? 'roof'}`; return option;
  }));
  select.value = editor.detailId ?? '';
  section.querySelector('[data-shape-action="detail-suppress"]').disabled = !editor.detailId || p?.suppressed.includes(editor.detailId);
  section.querySelector('[data-shape-action="detail-reset"]').disabled = !p?.detailOverrides?.some((o) => o.key === editor.detailId) && !p?.suppressed.includes(editor.detailId);
  section.querySelector('[data-shape-action="curve-edit"]').checked = Boolean(editor.curveEditing);
  section.querySelector('[data-shape-action="curve-edit"]').disabled = p?.kind === 'traversal';
}

export function applyShapeDetailInput(editor, event, preview) {
  const action = event.target.dataset.shapeAction;
  if (!['detail-select', 'curve-edit'].includes(action)) return false;
  if (!preview) {
    if (action === 'detail-select') editor.detailId = event.target.value;
    else editor.curveEditing = event.target.checked;
    editor.sync(); editor.onSelection?.(editor.selectedId);
  }
  return true;
}

export function applyShapeDetailAction(editor, action) {
  const p = editor.primitive;
  if (action === 'detail-suppress') editor.session.update(p.id, { suppressed: [...p.suppressed, editor.detailId] });
  else if (action === 'detail-reset') editor.session.update(p.id, {
    detailOverrides: p.detailOverrides.filter((o) => o.key !== editor.detailId), suppressed: p.suppressed.filter((key) => key !== editor.detailId),
  });
  else return false;
  return true;
}
