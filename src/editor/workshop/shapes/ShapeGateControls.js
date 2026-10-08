export function shapeGateMarkup() {
  return `<div data-shape-section="gates">
    <label class="workshop-check"><input type="checkbox" data-shape-field="automaticGates"/>Create gates where paths cross</label>
    <label>Generated gate<select data-shape-action="gate-select"></select></label>
    <div class="workshop-shape-actions"><button type="button" data-shape-action="pin-gate">Keep as opening</button><button type="button" data-shape-action="hide-gate">Hide gate</button><button type="button" data-shape-action="reset-gates">Restore hidden gates</button></div>
    <p class="workshop-shape-hint">A path crossing a low wall makes a gap; a taller wall makes an arch. Kept openings remain editable when you move the path.</p>
  </div>`;
}

export function promoteShapeGate(session, hostId, gate) {
  const host = session.getPrimitive(hostId);
  let n = 1;
  while (host.openings.some((o) => o.id === `opening-${n}`)) n++;
  const id = `opening-${n}`;
  session.update(hostId, {
    openings: [
      ...host.openings,
      {
        id,
        role: gate.role,
        profile: gate.profile,
        at: gate.at,
        width: gate.width,
        height: gate.height,
        bottom: gate.bottom,
        promotedFrom: gate.derivationKey,
      },
    ],
    suppressed: [...host.suppressed, gate.derivationKey],
  });
  return id;
}

export function syncShapeGateControls(editor) {
  const p = editor.primitive;
  const root = editor.root,
    gates = editor.resolvedPlans?.get(p.id)?.automaticOpenings ?? [];
  root.querySelector('[data-shape-section="gates"]').hidden = p.kind !== 'curved-wall';
  if (!gates.some((gate) => gate.derivationKey === editor.gateKey))
    editor.gateKey = gates[0]?.derivationKey;
  const select = root.querySelector('[data-shape-action="gate-select"]');
  select.replaceChildren();
  for (const gate of gates) {
    const option = document.createElement('option');
    option.value = gate.derivationKey;
    option.textContent = `Path gate · ${gate.provenance.sourceEntityIds[1]}`;
    select.append(option);
  }
  select.value = editor.gateKey ?? '';
  select.disabled = !gates.length;
  for (const action of ['pin-gate', 'hide-gate'])
    root.querySelector(`[data-shape-action="${action}"]`).disabled = !editor.gateKey;
  root.querySelector('[data-shape-action="reset-gates"]').disabled = !p.suppressed.some((key) =>
    key.startsWith(`gate:${p.id}:`),
  );
}

export function applyShapeGateAction(editor, action) {
  if (!['pin-gate', 'hide-gate', 'reset-gates'].includes(action)) return false;
  const p = editor.primitive,
    session = editor.session;
  const gate = editor.resolvedPlans
    .get(p.id)
    ?.automaticOpenings.find((g) => g.derivationKey === editor.gateKey);
  if (action === 'reset-gates')
    session.update(p.id, {
      suppressed: p.suppressed.filter((key) => !key.startsWith(`gate:${p.id}:`)),
    });
  else if (gate && action === 'hide-gate')
    session.update(p.id, { suppressed: [...p.suppressed, gate.derivationKey] });
  else if (gate) editor.openingId = promoteShapeGate(session, p.id, gate);
  return true;
}
