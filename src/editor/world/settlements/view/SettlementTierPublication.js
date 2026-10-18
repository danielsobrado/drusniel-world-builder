import { stagedDrawPublication } from '../../../../render/preparation/StagedDrawPublication.js';

/** Holds the complete old tier until its replacement is warm in gameplay passes. */
export class SettlementTierPublication {
  constructor(root, getPreparation, disposeMeshes) {
    Object.assign(this, { root, getPreparation, disposeMeshes });
    this.pending = new Set();
  }

  stage(tier, previous = null) {
    const preparation = this.getPreparation();
    if (!preparation?.settings.enabled) return false;
    if (previous?.publication) previous = this.cancel(previous);
    const job = stagedDrawPublication(this.root, tier.meshes, preparation);
    const publication = { tier, previous, job };
    tier.publication = publication;
    this.pending.add(publication);
    if (job.next().done) this.publish(publication);
    return true;
  }

  publish(publication) {
    const { tier, previous } = publication;
    this.pending.delete(publication);
    delete tier.publication;
    this.root.add(...tier.meshes);
    for (const mesh of tier.meshes) mesh.visible = true;
    if (previous) this.disposeMeshes(previous.meshes);
  }

  advance(limit) {
    let published = 0;
    for (const publication of this.pending) {
      if (published >= limit) break;
      if (!publication.job.next().done) continue;
      this.publish(publication);
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
