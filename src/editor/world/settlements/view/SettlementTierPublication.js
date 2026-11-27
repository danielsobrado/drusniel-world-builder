import { stagedDrawPublication } from '../../../../render/preparation/StagedDrawPublication.js';

/** Holds the complete old tier until its replacement is warm in gameplay passes. */
export class SettlementTierPublication {
  constructor(root, getPreparation, disposeMeshes) {
    Object.assign(this, { root, getPreparation, disposeMeshes });
    this.pending = new Set();
  }

  stage(tier, previous = null, holdRows = false) {
    const preparation = this.getPreparation();
    if (!preparation?.settings.enabled) return false;
    if (previous?.publication) previous = this.cancel(previous);
    const job = stagedDrawPublication(this.root, tier.meshes, preparation);
    const publication = { tier, previous, job, prepared: false, rowsReady: !holdRows };
    tier.publication = publication;
    this.pending.add(publication);
    this.advancePreparation(publication);
    return true;
  }

  advancePreparation(publication) {
    if (!publication.prepared) publication.prepared = publication.job.next().done;
    if (!publication.prepared || !publication.rowsReady) return false;
    this.publish(publication);
    return true;
  }

  completeRows(tier) {
    const publication = tier.publication;
    if (!publication) return;
    publication.rowsReady = true;
    if (publication.prepared) this.publish(publication);
  }

  publish(publication) {
    const { tier, previous } = publication;
    this.pending.delete(publication);
    delete tier.publication;
    this.root.add(...tier.meshes);
    for (const mesh of tier.meshes) mesh.visible = !mesh.isInstancedMesh || mesh.count > 0;
    if (previous) this.disposeMeshes(previous.meshes);
  }

  advance(limit) {
    let published = 0;
    for (const publication of this.pending) {
      if (published >= limit) break;
      if (!this.advancePreparation(publication)) continue;
      published++;
    }
  }

  cancel(tier) {
    const publication = tier.publication;
    publication.job.return();
    this.pending.delete(publication);
    delete tier.publication;
    this.disposeMeshes(tier.meshes);
    return publication.previous;
  }

  release(tier) {
    if (tier.publication) {
      const previous = this.cancel(tier);
      if (previous) this.disposeMeshes(previous.meshes);
    } else this.disposeMeshes(tier.meshes);
  }
}
