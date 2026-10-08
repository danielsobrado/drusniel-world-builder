import { WorkshopShapeEditor } from './WorkshopShapeEditor.js';
import { WorkshopShapePreview } from './WorkshopShapePreview.js';

export class WorkshopShapeUiBridge {
  constructor(ui) {
    this.ui = ui;
    this.preview = null;
    this.editor = new WorkshopShapeEditor({
      form: ui.form,
      onChange: ({ frame = false } = {}) => {
        if (frame) ui.hasFramedPreview = false;
        this.syncHistoryToolbar();
        ui.schedulePreview(24, { draft: Boolean(this.editor.session.transaction) });
      },
      onStatus: (message, error) => {
        ui.status.textContent = message;
        ui.status.classList.toggle('is-error', error);
      },
    });
    this.keyDown = (event) => {
      if (
        !this.active ||
        ui.overlay.hidden ||
        ui.materialController?.active ||
        !(event.ctrlKey || event.metaKey)
      )
        return;
      if (event.key.toLowerCase() !== 'z' && event.key.toLowerCase() !== 'y') return;
      if (event.target.matches?.('input:not([type="range"]):not([type="checkbox"]),textarea'))
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.preview?.handles.finish(false);
      if (event.shiftKey || event.key.toLowerCase() === 'y') this.editor.session.redo();
      else this.editor.session.undo();
      this.editor.changed();
    };
    window.addEventListener('keydown', this.keyDown, true);
  }
  get active() {
    return this.ui.form.elements.archetype.value === 'composition';
  }
  sync() {
    this.editor.setActive(this.active);
    const hint = this.ui.overlay.querySelector('[data-role="workshop-preview-hint"]');
    hint.textContent = this.active
      ? 'Click a shape, then pull its gold handles · Escape cancels a drag · Ctrl+Z undoes · drag empty space to orbit.'
      : 'Select an area, then pull its gold edge arrows to reshape it · openings can be placed, duplicated, or repeated · drag empty space to orbit.';
    this.syncHistoryToolbar();
    if (this.preview) this.activateRenderer();
  }
  syncHistoryToolbar() {
    for (const [action, label, enabled] of [
      [
        'reset-component',
        this.active ? 'Undo shape edit' : 'Reset part',
        this.editor.session.history.canUndo,
      ],
      [
        'reset-all-components',
        this.active ? 'Redo shape edit' : 'Reset all',
        this.editor.session.history.canRedo,
      ],
    ]) {
      const button = this.ui.overlay.querySelector(`[data-workshop-action="${action}"]`);
      button.title = label;
      button.setAttribute('aria-label', label);
      button.disabled = this.ui.materialController?.active || (this.active && !enabled);
    }
  }
  initializeRenderer() {
    const ui = this.ui;
    this.preview = new WorkshopShapePreview({
      previewRoot: ui.previewRoot,
      renderer: ui.renderer,
      camera: ui.camera,
      orbitControls: ui.controls,
      editor: this.editor,
    });
    this.activateRenderer();
  }
  activateRenderer() {
    const ui = this.ui,
      active = this.active;
    if (active && !this.preview.active) {
      ui.clearPreview();
      ui.componentController.clear();
      ui.componentController.setExternalInteractionActive(true);
      ui.transformControls.detach();
      this.preview.setActive(true);
    } else if (!active && this.preview.active) {
      this.preview.setActive(false);
      this.preview.clear();
      ui.previewParts = [];
      ui.previewPartsOwnedByShape = false;
      ui.componentController.setExternalInteractionActive(ui.materialController.active);
    }
    ui.componentEditorHost.hidden = active;
    ui.materialController.componentController = active ? this.preview : ui.componentController;
    ui.syncTransformModeButtons(ui.componentController.mode);
  }
  recipeFields() {
    return this.active
      ? {
          archetype: 'manor',
          composition: this.editor.session.composition,
          componentTransforms: {},
          openingAttachments: {},
          openingAssemblies: {},
        }
      : {};
  }
  update(recipe, plan, { interactive = false } = {}) {
    this.activateRenderer();
    const parts = this.preview.update({ ...recipe, shapeInteractive: interactive }, plan);
    this.ui.stage?.updateShapes(plan.shapePlans);
    this.ui.previewPartsOwnedByShape = true;
    this.ui.materialController.replaceParts(parts);
    return parts;
  }
  clear() {
    this.preview?.clear();
    this.ui.stage?.updateShapes([]);
  }
  close() {
    this.editor.session.cancel();
    this.preview?.handles.finish(false);
  }
  captureRuntimeState() {
    return this.editor.captureRuntimeState();
  }
  restoreRuntimeState(state) {
    if (state) this.editor.restoreRuntimeState(state);
    this.sync();
  }
  releaseRenderer() {
    this.preview?.dispose();
    this.preview = null;
  }
  dispose() {
    this.releaseRenderer();
    this.editor.dispose();
    window.removeEventListener('keydown', this.keyDown, true);
  }
}
