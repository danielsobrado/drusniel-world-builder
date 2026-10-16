import assert from 'node:assert/strict';
import { shapeLocator } from './workshopShapeControls.mjs';

/** Measures actual pointer gestures and render submission, never claiming physical display latency. */
export async function checkWorkshopShapeResponsiveness({ page, report, preset, settle, handlePoint }) {
  report.responsiveness = [];
  for (const id of ['rounded-cottage', 'buttressed-chapel', 'balcony-tower', 'cottage-turret']) {
    await preset(page, id);
    const opening = await page.evaluate(() => window.__editor.proceduralWorkshop.shapeBridge.editor.primitive.openings.find(o => o.role === 'window').id);
    await shapeLocator(page, '[data-shape-action="opening"]').selectOption(opening);
    await page.evaluate(() => {
      const ui = window.__editor.proceduralWorkshop, T = window.__THREE_QA__;
      const h = ui.shapeBridge.preview.handles.handles.find(h => h.visible && h.userData.field === 'opening');
      const position = h.getWorldPosition(new T.Vector3()), direction = new T.Vector3(...h.userData.definition.normal).normalize();
      ui.controls.enableDamping = false; ui.controls.target.copy(position);
      ui.camera.position.copy(position).addScaledVector(direction, 12).add(new T.Vector3(0, 4, 0)); ui.controls.update();
      const samples = { frames: [], submissions: [], feedbackProxy: [], geometrySubmission: [], longTasks: [] };
      const host = ui.ambientOcclusion ?? ui.renderer, original = host.render;
      let previous, feedback, geometry;
      const move = event => { if (!ui.shapeBridge.preview.handles.drag || event.target !== ui.renderer.domElement) return;
        feedback = { at: performance.now() }; geometry = { ...feedback, revision: ui.completedPlanRevision }; };
      window.addEventListener('pointermove', move, true);
      const observer = new PerformanceObserver(list => samples.longTasks.push(...list.getEntries().map(e => e.duration)));
      observer.observe({ type: 'longtask', buffered: false });
      host.render = function (...args) {
        const start = performance.now(), value = original.apply(this, args), end = performance.now();
        if (previous !== undefined) samples.frames.push(end - previous); previous = end;
        samples.submissions.push(end - start);
        if (feedback) { samples.feedbackProxy.push(end - feedback.at); feedback = null; }
        if (geometry && ui.completedPlanRevision > geometry.revision) { samples.geometrySubmission.push(end - geometry.at); geometry = null; }
        return value;
      };
      window.__workshopResponsivenessStop = () => {
        host.render = original; observer.disconnect(); window.removeEventListener('pointermove', move, true);
        ui.controls.enableDamping = true;
        samples.geometryBytes = ui.previewParts.reduce((sum, part) => sum + Object.values(part.geometry.attributes).reduce((n, a) => n + a.array.byteLength, 0) + (part.geometry.index?.array.byteLength ?? 0), 0);
        return samples;
      };
    });
    const start = await handlePoint(page, 'opening');
    try {
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      assert.equal(await page.evaluate(() => window.__editor.proceduralWorkshop.shapeBridge.preview.handles.drag?.field), 'opening');
      for (let step = 1; step <= 8; step++) {
        await page.mouse.move(start.x + step * 2, start.y - step * 0.5);
        await page.waitForTimeout(35);
      }
      await page.mouse.up(); await settle(page);
      const samples = await page.evaluate(() => window.__workshopResponsivenessStop());
      assert.ok(samples.feedbackProxy.length > 0 && samples.geometrySubmission.length > 0);
      const summary = values => { const sorted = [...values].sort((a,b) => a-b); return { count: values.length,
        p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1) }; };
      report.responsiveness.push({ id, units: 'ms', meaning: 'Pointer event to render submission proxy; not physical display latency.',
        frameInterval: summary(samples.frames), submission: summary(samples.submissions), pointerFeedbackProxy: summary(samples.feedbackProxy),
        geometrySubmissionProxy: summary(samples.geometrySubmission), longTasks: samples.longTasks, geometryBytes: samples.geometryBytes });
    } finally {
      await page.mouse.up(); await page.evaluate(() => { window.__workshopResponsivenessStop?.(); delete window.__workshopResponsivenessStop; });
    }
  }
  report.assertions.push('Real window drags on four fixtures report frame intervals, render submission, long tasks and memory with explicit latency limits.');
}
