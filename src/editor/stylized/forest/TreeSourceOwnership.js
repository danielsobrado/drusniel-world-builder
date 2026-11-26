/** Detach standard glTF material channels without duplicating decoded image data. */
export class TreeSourceOwnership {
  constructor(ownTexture) {
    this.ownTexture = ownTexture;
    this.materials = new WeakMap();
    this.textures = new WeakMap();
    this.canRelease = true;
  }

  detach(source) {
    if (!source) return source;
    if (!source.isMaterial || source.isNodeMaterial || source.isShaderMaterial
        || typeof source.clone !== 'function') {
      this.canRelease = false;
      return source;
    }
    if (this.materials.has(source)) return this.materials.get(source);
    const material = source.clone();
    for (const [key, value] of Object.entries(source)) {
      if (!value?.isTexture) continue;
      let texture = this.textures.get(value);
      if (!texture) {
        texture = value.clone();
        texture.needsUpdate = true;
        this.textures.set(value, texture);
        this.ownTexture(texture);
      }
      material[key] = texture;
    }
    this.materials.set(source, material);
    return material;
  }
}
