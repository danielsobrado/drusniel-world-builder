import './NaturalEditorRecommendations.css';
import { OBJECT_CATALOG } from '../objectCatalog.js';

const HOVER_EVENT = 'drusniel:natural-editor-hover';
const MAX_RECOMMENDATIONS = 6;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function activeCategory(root) {
  return root.querySelector('[data-role="object-categories"] .chip.is-active')?.dataset.objectCategory
    ?? 'all';
}

function recommendationScore(definition, category) {
  let score = 0;
  if (category !== 'all' && definition.category === category) score += 100;
  if (definition.category === 'nature') score += 8;
  if (definition.footprint.width * definition.footprint.depth <= 4) score += 3;
  return score;
}

function recommendationsFor(tileId, category) {
  if (!Number.isInteger(tileId)) return [];
  return OBJECT_CATALOG
    .filter((definition) => definition.allowedTileIds.includes(tileId))
    .filter((definition) => category === 'all' || definition.category === category)
    .map((definition, index) => ({ definition, index }))
    .sort((a, b) => (
      recommendationScore(b.definition, category) - recommendationScore(a.definition, category)
      || a.index - b.index
    ))
    .slice(0, MAX_RECOMMENDATIONS)
    .map(({ definition }) => definition);
}

export class NaturalEditorRecommendations {
  constructor(root, selectObject) {
    this.root = root;
    this.objectSearch = root.querySelector('[data-role="object-search"]');
    this.tileId = null;
    this.abort = new AbortController();

    this.host = document.createElement('section');
    this.host.className = 'natural-recommendations';
    this.host.hidden = true;
    this.host.innerHTML = '<span class="natural-recommendations__label">Recommended here</span><div></div>';
    root.querySelector('.natural-quick-picks').before(this.host);

    window.addEventListener(HOVER_EVENT, (event) => {
      this.tileId = event.detail?.tileId ?? null;
      this.render();
    }, { signal: this.abort.signal });
    this.paletteObserver = new MutationObserver(() => this.render());
    this.paletteObserver.observe(root.querySelector('[data-role="object-palette"]'), { childList: true });
    this.host.addEventListener('click', (event) => {
      const button = event.target.closest('[data-natural-recommendation]');
      if (button) selectObject(button.dataset.naturalRecommendation, button.dataset.naturalRecommendationCategory);
    });
  }

  render() {
    const category = activeCategory(this.root);
    const query = this.objectSearch.value.trim();
    const cacheKey = JSON.stringify([this.tileId, category, query]);
    if (this.cacheKey === cacheKey) return;
    this.cacheKey = cacheKey;
    if (query) {
      this.host.hidden = true;
      return;
    }
    const definitions = recommendationsFor(this.tileId, category);
    this.host.hidden = definitions.length === 0;
    this.host.querySelector('div').innerHTML = definitions.map((definition) => `
      <button
        type="button"
        data-natural-recommendation="${escapeHtml(definition.key)}"
        data-natural-recommendation-category="${escapeHtml(definition.category)}"
        title="Fits this terrain"
      >
        <span class="natural-recommendations__icon" style="--object-color:${escapeHtml(definition.color)}">${escapeHtml(definition.icon)}</span>
        <span>${escapeHtml(definition.label)}</span>
      </button>
    `).join('');
  }

  dispose() {
    this.abort.abort();
    this.paletteObserver.disconnect();
    this.host.remove();
  }
}
