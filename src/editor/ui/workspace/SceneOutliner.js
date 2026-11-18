import { naturalEditorIcon } from '../NaturalEditorIcons.js';

function group(key, label, icon, children) {
  return { key, label, icon, children };
}

export function authoredSceneTree(objectMap, constructionStore, definitions) {
  const categories = new Map();
  for (const object of objectMap.list()) {
    const definition = definitions.get(object.definitionKey);
    const category = definition?.category ?? 'other';
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category).push({
      key: `object:${object.id}`, kind: 'object', id: object.id, icon: 'decor',
      label: definition?.label ?? object.definitionKey, detail: `#${object.id}`,
    });
  }
  const objects = [...categories].sort(([a], [b]) => a.localeCompare(b)).map(([category, children]) => (
    group(`category:${category}`, category[0].toUpperCase() + category.slice(1), category === 'nature' ? 'nature' : 'decor', children)
  ));
  const walls = constructionStore?.list().map(({ id, label }) => ({
    key: `construction:${id}`, kind: 'construction', id, label, icon: 'wall', detail: id,
  })) ?? [];
  return [group('world', 'World', 'structures', [
    { key: 'terrain', label: 'Terrain', icon: 'terrain', command: 'tool.terrain' },
    group('constructions', 'Constructions', 'wall', walls),
    group('objects', 'Placed objects', 'decor', objects),
  ])];
}

export function flattenSceneTree(nodes, expanded, query) {
  const rows = [];
  function visit(entries, filter, parent, depth) {
    for (const node of entries) {
      const matches = !filter || `${node.label} ${node.detail ?? ''}`.toLowerCase().includes(filter);
      const open = Boolean(node.children && (query || expanded.has(node.key)));
      const index = rows.length;
      rows.push({ ...node, parent, depth, open });
      if (open) visit(node.children, matches ? '' : filter, node.key, depth + 1);
      if (!matches && rows.length === index + 1) rows.pop();
    }
  }
  visit(nodes, query, null, 1);
  return rows;
}

export function sceneRowWindow(count, rowHeight, scrollTop, height) {
  const overscan = 4;
  return [Math.max(0, Math.floor(scrollTop / rowHeight) - overscan),
    Math.min(count, Math.ceil((scrollTop + height) / rowHeight) + overscan)];
}

export class SceneOutliner {
  constructor(host, editor) {
    this.editor = editor;
    this.host = host;
    this.expanded = new Set(['world', 'constructions', 'objects']);
    this.rowHeight = 26;
    this.rows = [];
    this.selected = new Set();
    this.dirty = true;
    host.innerHTML = `
      <h2 class="workspace-panel-heading" id="scene-outliner-heading">Scene Outliner</h2>
      <div class="workspace-filter"><input type="search" placeholder="Filter scene…" aria-label="Filter scene"></div>
      <div class="workspace-tree" tabindex="0" role="tree" aria-labelledby="scene-outliner-heading" aria-multiselectable="true">
        <div class="workspace-tree-space" role="presentation"></div>
      </div>
      <p class="workspace-empty" hidden>No matching entities.</p>`;
    this.search = host.querySelector('input');
    this.list = host.querySelector('[role="tree"]');
    this.spacer = this.list.firstElementChild;
    this.empty = host.querySelector('.workspace-empty');
    this.search.addEventListener('input', () => this.rebuild());
    this.search.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      this.list.focus();
    });
    this.list.addEventListener('scroll', () => this.paint(), { passive: true });
    this.list.addEventListener('keydown', (event) => this.onKeyDown(event));
    this.list.addEventListener('click', (event) => {
      const item = event.target.closest('[data-row]');
      if (!item) return;
      this.setCursor(Number(item.dataset.row));
      this.activate(this.rows[this.cursor], event.shiftKey);
    });
    this.resize = new ResizeObserver(() => this.paint());
    this.resize.observe(this.list);
    this.unsubscribe = editor.controller.constructionStore?.subscribe((change) => {
      if (change.kind === 'update' && change.before.label === change.after.label) return;
      this.dirty = true;
      this.update(this.state);
    });
  }

  update(state) {
    this.state = state;
    if (!state || this.host.hidden || !this.host.getClientRects().length) return;
    const { objectMap, objectByKey, controller } = this.editor;
    const primary = state.selectedConstruction ? `construction:${state.selectedConstruction.id}`
      : state.selectedObject ? `object:${state.selectedObject.id}` : null;
    const selected = new Set((state.selectedObjects ?? []).map(({ id }) => `object:${id}`));
    if (primary) selected.add(primary);
    const selectionChanged = selected.size !== this.selected.size || [...selected].some((key) => !this.selected.has(key));
    this.selected = selected;
    const reveal = primary && primary !== this.primary;
    this.primary = primary;
    if (reveal) {
      this.expanded.add('world');
      this.expanded.add(state.selectedConstruction ? 'constructions' : 'objects');
      const category = objectByKey.get(state.selectedObject?.definitionKey)?.category;
      if (category) this.expanded.add(`category:${category}`);
    }
    if (this.dirty || this.objectRevision !== objectMap.revision || this.definitions !== objectByKey) {
      this.source = authoredSceneTree(objectMap, controller.constructionStore, objectByKey);
      this.objectRevision = objectMap.revision;
      this.definitions = objectByKey;
      this.dirty = false;
      this.rebuild();
    } else if (reveal) this.rebuild();
    if (reveal) this.setCursor(this.rows.findIndex(({ key }) => key === primary));
    else if (selectionChanged) this.paint();
  }

  rebuild() {
    if (!this.source) return;
    const cursorKey = this.rows[this.cursor]?.key;
    const query = this.search.value.trim().toLowerCase();
    this.rows = flattenSceneTree(this.source, this.expanded, query);
    this.cursor = Math.max(0, this.rows.findIndex(({ key }) => key === cursorKey));
    this.spacer.style.height = `${this.rows.length * this.rowHeight}px`;
    this.empty.hidden = this.rows.length !== 0;
    this.paint();
  }

  paint() {
    const [start, end] = sceneRowWindow(this.rows.length, this.rowHeight, this.list.scrollTop, this.list.clientHeight);
    const fragment = document.createDocumentFragment();
    for (let index = start; index < end; index += 1) {
      const row = this.rows[index];
      const item = document.createElement('div');
      item.id = `workspace-scene-row-${index}`;
      item.className = 'workspace-tree-row';
      item.dataset.row = index;
      item.setAttribute('role', 'treeitem');
      item.setAttribute('aria-level', row.depth);
      item.setAttribute('aria-selected', this.selected.has(row.key));
      if (row.children?.length) item.setAttribute('aria-expanded', row.open);
      item.classList.toggle('is-cursor', index === this.cursor);
      item.style.top = `${index * this.rowHeight}px`;
      item.style.paddingInlineStart = `${8 + (row.depth - 1) * 14}px`;
      item.innerHTML = `<span aria-hidden="true">${row.children?.length ? (row.open ? '▾' : '▸') : ''}</span>${naturalEditorIcon(row.icon)}<span class="workspace-tree-label"></span><small></small>`;
      item.querySelector('.workspace-tree-label').textContent = row.label;
      item.querySelector('small').textContent = row.detail ?? row.children?.length ?? '';
      item.title = row.label;
      fragment.append(item);
    }
    this.spacer.replaceChildren(fragment);
    if (this.cursor >= start && this.cursor < end) this.list.setAttribute('aria-activedescendant', `workspace-scene-row-${this.cursor}`);
    else this.list.removeAttribute('aria-activedescendant');
  }

  setCursor(index) {
    if (index < 0 || index >= this.rows.length) return;
    this.cursor = index;
    const top = index * this.rowHeight;
    const { scrollTop, clientHeight } = this.list;
    if (top < scrollTop) this.list.scrollTop = top;
    else if (top + this.rowHeight > scrollTop + clientHeight) this.list.scrollTop = top + this.rowHeight - clientHeight;
    this.paint();
  }

  activate(row, additive = false) {
    if (!row) return;
    if (row.children?.length && !this.search.value.trim()) {
      if (!this.expanded.delete(row.key)) this.expanded.add(row.key);
      this.rebuild();
    } else if (row.kind) this.editor.commands.execute('selection.scene', { kind: row.kind, id: row.id, additive });
    else if (row.command) this.editor.commands.execute(row.command);
  }

  onKeyDown(event) {
    const row = this.rows[this.cursor];
    if (!row) return;
    switch (event.key) {
      case 'ArrowDown': this.setCursor(Math.min(this.cursor + 1, this.rows.length - 1)); break;
      case 'ArrowUp': this.setCursor(Math.max(this.cursor - 1, 0)); break;
      case 'Home': this.setCursor(0); break;
      case 'End': this.setCursor(this.rows.length - 1); break;
      case 'ArrowRight':
        if (!row.open && row.children?.length) this.activate(row);
        else if (this.rows[this.cursor + 1]?.parent === row.key) this.setCursor(this.cursor + 1);
        break;
      case 'ArrowLeft':
        if (row.open && row.children?.length && !this.search.value.trim()) this.activate(row);
        else this.setCursor(this.rows.findIndex(({ key }) => key === row.parent));
        break;
      case 'Enter':
      case ' ': this.activate(row, event.shiftKey); break;
      default: return;
    }
    event.preventDefault();
  }

  setRowHeight(height) {
    if (this.rowHeight === height) return;
    this.rowHeight = height;
    this.rebuild();
  }

  dispose() {
    this.resize.disconnect();
    this.unsubscribe?.();
  }
}
