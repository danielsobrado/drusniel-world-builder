const COMMON_COMMANDS = ['object.rotate', 'object.duplicate', 'object.delete', 'edit.undo', 'edit.redo', 'view.command-search'];

function pairs(entries) {
  return entries.flatMap(([term, value]) => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = value;
    return [dt, dd];
  });
}

/** Scene counts (top left) and the active workspace's shortcuts (bottom left), drawn over the viewport. */
export class ViewportOverlay {
  constructor(host, editor) {
    this.editor = editor;
    this.element = document.createElement('div');
    this.element.className = 'workspace-viewport-overlay workspace-chrome';
    this.element.innerHTML = '<dl class="workspace-viewport-stats" aria-label="Scene statistics"></dl><dl class="workspace-viewport-keys" aria-label="Shortcuts"></dl>';
    this.stats = this.element.firstElementChild;
    this.keys = this.element.lastElementChild;
    host.append(this.element);
  }

  setShortcuts(ids) {
    const commands = [...new Set([...ids, ...COMMON_COMMANDS])].map((id) => this.editor.commands.get(id))
      .filter((command) => command?.label && command.shortcut);
    this.keys.replaceChildren(...pairs(commands.map(({ shortcut, label }) => [shortcut, label])));
  }

  update(state) {
    const selected = (state.selectedObject ? state.selectedObjectCount ?? 1 : 0) + (state.selectedConstruction ? 1 : 0);
    const values = [
      ['Objects', this.editor.objectMap.size],
      ['Walls', this.editor.controller.constructionStore?.list().length ?? 0],
      ['Selected', selected],
    ];
    const key = values.join();
    if (key === this.key) return;
    this.key = key;
    this.stats.replaceChildren(...pairs(values.map(([label, value]) => [label, value.toLocaleString()])));
  }
}
