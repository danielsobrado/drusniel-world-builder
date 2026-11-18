import { TERRAIN_MODE_BY_SHORTCUT } from '../../constants.js';
import { TILE_BY_SHORTCUT } from '../../tileCatalog.js';

export class EditorCommands {
  #commands = new Map();

  register(id, label, run, { enabled = () => true, shortcut = '' } = {}) {
    if (this.#commands.has(id)) throw new Error(`Editor command already registered: ${id}`);
    this.#commands.set(id, { id, label, run, enabled, shortcut });
  }

  get(id) {
    return this.#commands.get(id);
  }

  list() {
    return [...this.#commands.values()];
  }

  execute(id, value) {
    const command = this.get(id);
    return command?.enabled() ? command.run(value) : false;
  }
}

export const WORLD_TOOLS = { terrain: 'Terrain', object: 'Objects', select: 'Select',
  construction: 'Wall builder', settings: 'World settings' };

export function createWorldCommands(controller) {
  const commands = new EditorCommands();
  const edit = () => !controller.isWorldInputBlocked();
  const object = () => edit() && Boolean(controller.selectedObjectId);
  for (const [tool, label] of Object.entries(WORLD_TOOLS)) {
    commands.register(`tool.${tool}`, label, () => controller.selectTool(tool), {
      enabled: edit, shortcut: { terrain: 'T', object: 'O', select: 'V', construction: 'C' }[tool],
    });
  }
  commands.register('edit.undo', 'Undo', () => controller.undo(), {
    enabled: () => edit() && (controller.painting || controller.pendingTopEdit || controller.undoStack.length > 0), shortcut: 'Ctrl+Z',
  });
  commands.register('edit.redo', 'Redo', () => controller.redo(), {
    enabled: () => edit() && controller.redoStack.length > 0, shortcut: 'Ctrl+Shift+Z',
  });
  commands.register('object.move', 'Move selection', () => controller.startMoveSelected(), { enabled: object });
  commands.register('object.rotate', 'Rotate selection', () => controller.rotateSelected(), { enabled: object, shortcut: 'R' });
  commands.register('object.duplicate', 'Duplicate selection', () => controller.duplicateSelected(), {
    enabled: () => object() && typeof controller.duplicateSelected === 'function', shortcut: 'Ctrl+D',
  });
  commands.register('object.delete', 'Delete selected objects', () => controller.deleteSelected(), { enabled: object, shortcut: 'Delete' });
  commands.register('object.rotate-placement', 'Rotate placement', () => controller.rotatePlacement(), { enabled: edit, shortcut: 'R' });
  commands.register('object.definition', '', (key) => controller.selectObjectDefinition(key), { enabled: edit });
  commands.register('terrain.tile', '', (id) => controller.selectTile(id), { enabled: edit });
  commands.register('terrain.brush', '', (size) => controller.selectBrush(size), { enabled: edit });
  commands.register('terrain.cycle-brush', '', (direction) => controller.cycleBrush(direction), { enabled: edit });
  for (const [key, mode] of Object.entries(TERRAIN_MODE_BY_SHORTCUT)) {
    commands.register(`terrain.${mode}`, `${mode[0].toUpperCase()}${mode.slice(1)} terrain`, () => controller.selectTerrainMode(mode), {
      enabled: edit, shortcut: key.toUpperCase(),
    });
  }
  for (const mode of ['draw', 'edit']) {
    commands.register(`construction.${mode}`, `${mode === 'draw' ? 'Draw' : 'Edit'} walls`, () => controller.selectConstructionMode(mode), { enabled: edit });
  }
  const wall = () => edit() && Boolean(controller.selectedConstructionId);
  commands.register('construction.delete', 'Delete selected wall', () => controller.deleteSelectedConstruction(), { enabled: wall });
  commands.register('construction.delete-part', '', () => controller.deleteConstructionSelection(), { enabled: wall });
  return commands;
}

export function editorShortcut(event, tool) {
  if (event.altKey) return null;
  const key = event.key.toLowerCase();
  if (event.ctrlKey || event.metaKey) {
    if (key === 'z') return [event.shiftKey ? 'edit.redo' : 'edit.undo'];
    if (key === 'y') return ['edit.redo'];
    if (key === 'd') return ['object.duplicate'];
    if (key === 'k') return ['view.command-search'];
    return null;
  }
  const tile = TILE_BY_SHORTCUT.get(event.key);
  if (tile) return ['terrain.tile', tile.id];
  const mode = TERRAIN_MODE_BY_SHORTCUT[key];
  if (mode) return [`terrain.${mode}`];
  const tools = { t: 'terrain', o: 'object', v: 'select', c: 'construction' };
  if (tools[key]) return [`tool.${tools[key]}`];
  if (key === 'r') return [tool === 'select' ? 'object.rotate' : 'object.rotate-placement'];
  if (key === 'delete' || key === 'backspace') {
    if (tool === 'construction') return ['construction.delete-part'];
    if (tool === 'select') return ['object.delete'];
  }
  if (key === '[' || key === ']') return ['terrain.cycle-brush', key === '[' ? -1 : 1];
  return null;
}
