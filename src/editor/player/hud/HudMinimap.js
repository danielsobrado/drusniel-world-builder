import { HUD_PHASE } from './hudState.js';

/** Base borrowed bitmap scale factor inside the circular dial. */
export const MAP_ZOOM = 1.7;
const ZOOM_SCALE = Object.freeze({
  close: 1.35,
  standard: 1,
  wide: 0.72,
});
const RECENTER_FRACTION = 0.17;
const HEADING_EPSILON = 0.002;
const OFFSET_EPSILON = 0.0004;
const PLACE_REFRESH_MS = 400;
const REGION_BADGE_MS = 4000;

const MARKUP = `
  <div class="hud-minimap__disc">
    <div class="hud-minimap__dial">
      <span class="hud-minimap__view"></span>
      <svg class="hud-minimap__player" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 16.8 14a5 5 0 1 1-9.6 0L12 3Z"/>
        <circle cx="12" cy="15.4" r="1.8" fill="currentColor" stroke="none"/>
      </svg>
    </div>
    <div class="hud-minimap__compass"><span class="hud-minimap__north">N</span></div>
  </div>
  <div class="hud-minimap__region" hidden></div>
`;

/**
 * Desaturated cartographic minimap in the top-right corner while walking.
 * Features a thin 1px antique-gold hairline ring, configurable zoom presets
 * (close / standard / wide), and a quiet transient region subtitle on entry
 * rather than a permanent biome badge.
 */
export class HudMinimap {
  constructor({
    getFrame,
    getWindow,
    recenter,
    getFocusPoint,
    describeRegion = null,
    setZoom = null,
  }) {
    this.getFrame = getFrame;
    this.frame = null;
    this.getWindow = getWindow;
    this.recenter = recenter;
    this.getFocusPoint = getFocusPoint;
    this.describeRegion = describeRegion;
    this.setZoom = setZoom;
    this.home = null;
    this.enabled = true;
    this.zoomPreset = 'standard';
    this.regionHideTimer = 0;

    this.element = document.createElement('div');
    this.element.className = 'hud-minimap';
    this.element.hidden = true;
    this.element.setAttribute('aria-hidden', 'true');
    this.element.style.setProperty('--hud-map-zoom', String(MAP_ZOOM));
    this.element.innerHTML = MARKUP;
    this.dial = this.element.querySelector('.hud-minimap__dial');
    this.region = this.element.querySelector('.hud-minimap__region');
    this.resetReadout();
  }

  setEnabled(enabled) {
    const next = Boolean(enabled);
    if (next === this.enabled) return;
    this.enabled = next;
    if (!this.enabled) {
      this.element.hidden = true;
      this.undock();
    }
  }

  setZoomPreset(preset) {
    const factor = ZOOM_SCALE[preset] ?? ZOOM_SCALE.standard;
    this.zoomPreset = preset;
    const regionChanged = this.setZoom?.(preset) ?? false;
    // For local cell maps without Azgaar region zoom, scale the dial zoom slightly.
    const dialZoom = regionChanged ? MAP_ZOOM : MAP_ZOOM * factor;
    this.element.style.setProperty('--hud-map-zoom', dialZoom.toFixed(3));
    if (this.home) {
      const point = this.getFocusPoint?.();
      if (point && Number.isFinite(point.x) && Number.isFinite(point.z)) {
        this.recenter({ x: Math.floor(point.x), z: Math.floor(point.z) });
        this.offsetX = Number.NaN;
        this.offsetZ = Number.NaN;
        this.updateOffset(point);
      }
    }
  }

  render(phase) {
    if (phase !== HUD_PHASE.walking || !this.enabled) {
      this.element.hidden = true;
      this.undock();
      return;
    }
    this.dock();
    this.element.hidden = !this.home;
  }

  update(heading, nowMs) {
    if (!this.home || !this.enabled) return;
    this.updateHeading(heading);
    const point = this.getFocusPoint?.();
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    this.updateOffset(point);
    if (nowMs >= this.nextPlaceAt) {
      this.nextPlaceAt = nowMs + PLACE_REFRESH_MS;
      this.updateRegion(point);
    }
  }

  dock() {
    if (this.home) return;
    this.frame = this.getFrame?.() ?? null;
    if (!this.frame) return;
    this.home = { parent: this.frame.parentNode, next: this.frame.nextSibling };
    this.dial.prepend(this.frame);
    this.resetReadout();
    const point = this.getFocusPoint?.();
    if (point && Number.isFinite(point.x) && Number.isFinite(point.z)) {
      this.recenter({ x: Math.floor(point.x), z: Math.floor(point.z) });
    }
  }

  undock() {
    if (!this.home) return;
    const { parent, next } = this.home;
    const frame = this.frame;
    this.home = null;
    this.frame = null;
    if (!parent) {
      frame.remove();
      return;
    }
    parent.insertBefore(frame, next?.parentNode === parent ? next : null);
  }

  resetReadout() {
    this.heading = Number.NaN;
    this.offsetX = Number.NaN;
    this.offsetZ = Number.NaN;
    this.regionName = undefined;
    this.nextPlaceAt = 0;
  }

  updateHeading(heading) {
    if (!Number.isFinite(heading) || Math.abs(heading - this.heading) < HEADING_EPSILON) return;
    this.heading = heading;
    this.element.style.setProperty('--hud-heading', `${heading.toFixed(4)}rad`);
  }

  offsetFrom(point) {
    const window = this.getWindow();
    if (!window?.center || !(window.cells > 0)) return null;
    return {
      x: (point.x - window.center.x) / window.cells,
      z: (window.center.z - point.z) / window.cells,
    };
  }

  updateOffset(point) {
    let offset = this.offsetFrom(point);
    if (offset && Math.hypot(offset.x, offset.z) > RECENTER_FRACTION) {
      this.recenter({ x: Math.floor(point.x), z: Math.floor(point.z) });
      offset = this.offsetFrom(point);
    }
    if (!offset) return;
    if (Math.abs(offset.x - this.offsetX) < OFFSET_EPSILON
        && Math.abs(offset.z - this.offsetZ) < OFFSET_EPSILON) return;
    this.offsetX = offset.x;
    this.offsetZ = offset.z;
    this.element.style.setProperty('--hud-map-x', offset.x.toFixed(5));
    this.element.style.setProperty('--hud-map-z', offset.z.toFixed(5));
  }

  updateRegion(point) {
    const regionName = this.describeRegion?.(Math.floor(point.x), Math.floor(point.z)) ?? null;
    if (regionName === this.regionName) return;
    this.regionName = regionName;
    clearTimeout(this.regionHideTimer);
    if (!regionName) {
      this.region.hidden = true;
      this.region.textContent = '';
      return;
    }
    this.region.textContent = regionName;
    this.region.hidden = false;
    this.region.classList.remove('is-fading');
    this.regionHideTimer = setTimeout(() => {
      this.region.classList.add('is-fading');
    }, REGION_BADGE_MS);
  }

  dispose() {
    clearTimeout(this.regionHideTimer);
    this.undock();
    this.element.remove();
  }
}
