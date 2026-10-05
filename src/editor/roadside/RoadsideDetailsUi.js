import { changeRoadsideDetail } from './RoadsideDetailsCommands.js';
import { mountRenderEnhancementsUi } from './RenderEnhancementsUi.js';

/** Selection addresses generated semantics, without reconstructing them from meshes. */
export class RoadsideDetailsUi {
  constructor(view) {
    this.view = view;
    this.root = document.createElement('details'); this.root.className = 'roadside-details';
    const summary = document.createElement('summary'); summary.textContent = 'World details'; this.root.append(summary);
    const label = document.createElement('label'); this.checkbox = document.createElement('input'); this.checkbox.type = 'checkbox';
    this.checkbox.checked = view.enabled; label.append(this.checkbox, ' Place lanterns along town roads'); this.root.append(label);
    this.list = document.createElement('div'); this.root.append(this.list);
    this.checkbox.addEventListener('change', () => {
      const store = view.controller.roadsideDetails, before = store.toDocument();
      store.enabled = this.checkbox.checked; store.revision += 1;
      view.controller.commitHistory({ kind: 'roadside-detail', before, after: store.toDocument(), object: null });
      view.controller.emitMap();
      view.initialize().catch(error => view.controller.emitNotice(error.message, true));
    });
    document.body.append(this.root);
  }
  update() {
    this.root.hidden = this.view.editingVisible === false;
    this.checkbox.checked = this.view.enabled;
    if (this.lastRows === this.view.records && this.lastEnabled === this.view.enabled) return;
    this.lastEnabled = this.view.enabled;
    this.lastRows = this.view.records; this.list.replaceChildren();
    const rows = this.view.enabled ? this.view.records.slice(0, 8) : [];
    if (!rows.length) { this.list.textContent = 'Nearby lanterns appear here on imported town roads.'; return; }
    for (const detail of rows) {
      const row = document.createElement('div'); row.className = 'roadside-detail-row';
      const text = document.createElement('span'); text.textContent = `Road ${detail.routeId} · ${detail.station * 40} m · ${detail.side}`;
      row.append(text);
      for (const [title, promote] of [['Keep as object', true], ['Suppress', false]]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = title;
        button.addEventListener('click', () => {
          try { changeRoadsideDetail(this.view.controller, detail, { promote }); }
          catch (error) { this.view.controller.emitNotice(error.message, true); }
        });
        row.append(button);
      }
      this.list.append(row);
    }
  }
  dispose() { this.root.remove(); }
  attachRenderingSettings(runtime) { mountRenderEnhancementsUi(this.root, runtime); }
}
