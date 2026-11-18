import { ConstructionInspector } from '../../construction/ui/ConstructionInspector.js';
import { WORLD_TOOLS } from '../commands/EditorCommands.js';

export class WorkspaceInspector {
  constructor(host, editor) {
    this.editor = editor;
    host.innerHTML = `
      <div class="workspace-panel-tabs" role="tablist" aria-label="Inspector">
        <button type="button" role="tab" id="workspace-tab-properties" aria-controls="workspace-panel-properties" data-inspector-tab="properties">Properties</button>
        <button type="button" role="tab" id="workspace-tab-world" aria-controls="workspace-panel-world" data-inspector-tab="world">World</button>
      </div>
      <div class="workspace-properties workspace-world" role="tabpanel" id="workspace-panel-world" aria-labelledby="workspace-tab-world" hidden></div>
      <div class="workspace-properties" role="tabpanel" id="workspace-panel-properties" aria-labelledby="workspace-tab-properties">
        <div data-properties="tool">
          <p class="workspace-property-title"></p>
          <p class="workspace-muted" data-property="tool-details"></p>
        </div>
        <div data-properties="object" hidden>
          <p class="workspace-property-title"></p>
          <p class="workspace-muted" data-property="object-details"></p>
          <label>Cell X <input type="number" step="1" data-coordinate="x"></label>
          <label>Cell Z <input type="number" step="1" data-coordinate="z"></label>
          <label>Rotation <output data-property="angle"></output></label>
          <div class="workspace-property-actions">
            <button type="button" data-command="object.move">Move</button>
            <button type="button" data-command="object.rotate">Rotate</button>
            <button type="button" data-command="object.duplicate">Duplicate</button>
            <button type="button" data-command="selection.focus-object">Focus</button>
            <button type="button" data-command="object.delete">Delete</button>
          </div>
        </div>
        <div data-properties="wall" hidden>
          <button type="button" data-command="construction.delete">Delete wall</button>
        </div>
      </div>`;
    this.host = host;
    this.worldPanel = host.querySelector('#workspace-panel-world');
    this.tabs = [...host.querySelectorAll('[role="tab"]')];
    host.querySelector('[role="tablist"]').addEventListener('click', ({ target }) => {
      const tab = target.closest('[role="tab"]');
      if (tab) this.showTab(tab.dataset.inspectorTab);
    });
    host.querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const index = this.tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
      const next = this.tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + this.tabs.length) % this.tabs.length];
      this.showTab(next.dataset.inspectorTab);
      next.focus();
    });
    this.showTab('properties');
    this.tool = host.querySelector('[data-properties="tool"]');
    this.object = host.querySelector('[data-properties="object"]');
    this.wall = host.querySelector('[data-properties="wall"]');
    this.wallInspector = new ConstructionInspector({
      host: this.wall,
      controller: editor.controller,
      materialStore: editor.controller.constructionMaterialStore,
      onStatus: (message) => editor.showToast(message),
      docked: true,
    });
    this.wall.prepend(this.wallInspector.element);

    const selectedObject = () => editor.objectMap.getById(editor.controller.selectedObjectId);
    const canEditObject = () => Boolean(editor.controller.selectedObjectId) && !editor.controller.isWorldInputBlocked();
    editor.commands.register('selection.focus-object', 'Focus selected object', () => {
      const object = selectedObject();
      if (object) editor.controller.focusCell(object.x, object.z);
    }, { enabled: canEditObject });
    editor.commands.register('object.position', '', ({ id, axis, value }) => {
      const object = selectedObject();
      if (id !== object?.id || !['x', 'z'].includes(axis) || !Number.isSafeInteger(value)) return;
      editor.controller.naturalEditorInteractions.selection.moveTo({ ...object, [axis]: value });
    }, { enabled: () => canEditObject() && Boolean(editor.controller.naturalEditorInteractions) });
    this.coordinates = [...this.object.querySelectorAll('[data-coordinate]')];
    this.object.addEventListener('change', ({ target }) => {
      if (!target.dataset.coordinate) return;
      editor.commands.execute('object.position', {
        id: this.objectId, axis: target.dataset.coordinate, value: target.valueAsNumber,
      });
      target.value = selectedObject()?.[target.dataset.coordinate] ?? '';
    });
  }

  showTab(id) {
    for (const tab of this.tabs) {
      const selected = tab.dataset.inspectorTab === id;
      tab.setAttribute('aria-selected', selected);
      tab.tabIndex = selected ? 0 : -1;
      this.host.querySelector(`#${tab.getAttribute('aria-controls')}`).hidden = !selected;
    }
  }

  render(state) {
    const { selectedObject, selectedConstruction } = state;
    const selection = selectedConstruction ? `wall:${selectedConstruction.id}` : selectedObject ? `object:${selectedObject.id}` : null;
    if (selection && selection !== this.selection) this.showTab('properties');
    this.selection = selection;
    this.tool.hidden = Boolean(selectedObject || selectedConstruction);
    this.object.hidden = !selectedObject;
    this.wall.hidden = !selectedConstruction;
    if (selectedObject) {
      const { id, definitionKey, rotation } = selectedObject;
      this.object.querySelector('.workspace-property-title').textContent = this.editor.objectByKey.get(definitionKey)?.label ?? definitionKey;
      const count = state.selectedObjectCount ?? 1;
      this.object.querySelector('[data-property="object-details"]').textContent = count > 1 ? `${count} objects selected · Primary #${id}` : `Placed object #${id}`;
      this.object.querySelector('[data-property="angle"]').textContent = `${rotation * 90}°`;
      for (const input of this.coordinates) {
        if (id !== this.objectId || input !== document.activeElement) input.value = selectedObject[input.dataset.coordinate];
      }
      this.objectId = id;
    }
    if (selectedConstruction) {
      const { id, revision } = selectedConstruction;
      if (!this.wallInspector.isOpen || this.wallInspector.constructionId !== id || this.wallRevision !== revision) {
        const focused = this.wallInspector.constructionId === id && this.wall.contains(document.activeElement)
          ? document.activeElement.dataset.inspectorField : null;
        this.wallInspector.open(id);
        if (focused) this.wall.querySelector(`[data-inspector-field="${focused}"]`)?.focus({ preventScroll: true });
        this.wallRevision = revision;
      }
    } else this.wallInspector.close();
    if (!this.tool.hidden) {
      this.tool.querySelector('.workspace-property-title').textContent = WORLD_TOOLS[state.tool] ?? '';
      this.tool.querySelector('[data-property="tool-details"]').textContent = state.tool === 'select'
        ? 'Select an object or wall in the viewport or outliner.' : this.editor.selection.textContent;
    }
  }

  dispose() {
    this.wallInspector.dispose();
  }
}
