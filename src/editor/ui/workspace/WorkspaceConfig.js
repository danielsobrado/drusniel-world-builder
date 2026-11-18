const WORKSPACES = ['world', 'construction', 'environment', 'natural'];
const THEMES = ['professional-light', 'dark-forge', 'glade'];
const PANEL_NAMES = ['toolbox', 'inspector'];
const STORAGE_KEY = 'drusniel:editor-workspace:v1';

export function validateWorkspaceConfig(config, commands) {
  const check = (condition, path) => {
    if (!condition) throw new Error(`Invalid editor-workspaces.yaml field: ${path}`);
  };
  check(config?.version === 1, 'version');
  for (const key of ['menuHeight', 'toolbarHeight', 'statusHeight', 'iconSize', 'minViewportWidth']) {
    const value = config.layout?.[key];
    check(Number.isSafeInteger(value) && value > 0, `layout.${key}`);
  }
  for (const key of PANEL_NAMES) {
    const { minWidth, defaultWidth, maxWidth } = config.panels?.[key] ?? {};
    check([minWidth, defaultWidth, maxWidth].every(Number.isSafeInteger)
      && 0 < minWidth && minWidth <= defaultWidth && defaultWidth <= maxWidth, `panels.${key}`);
  }
  for (const key of WORKSPACES) {
    const workspace = config.workspaces?.[key];
    check(typeof workspace?.label === 'string' && workspace.label.trim(), `workspaces.${key}.label`);
    if (key === 'natural') continue;
    check(Array.isArray(workspace.tools) && workspace.tools.length > 0
      && workspace.tools.every((id) => typeof id === 'string' && (!commands || commands.get(id)))
      && workspace.tools.includes(workspace.initialTool), `workspaces.${key}.tools`);
    check(typeof workspace.outliner === 'boolean', `workspaces.${key}.outliner`);
  }
  check(Object.keys(config.workspaces).length === WORKSPACES.length, 'workspaces');
  check(THEMES.includes(config.themes?.default) && THEMES.every((key) => typeof config.themes.available?.[key] === 'string')
    && Object.keys(config.themes.available).length === THEMES.length, 'themes');
  return config;
}

export function clampPanelWidth(width, panel) {
  return Math.min(panel.maxWidth, Math.max(panel.minWidth, Math.round(width)));
}

export function workspacePreferences(config, value = {}) {
  return {
    workspace: WORKSPACES.includes(value?.workspace) ? value.workspace : 'world',
    theme: THEMES.includes(value?.theme) ? value.theme : config.themes.default,
    density: value?.density === 'comfortable' ? 'comfortable' : 'compact',
    compactPanel: PANEL_NAMES.includes(value?.compactPanel) ? value.compactPanel : null,
    panels: Object.fromEntries(PANEL_NAMES.map((key) => {
      const panel = config.panels[key];
      const saved = value?.panels?.[key];
      return [key, {
        width: Number.isFinite(saved?.width) ? clampPanelWidth(saved.width, panel) : panel.defaultWidth,
        visible: saved?.visible !== false,
      }];
    })),
  };
}

export function loadWorkspacePreferences(config) {
  try {
    return workspacePreferences(config, JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return workspacePreferences(config);
  }
}

export function saveWorkspacePreferences(preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // The workspace remains usable with storage disabled.
  }
}
