function formatDistance(meters) {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`
    : `${Math.round(meters)} m`;
}

/**
 * DOM markers for `selectMinimapBurgs` results. Markers are DOM rather than
 * canvas pixels so their labels can counter-rotate and stay upright while the
 * map turns.
 *
 * @param {ReturnType<typeof import('./minimapBurgs.js').selectMinimapBurgs>} markers
 * @param {number} tileSize metres per cell, for the off-map distance labels
 */
export function createMinimapBurgElements(markers, tileSize) {
  return markers.map((marker) => {
    const element = document.createElement('span');
    element.className = 'minimap-burg';
    element.classList.toggle('is-capital', marker.capital);
    element.classList.toggle('is-offscreen', marker.offscreen);
    element.style.left = `${marker.u * 100}%`;
    element.style.top = `${marker.v * 100}%`;

    const dot = document.createElement('span');
    dot.className = 'minimap-burg__dot';
    dot.style.background = marker.color;

    const name = document.createElement('span');
    name.className = 'minimap-burg__name';
    // Burg names come from the imported map, so they are set as text.
    name.textContent = marker.offscreen
      ? `${marker.name} · ${formatDistance(marker.distanceCells * tileSize)}`
      : marker.name;

    element.append(dot);
    if (marker.labelled) element.append(name);
    return element;
  });
}
