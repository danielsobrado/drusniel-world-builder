/** Track hierarchy edits once, including lights inserted below an existing group. */
export class ReflectionShadowRegistry {
  constructor(scene) {
    this.objects = new Set();
    this.owners = new Set();
    this.overlays = new Set();
    this.reflectionExclusions = new Set();
    this.cubeReflectionExclusions = new Set();
    this.overlayCursor = null;
    this.added = event => this.track(event.child);
    this.removed = event => this.untrack(event.child);
    this.track(scene);
  }

  track(root) {
    root.traverse(object => {
      if (this.objects.has(object)) return;
      this.objects.add(object);
      // A light may replace its shadow object without changing its hierarchy.
      if (object.isLight || object.shadow) this.owners.add(object);
      this.refreshTags(object);
      object.addEventListener('childadded', this.added);
      object.addEventListener('childremoved', this.removed);
    });
  }

  untrack(root) {
    root.traverse(object => {
      this.objects.delete(object);
      this.owners.delete(object);
      this.overlays.delete(object);
      this.reflectionExclusions.delete(object);
      this.cubeReflectionExclusions.delete(object);
      object.removeEventListener('childadded', this.added);
      object.removeEventListener('childremoved', this.removed);
    });
  }

  refreshTags(object) {
    if (object.userData?.editorOverlay || object.name?.includes('grid-overlay')) this.overlays.add(object);
    else this.overlays.delete(object);
    if (object.userData?.excludeFromReflection === true) this.reflectionExclusions.add(object);
    else this.reflectionExclusions.delete(object);
    if (object.userData?.excludeFromCubeReflection === true) this.cubeReflectionExclusions.add(object);
    else this.cubeReflectionExclusions.delete(object);
  }

  refreshOverlayTags(limit = 64) {
    this.overlayCursor ??= this.objects.values();
    for (let index = 0; index < limit; index++) {
      const step = this.overlayCursor.next();
      if (step.done) { this.overlayCursor = null; return; }
      const object = step.value;
      this.refreshTags(object);
    }
  }

  dispose() {
    this.overlayCursor = null;
    for (const object of this.objects) {
      object.removeEventListener('childadded', this.added);
      object.removeEventListener('childremoved', this.removed);
    }
    this.objects.clear(); this.owners.clear(); this.overlays.clear();
    this.reflectionExclusions.clear(); this.cubeReflectionExclusions.clear();
  }
}

// A scene has one registry even when several rendering passes consume it.
const sceneRegistries = new WeakMap();

export function acquireReflectionShadowRegistry(scene) {
  let entry = sceneRegistries.get(scene);
  if (!entry) {
    entry = { registry: new ReflectionShadowRegistry(scene), users: 0 };
    sceneRegistries.set(scene, entry);
  }
  entry.users++;
  let active = true;
  return {
    registry: entry.registry,
    release() {
      if (!active) return;
      active = false;
      if (--entry.users === 0) {
        entry.registry.dispose();
        sceneRegistries.delete(scene);
      }
    },
  };
}
