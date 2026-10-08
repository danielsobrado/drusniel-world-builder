import * as THREE from 'three/webgpu';
import { placeShapePoint } from './ShapePaths.js';
import { clampShapeField, shapeFieldEditable } from './ShapeEditConstraints.js';
import { shapeFieldChanges } from './WorkshopShapeFields.js';
import { shapeDirectHandleDefinitions, shapeDirectHandleChanges } from './ShapeDirectHandles.js';

export class WorkshopShapeHandles {
  constructor({ canvas, camera, orbitControls, editor, previewRoot, onChange }) {
    Object.assign(this, {
      canvas,
      camera,
      orbitControls,
      editor,
      previewRoot,
      onChange,
    });
    this.root = new THREE.Group();
    previewRoot.add(this.root);
    this.root.name = 'semantic-shape-handles';
    this.geometry = new THREE.SphereGeometry(0.13, 12, 8);
    this.material = new THREE.MeshBasicNodeMaterial({
      color: '#edba5e',
      depthTest: false,
    });
    this.handles = Array.from({ length: 7 }, () => {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.renderOrder = 20;
      this.root.add(mesh);
      return mesh;
    });
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.drag = null;
    this.enabled = true;
    this.down = (e) => this.pointerDown(e);
    this.move = (e) => this.pointerMove(e);
    this.up = (e) => this.finish(e.type !== 'pointercancel', e);
    this.lostCapture = (e) => this.finish(false, e);
    this.key = (e) => {
      if (e.key === 'Escape' && this.drag) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.finish(false);
      }
    };
    canvas.addEventListener('pointerdown', this.down, true);
    canvas.addEventListener('pointermove', this.move, true);
    canvas.addEventListener('pointerup', this.up, true);
    canvas.addEventListener('pointercancel', this.up, true);
    canvas.addEventListener('lostpointercapture', this.lostCapture, true);
    window.addEventListener('keydown', this.key, true);
  }
  ray(event) {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      1 - ((event.clientY - bounds.top) / bounds.height) * 2,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray;
  }
  sync() {
    const p = this.editor.primitive;
    const definitions = [];
    if (p && this.enabled) {
      const lift = p.elevation + 0.2;
      const add = (field, x, y, z) => {
        if (!shapeFieldEditable(p, field)) return;
        const [wx, wz] = placeShapePoint(p, [x, z]);
        definitions.push({ field, position: [wx, y, wz] });
      };
      add('move', 0, lift, 0);
      if (p.kind === 'curved-volume') {
        const f = p.footprint;
        add('height', 0, p.elevation + p.height, 0);
        add('roof-rise', 0, p.elevation + p.height + p.roof.rise + 0.2, 0);
        add('width', f.width / 2, lift, 0);
        add('depth', 0, lift, f.depth / 2);
        if (f.family === 'rounded') add('radius', f.width / 2 - f.cornerRadius, lift, f.depth / 2);
      } else {
        add('bend', 0, lift, p.bend / 2);
        add('length', p.length / 2, lift, 0);
        if (p.kind === 'curved-wall') add('height', 0, p.elevation + p.height, p.bend / 2);
        else add('rise', p.length / 2, p.elevation + p.rise + 0.2, 0);
      }
    }
    if (p && this.enabled) definitions.push(...shapeDirectHandleDefinitions(this.editor));
    this.root.visible = this.enabled;
    while (this.handles.length < definitions.length) {
      const mesh = new THREE.Mesh(this.geometry, this.material); mesh.renderOrder = 20;
      this.root.add(mesh); this.handles.push(mesh);
    }
    for (let i = 0; i < this.handles.length; i++) {
      const handle = this.handles[i],
        definition = definitions[i];
      handle.visible = Boolean(definition);
      if (definition) {
        handle.position.set(...definition.position);
        handle.userData.field = definition.field;
        handle.userData.definition = definition;
      }
    }
  }
  pointerDown(event) {
    if (!this.enabled || event.button !== 0 || this.drag) return;
    this.ray(event);
    this.root.updateWorldMatrix(true, true);
    const hit = this.raycaster.intersectObjects(
      this.handles.filter((h) => h.visible),
      false,
    )[0];
    if (!hit) return;
    const field = hit.object.userData.field,
      p = this.editor.primitive;
    const definition = hit.object.userData.definition;
    const normal = definition.type ? new THREE.Vector3(...definition.normal).normalize() : ['height', 'roof-rise', 'rise'].includes(field)
      ? this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize()
      : new THREE.Vector3(0, 1, 0);
    if (normal.lengthSq() === 0) normal.set(0, 0, 1);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point);
    const point = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!point) return;
    this.editor.session.begin('Drag construction handle');
    this.drag = {
      field,
      definition,
      primitive: p,
      plane,
      point: point.clone(),
      pointerId: event.pointerId,
      orbitEnabled: this.orbitControls.enabled,
    };
    this.orbitControls.enabled = false;
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  pointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const drag = this.drag,
      p = drag.primitive;
    this.ray(event);
    const point = this.raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
    if (!point) return;
    const delta = point.sub(drag.point),
      angle = (p.rotation * Math.PI) / 180;
    const dx = delta.x * Math.cos(angle) + delta.z * Math.sin(angle),
      dz = -delta.x * Math.sin(angle) + delta.z * Math.cos(angle);
    const clamp = (field, value) => clampShapeField(p, field, value);
    let changes;
    if (drag.definition.type) {
      try { changes = shapeDirectHandleChanges(p, drag.definition, [delta.x, delta.y, delta.z]); }
      catch (error) { this.editor.onStatus?.(error.message, true); return; }
    } else if (drag.field === 'move')
      changes = {
        position: [
          clamp('x', p.position[0] + delta.x),
          clamp('z', p.position[1] + delta.z),
        ],
      };
    else if (drag.field === 'roof-rise')
      changes = shapeFieldChanges(p, 'roof-rise', clamp('roof-rise', p.roof.rise + delta.y));
    else if (['width', 'depth', 'radius'].includes(drag.field)) {
      const field = drag.field;
      const value = field === 'radius' ? p.footprint.cornerRadius - dx
        : p.footprint[field] + (field === 'width' ? dx : dz) * 2;
      changes = shapeFieldChanges(p, field, clamp(field, value));
    } else {
      const field = drag.field;
      const deltaValue = field === 'bend' ? dz * 2 : field === 'length' ? dx * 2 : delta.y;
      changes = shapeFieldChanges(p, field, clamp(field, p[field] + deltaValue));
    }
    try {
      this.editor.session.update(p.id, changes);
      this.editor.changed();
      this.sync();
    } catch (error) {
      this.editor.onStatus?.(error.message, true);
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  finish(commit, event) {
    if (!this.drag || (event && event.pointerId !== this.drag.pointerId)) return;
    const { pointerId, orbitEnabled } = this.drag;
    this.drag = null;
    if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
    this.orbitControls.enabled = orbitEnabled;
    if (commit) this.editor.session.commit();
    else this.editor.session.cancel();
    this.editor.changed();
    this.sync();
    event?.stopImmediatePropagation();
  }
  dispose() {
    this.finish(false);
    this.root.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.canvas.removeEventListener('pointerdown', this.down, true);
    this.canvas.removeEventListener('pointermove', this.move, true);
    this.canvas.removeEventListener('pointerup', this.up, true);
    this.canvas.removeEventListener('pointercancel', this.up, true);
    this.canvas.removeEventListener('lostpointercapture', this.lostCapture, true);
    window.removeEventListener('keydown', this.key, true);
  }
}
