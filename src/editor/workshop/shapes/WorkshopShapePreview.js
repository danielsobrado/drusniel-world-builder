import * as THREE from 'three/webgpu';
import { WorkshopShapeCache } from './WorkshopShapeCache.js';
import { WorkshopShapeHandles } from './WorkshopShapeHandles.js';

/** Scene diff for semantic construction. The adapter also feeds the existing material inspector. */
export class WorkshopShapePreview {
  constructor({ previewRoot, renderer, camera, orbitControls, editor }) {
    Object.assign(this, { previewRoot, renderer, camera, editor });
    this.cache = new WorkshopShapeCache();
    this.groups = new Map();
    this.meshes = [];
    this.selectedComponentId = editor.selectedId;
    this.active = false;
    this.handles = new WorkshopShapeHandles({
      canvas: renderer.domElement,
      camera,
      orbitControls,
      editor,
      previewRoot,
    });
    this.handles.enabled = false;
    this.pointerStart = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.down = (e) => {
      if (this.active && !this.externalActive) this.pointerStart = [e.clientX, e.clientY];
    };
    this.up = (e) => {
      const start = this.pointerStart;
      this.pointerStart = null;
      if (
        !start ||
        this.handles.drag ||
        this.externalActive ||
        Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      this.pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((e.clientY - rect.top) / rect.height) * 2,
      );
      this.raycaster.setFromCamera(this.pointer, camera);
      const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
      if (hit) editor.select(hit.object.userData.workshopComponentId);
    };
    renderer.domElement.addEventListener('pointerdown', this.down);
    renderer.domElement.addEventListener('pointerup', this.up);
    editor.onSelection = (id) => {
      this.selectedComponentId = id;
      this.handles.sync();
    };
  }
  setActive(active) {
    this.active = active;
    this.handles.enabled = active && !this.externalActive;
    this.handles.sync();
  }
  setExternalInteractionActive(active) {
    this.externalActive = active;
    this.handles.enabled = this.active && !active;
    this.handles.sync();
  }
  selectedGroup() {
    return this.groups.get(this.editor.selectedId) ?? null;
  }
  supportsMode() {
    return false;
  }
  update(recipe, plan) {
    const result = this.cache.update(recipe, plan.shapePlans);
    for (const { id } of result.removed) {
      this.groups.get(id)?.removeFromParent();
      this.groups.delete(id);
    }
    for (const [id, entry] of result.entries) {
      if (result.previous.get(id) === entry) continue;
      const group = new THREE.Group();
      group.name = `shape:${id}`;
      group.userData.workshopComponent = {
        id,
        label: entry.plan.primitive.label,
        kind: 'structure',
      };
      for (const part of entry.parts) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        part.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
        mesh.userData.workshopComponentId = id;
        mesh.userData.workshopMaterialRegion = part.materialRegion;
        group.add(mesh);
      }
      this.groups.set(id, group);
      this.previewRoot.add(group);
    }
    this.cache.releaseRemoved(result);
    this.meshes = [...this.groups.values()].flatMap((group) => group.children);
    const parts = [...result.entries.values()].flatMap((entry) => entry.parts);
    const regions = [
      ...new Map(parts.map((part) => [part.materialRegion.id, part.materialRegion])).values(),
    ];
    Object.defineProperties(parts, {
      materialRegions: { value: regions },
      semantics: { value: plan.rpg },
      components: {
        value: [...this.groups.values()].map((group) => group.userData.workshopComponent),
      },
      stats: {
        value: {
          drawParts: parts.length,
          materialRegions: regions.length,
          materialCount: new Set(parts.map((part) => part.material)).size,
          components: this.groups.size,
          stones: 0,
          features: plan.primitives.length,
          sourceVertices: parts.reduce(
            (n, part) => n + part.geometry.getAttribute('position').count,
            0,
          ),
          ...result.stats,
        },
      },
    });
    this.handles.sync();
    this.editor.resolvedPlans = new Map(plan.shapePlans.map((p) => [p.id, p]));
    this.editor.sync();
    return parts;
  }
  clear() {
    for (const group of this.groups.values()) group.removeFromParent();
    this.groups.clear();
    this.meshes = [];
    this.cache.clear();
  }
  dispose() {
    this.clear();
    this.handles.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.down);
    this.renderer.domElement.removeEventListener('pointerup', this.up);
    this.editor.onSelection = null;
  }
}
