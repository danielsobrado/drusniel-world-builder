import config from '../../../../config/editor-workspaces.yaml?compiled';
import { naturalEditorIcon } from '../NaturalEditorIcons.js';
import { NATURAL_EDITOR_UI_CONFIG } from '../NaturalEditorUiConfig.generated.js';
import { PLAYER_MODE_EDIT } from '../../player/playerConstants.js';
import { CommandSearch } from './CommandSearch.js';
import { SceneOutliner } from './SceneOutliner.js';
import { WorkspaceInspector } from './WorkspaceInspector.js';
import { clampPanelWidth, loadWorkspacePreferences, saveWorkspacePreferences, validateWorkspaceConfig, workspacePreferences } from './WorkspaceConfig.js';
import './WorkspaceThemes.css';
import './EditorWorkspace.css';

const MENUS = {
  File: ['file.save', 'file.load', 'file.import', 'file.export', 'file.clear'],
  Edit: ['edit.undo', 'edit.redo', 'tool.select', 'object.move', 'object.rotate', 'object.duplicate', 'object.delete'],
  Create: ['tool.object', 'asset.nature', 'asset.decor', 'asset.structures', 'asset.defenses', 'tool.workshop'],
  Terrain: ['tool.terrain', 'terrain.paint', 'terrain.raise', 'terrain.lower', 'terrain.smooth', 'tool.settings'],
  Build: ['tool.construction', 'construction.draw', 'construction.edit', 'construction.delete'],
  View: ['view.world-map', 'view.reset-camera', 'view.command-search', 'view.workspace.explore', 'view.workspace.natural'],
};

const SELECTED_ICONS = {
  'tool.select': 'select', 'tool.terrain': 'terrain', 'tool.object': 'decor', 'tool.construction': 'wall',
  'tool.settings': 'settings', 'tool.workshop': 'workshop', 'construction.draw': 'build', 'construction.edit': 'wall',
  'view.world-map': 'map', 'edit.undo': 'undo', 'edit.redo': 'redo', 'object.move': 'move',
  'object.rotate': 'rotate', 'object.duplicate': 'duplicate', 'view.toolbox': 'toolbox', 'view.inspector': 'inspector',
  ...Object.fromEntries([...NATURAL_EDITOR_UI_CONFIG.primaryTools, ...NATURAL_EDITOR_UI_CONFIG.buildActions]
    .filter(({ objectCategory }) => objectCategory).map(({ id, icon }) => [`asset.${id}`, icon])),
};
const ASSET_CATEGORIES = Object.fromEntries([...NATURAL_EDITOR_UI_CONFIG.primaryTools, ...NATURAL_EDITOR_UI_CONFIG.buildActions]
  .filter(({ objectCategory }) => objectCategory).map(({ id, objectCategory }) => [`asset.${id}`, objectCategory]));

function makeElement(tag, className, content) {
  const element = document.createElement(tag);
  element.className = className;
  element.innerHTML = content;
  return element;
}

export class EditorWorkspace {
  constructor({ editor, natural, fps, openMap, explore, viewMode, fixedNatural = false }) {
    this.editor = editor;
    this.natural = natural;
    this.fps = fps;
    this.commands = editor.commands;
    this.shell = editor.viewport.parentElement;
    this.sidebar = this.shell.querySelector('.sidebar');
    this.status = editor.viewport.querySelector('.statusbar');
    this.topbar = editor.viewport.querySelector('.topbar');
    this.fixedNatural = fixedNatural;
    this.abort = new AbortController();
    this.preferences = fixedNatural ? workspacePreferences(config, { workspace: 'natural' }) : loadWorkspacePreferences(config);
    this.registerCommands(openMap, explore);
    validateWorkspaceConfig(config, this.commands);

    this.compactWidth = config.layout.minViewportWidth + config.panels.toolbox.minWidth + config.panels.inspector.minWidth + 20;
    this.menu = makeElement('header', 'workspace-menu', `
      <span class="workspace-brand"><span aria-hidden="true">◆</span> Drusniel</span>
      <nav aria-label="Editor menus">${Object.entries(MENUS).map(([label, ids]) => `
        <details><summary>${label}</summary><div class="workspace-menu-popover">
          ${ids.map((id) => this.button(id, 'menu')).join('')}${label === 'View' ? this.appearanceMarkup() : ''}
        </div></details>`).join('')}</nav>
      <button class="workspace-search-trigger" type="button" data-command="view.command-search" aria-label="Search commands" title="Search commands (Ctrl+K)">
        ${naturalEditorIcon('search')} <span>Search commands</span><kbd>Ctrl K</kbd>
      </button>
      <select class="workspace-select" aria-label="Workspace"></select>`);
    this.toolbar = makeElement('div', 'workspace-toolbar', `
      <div class="workspace-tool-group">${this.button('view.toolbox', 'icon')}</div>
      <div class="workspace-tool-group" data-workspace-tools></div>
      <div class="workspace-tool-group workspace-transform-tools">${['object.move', 'object.rotate', 'object.duplicate'].map((id) => this.button(id, 'icon')).join('')}</div>
      <div class="workspace-tool-group workspace-history">${['edit.undo', 'edit.redo'].map((id) => this.button(id, 'icon')).join('')}</div>
      <div class="workspace-tool-group">${this.button('view.inspector', 'icon')}</div>`);
    this.toolbox = makeElement('div', 'workspace-toolbox-heading', `
      <h2 class="workspace-panel-heading" id="workspace-toolbox-title">Toolbox</h2>
      <div data-workspace-categories></div><h2 class="workspace-panel-heading workspace-active-tool">Active Tool</h2>`);
    this.sidebar.prepend(this.toolbox);
    this.sidebar.id = 'workspace-toolbox';
    this.inspector = makeElement('aside', 'workspace-inspector', '<section class="workspace-scene"></section><section class="workspace-inspector-section"></section>');
    this.inspector.setAttribute('aria-label', 'Scene and properties');
    this.inspector.id = 'workspace-inspector';
    this.inspector.classList.add('workspace-chrome');
    this.menu.classList.add('workspace-chrome');
    this.toolbar.classList.add('workspace-chrome');
    for (const node of [this.menu, this.toolbar, this.inspector]) node.dataset.captureUi = '';
    this.shell.prepend(this.menu, this.toolbar);
    this.shell.append(this.inspector);
    this.outliner = new SceneOutliner(this.inspector.firstElementChild, editor);
    this.properties = new WorkspaceInspector(this.inspector.lastElementChild, editor);
    this.extras = makeElement('div', 'workspace-panel-extras', '');
    this.inspector.querySelector('.workspace-properties').append(this.extras);
    this.search = new CommandSearch(this.shell, this.commands);
    this.workspacePicker = this.menu.querySelector('.workspace-select');
    for (const [id, { label }] of Object.entries(config.workspaces)) this.workspacePicker.add(new Option(label, id));
    this.workspacePicker.add(new Option('Asset Workshop', 'workshop'));
    this.workspacePicker.add(new Option('Explore / Play', 'explore'));
    this.themePicker = this.menu.querySelector('[data-workspace-theme]');
    for (const [id, label] of Object.entries(config.themes.available)) this.themePicker.add(new Option(label, id));
    this.densityPicker = this.menu.querySelector('[data-workspace-density]');
    this.splitters = Object.fromEntries(Object.keys(config.panels).map((id) => [id, this.createSplitter(id)]));
    for (const [key, value] of Object.entries(config.layout)) this.shell.style.setProperty(`--workspace-${key}`, `${value}px`);
    this.mode = makeElement('span', 'workspace-status-mode', 'Edit mode');
    this.stream = editor.streamingStatus;
    this.bind();
    this.applyPreferences();
    this.selectWorkspace(this.preferences.workspace, { remember: false, initial: true });
    this.unsubscribe = editor.controller.subscribe((state) => {
      this.state = state;
      this.queueRender();
    });
    this.unsubscribeView = viewMode.subscribe(({ mode, awaitingSpawn }) => {
      const exploring = mode !== PLAYER_MODE_EDIT || awaitingSpawn;
      if (exploring === this.exploring) return;
      this.exploring = exploring;
      this.updatePresentation();
    });
    this.resize = new ResizeObserver(() => {
      if ((this.shell.clientWidth <= this.compactWidth) !== this.compact) this.syncPanels();
    });
    this.resize.observe(this.shell);
  }

  registerCommands(openMap, explore) {
    const enabled = () => !this.editor.controller.isWorldInputBlocked();
    this.commands.register('view.world-map', 'World map', openMap, { enabled });
    this.commands.register('view.command-search', 'Search commands', () => this.search.open(), { enabled, shortcut: 'Ctrl+K' });
    this.commands.register('view.workspace.explore', 'Explore / Play', explore, { enabled });
    for (const [id, { label }] of Object.entries(config.workspaces)) {
      this.commands.register(`view.workspace.${id}`, label, () => this.selectWorkspace(id), { enabled });
    }
    for (const [id, label] of [['toolbox', 'Toolbox'], ['inspector', 'Inspector']]) {
      this.commands.register(`view.${id}`, `Toggle ${label}`, () => this.togglePanel(id), {
        enabled: () => enabled() && this.shell.dataset.workspace !== 'natural',
      });
    }
  }

  button(id, style) {
    const { label, shortcut } = this.commands.get(id);
    const controls = id === 'view.toolbox' || id === 'view.inspector' ? `aria-controls="workspace-${id.split('.')[1]}"` : '';
    const icon = naturalEditorIcon(SELECTED_ICONS[id]);
    return `<button type="button" class="workspace-${style}-button" data-command="${id}" ${controls}
      aria-label="${label}" title="${label}${shortcut ? ` (${shortcut})` : ''}">
      ${style === 'menu' ? label : icon}${style === 'tool' ? `<span>${label}</span>` : ''}
      ${style === 'menu' && shortcut ? `<kbd>${shortcut}</kbd>` : ''}</button>`;
  }

  appearanceMarkup() {
    return `<div class="workspace-appearance">
      <label>Theme <select data-workspace-theme aria-label="Editor theme"></select></label>
      <label>Density <select data-workspace-density aria-label="Control density">
        <option value="compact">Compact</option><option value="comfortable">Comfortable</option>
      </select></label>
    </div>`;
  }

  bind() {
    const signal = this.abort.signal;
    this.shell.addEventListener('click', (event) => {
      const button = event.target.closest('[data-command]');
      if (!button) return;
      const menu = button.closest('details');
      if (menu) {
        this.closeMenus();
        menu.querySelector('summary').focus();
      }
      const id = button.dataset.command;
      this.commands.execute(id);
      if (this.compact && button.closest('.workspace-toolbar') && /^(tool|terrain|construction|asset)\./.test(id)
        && id !== 'tool.workshop') this.showCompactPanel('toolbox');
    }, { signal });
    this.menu.addEventListener('click', (event) => {
      const summary = event.target.closest('summary');
      if (summary) this.closeMenus(summary.parentElement);
    }, { signal });
    document.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('.workspace-menu details')) this.closeMenus();
    }, { signal });
    this.workspacePicker.addEventListener('change', () => {
      const id = this.workspacePicker.value;
      this.workspacePicker.value = this.preferences.workspace;
      this.commands.execute(id === 'workshop' ? 'tool.workshop' : `view.workspace.${id}`);
    }, { signal });
    this.themePicker.addEventListener('change', () => {
      this.preferences.theme = this.themePicker.value;
      this.applyPreferences();
      this.save();
    }, { signal });
    this.densityPicker.addEventListener('change', () => {
      this.preferences.density = this.densityPicker.value;
      this.applyPreferences();
      this.save();
    }, { signal });
  }

  applyPreferences() {
    this.shell.dataset.editorTheme = this.themePicker.value = this.preferences.theme;
    this.shell.dataset.editorDensity = this.densityPicker.value = this.preferences.density;
    this.outliner.setRowHeight(this.preferences.density === 'compact' ? 26 : 34);
    this.syncPanels();
  }

  selectWorkspace(id, { remember = true, initial = false } = {}) {
    if (this.fixedNatural && id !== 'natural') return;
    const profile = config.workspaces[id];
    const switched = this.shell.dataset.workspace !== id;
    this.shell.dataset.workspace = this.workspacePicker.value = this.preferences.workspace = id;
    this.updatePresentation();
    this.closeMenus();
    if (id === 'natural') {
      this.editor.viewport.querySelector('.toast').after(this.status);
      this.topbar.insertBefore(this.stream, this.editor.objectCount);
      this.fps.titleRow.append(this.fps.output);
      if (switched) this.natural.syncPresentation(this.editor.controller.tool);
      if (!this.fixedNatural) this.natural.showFirstRunHint();
    } else {
      this.shell.append(this.status);
      this.status.prepend(this.mode);
      this.status.append(this.stream, this.fps.output);
      this.outliner.host.hidden = !profile.outliner;
      this.inspector.classList.toggle('has-outliner', profile.outliner);
      if (switched && this.weatherGroup) this.weatherGroup.open = id === 'environment';
      const buttons = this.toolbar.querySelector('[data-workspace-tools]');
      buttons.innerHTML = profile.tools.map((command) => this.button(command, 'icon')).join('');
      this.toolbox.querySelector('[data-workspace-categories]').innerHTML = profile.tools.map((command) => this.button(command, 'tool')).join('');
      const state = this.state ?? this.editor.controller.getState();
      if (switched && (!initial || id !== 'world') && !state.selectedObject && !state.selectedConstruction) this.commands.execute(profile.initialTool);
    }
    this.syncPanels();
    this.queueRender();
    if (remember) this.save();
  }

  updatePresentation() {
    const docked = this.preferences.workspace !== 'natural' && !this.exploring;
    this.shell.toggleAttribute('data-docked', docked);
    this.shell.dataset.naturalUiInstalled = String(!docked);
    this.placeWorldDetails(docked);
    this.queueRender();
  }

  attachWorldDetails(roadside, weather) {
    this.roadside = roadside;
    this.roadsideHome = roadside.parentElement;
    this.weather = weather;
    if (weather) {
      this.weatherHome = weather.parentElement;
      this.weatherGroup = makeElement('details', 'workspace-weather', '<summary>Weather</summary>');
      this.weatherGroup.open = this.preferences.workspace === 'environment';
      this.extras.append(this.weatherGroup);
    }
    this.placeWorldDetails(this.shell.hasAttribute('data-docked'));
  }

  placeWorldDetails(docked) {
    if (this.roadside) {
      const host = docked ? this.extras : this.roadsideHome;
      if (this.roadside.parentElement !== host) host.prepend(this.roadside);
    }
    if (this.weather) {
      const host = docked ? this.weatherGroup : this.weatherHome;
      if (this.weather.parentElement !== host) host.append(this.weather);
    }
  }

  closeMenus(except = null) {
    const open = [...this.menu.querySelectorAll('details[open]')].filter((menu) => menu !== except);
    for (const menu of open) menu.open = false;
    return open.length > 0;
  }

  escape(event) {
    if (this.search.close()) return true;
    const openMenu = this.menu.querySelector('details[open]');
    if (openMenu) {
      this.closeMenus();
      openMenu.querySelector('summary').focus();
      return true;
    }
    const panel = this.preferences.compactPanel;
    if (!this.shell.hasAttribute('data-docked') || !this.compact || !panel
      || !event.target.closest?.('.workspace-inspector, .sidebar')) return false;
    this.showCompactPanel(null);
    this.toolbar.querySelector(`[data-command="view.${panel}"]`).focus();
    return true;
  }

  togglePanel(id) {
    if (this.compact) this.showCompactPanel(this.preferences.compactPanel === id ? null : id);
    else {
      this.preferences.panels[id].visible = !this.preferences.panels[id].visible;
      this.syncPanels();
      this.save();
    }
  }

  showCompactPanel(id) {
    this.preferences.compactPanel = id;
    this.syncPanels();
    this.save();
  }

  syncPanels() {
    this.compact = this.shell.clientWidth <= this.compactWidth;
    this.shell.toggleAttribute('data-compact', this.compact);
    for (const [id, { width, visible }] of Object.entries(this.preferences.panels)) {
      const open = this.compact ? this.preferences.compactPanel === id : visible;
      this.shell.toggleAttribute(`data-${id}-open`, open);
      this.shell.style.setProperty(`--workspace-${id}-width`, `${width}px`);
      this.toolbar.querySelector(`[data-command="view.${id}"]`).setAttribute('aria-expanded', open);
      this.splitters[id].setAttribute('aria-valuenow', width);
    }
    this.queueRender();
  }

  createSplitter(id) {
    const bounds = config.panels[id];
    const splitter = makeElement('div', `workspace-splitter workspace-splitter-${id} workspace-chrome`, '');
    splitter.tabIndex = 0;
    splitter.dataset.captureUi = '';
    splitter.setAttribute('role', 'separator');
    splitter.setAttribute('aria-orientation', 'vertical');
    splitter.setAttribute('aria-label', `Resize ${id}`);
    splitter.setAttribute('aria-controls', `workspace-${id}`);
    splitter.setAttribute('aria-valuemin', bounds.minWidth);
    splitter.setAttribute('aria-valuemax', bounds.maxWidth);
    this.shell.append(splitter);
    const direction = id === 'toolbox' ? 1 : -1;
    const setWidth = (width) => {
      this.preferences.panels[id].width = clampPanelWidth(width, bounds);
      this.syncPanels();
      this.save();
    };
    let drag;
    const reset = () => {
      drag = null;
      splitter.style.removeProperty('translate');
      splitter.classList.remove('is-dragging');
    };
    splitter.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      splitter.setPointerCapture(event.pointerId);
      splitter.focus();
      drag = { x: event.clientX, width: this.preferences.panels[id].width };
      splitter.classList.add('is-dragging');
    });
    splitter.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const width = clampPanelWidth(drag.width + (event.clientX - drag.x) * direction, bounds);
      splitter.style.translate = `${(width - drag.width) * direction}px 0`;
    });
    splitter.addEventListener('pointerup', (event) => {
      if (drag) setWidth(drag.width + (event.clientX - drag.x) * direction);
      reset();
    });
    splitter.addEventListener('lostpointercapture', reset);
    splitter.addEventListener('keydown', (event) => {
      const width = this.preferences.panels[id].width;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setWidth(width + (event.key === 'ArrowLeft' ? -16 : 16) * direction);
      else if (event.key === 'Home') setWidth(bounds.minWidth);
      else if (event.key === 'End') setWidth(bounds.maxWidth);
      else return;
      event.preventDefault();
    });
    return splitter;
  }

  queueRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      if (this.state && !this.abort.signal.aborted) this.render(this.state);
    });
  }

  render(state) {
    if (!this.shell.hasAttribute('data-docked')) return;
    this.outliner.update(state);
    this.properties.render(state);
    for (const button of this.shell.querySelectorAll('button[data-command]')) {
      const id = button.dataset.command;
      const active = id.startsWith('asset.')
        ? state.tool === 'object' && this.editor.objectCategory === ASSET_CATEGORIES[id]
        : id.startsWith('construction.') ? state.tool === 'construction' && id === `construction.${state.constructionMode}`
          : id === `tool.${state.tool}` && (state.tool !== 'object' || this.editor.objectCategory === 'all');
      button.disabled = !this.commands.get(id)?.enabled();
      if (button.closest('.workspace-toolbar, .workspace-toolbox-heading') && /^(tool|asset|construction)\./.test(id)) {
        button.setAttribute('aria-pressed', active);
      }
    }
  }

  save() {
    if (!this.fixedNatural) saveWorkspacePreferences(this.preferences);
  }

  dispose() {
    this.abort.abort();
    this.resize.disconnect();
    this.unsubscribe();
    this.unsubscribeView();
    this.outliner.dispose();
    this.properties.dispose();
    this.search.close();
  }
}
