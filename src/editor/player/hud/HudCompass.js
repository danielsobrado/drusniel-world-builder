import { formatDistance } from '../../map/minimapBurgMarkers.js';
import { COMPASS_POINTS, relativeBearing } from './hudBearing.js';
import { HUD_PHASE } from './hudState.js';

/** Degrees either side of straight ahead that the ribbon shows. */
const FIELD_DEGREES = 90;
/** A place this close to straight ahead is named below the ribbon. */
const FOCUS_DEGREES = 12;
const HEADING_EPSILON = 0.002;
const PLACE_REFRESH_MS = 500;

function createMark(className, label = '') {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = label;
  return element;
}

/**
 * Skyrim / Kingdom Come-inspired exploration compass across the top center:
 * restrained antique-gold horizon line, Cinzel cardinal letters, fine ticks,
 * and settlement / landmark bearings with focused distance readout.
 */
export class HudCompass {
  constructor({ getFocusPoint = () => null, getPlaces = () => [] } = {}) {
    this.getFocusPoint = getFocusPoint;
    this.getPlaces = getPlaces;
    this.heading = Number.NaN;
    this.nextPlacesAt = 0;
    this.placesSignature = '';
    this.placeMarks = [];
    this.focusText = '';
    this.enabled = true;

    this.element = document.createElement('div');
    this.element.className = 'hud-compass';
    this.element.hidden = true;
    this.element.setAttribute('aria-hidden', 'true');
    this.focus = createMark('hud-compass__focus');
    this.track = createMark('hud-compass__track');
    this.element.append(this.track, createMark('hud-compass__pointer'), this.focus);
    this.pointMarks = COMPASS_POINTS.map((point) => {
      const element = createMark(`hud-compass__point${point.label ? '' : ' is-tick'}`, point.label);
      if (point.label.length === 1) element.classList.add('is-cardinal');
      if (point.label === 'N') element.classList.add('is-north');
      return { ...point, element };
    });
    this.track.append(...this.pointMarks.map(({ element }) => element));
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.element.hidden = true;
  }

  render(phase) {
    this.element.hidden = phase !== HUD_PHASE.walking || !this.enabled;
    if (this.element.hidden) this.heading = Number.NaN;
  }

  update(heading, nowMs) {
    if (!this.enabled || !Number.isFinite(heading)) return;
    const placesChanged = nowMs >= this.nextPlacesAt && this.refreshPlaces(nowMs);
    if (!placesChanged && Math.abs(heading - this.heading) < HEADING_EPSILON) return;
    this.heading = heading;
    for (const mark of this.pointMarks) placeMark(mark, heading);

    let focused = null;
    let focusedBearing = FOCUS_DEGREES;
    for (const mark of this.placeMarks) {
      const bearing = Math.abs(placeMark(mark, heading));
      if (bearing < focusedBearing) {
        focused = mark;
        focusedBearing = bearing;
      }
    }
    const text = focused ? `${focused.name} · ${formatDistance(focused.metres)}` : '';
    if (text === this.focusText) return;
    this.focusText = text;
    this.focus.textContent = text;
  }

  refreshPlaces(nowMs) {
    this.nextPlacesAt = nowMs + PLACE_REFRESH_MS;
    const point = this.getFocusPoint();
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
    const places = this.getPlaces(point);
    const signature = places.map(({ id }) => id).join();
    if (signature !== this.placesSignature) {
      this.placesSignature = signature;
      for (const { element } of this.placeMarks) element.remove();
      this.placeMarks = places.map((place) => {
        const element = createMark('hud-compass__place');
        element.classList.toggle('is-capital', Boolean(place.capital));
        element.classList.toggle('is-landmark', place.kind === 'landmark');
        element.style.setProperty('--place-color', place.color ?? 'var(--ds-parchment)');
        this.track.append(element);
        return { ...place, element };
      });
      return true;
    }
    this.placeMarks.forEach((mark, index) => Object.assign(mark, places[index]));
    return places.length > 0;
  }

  dispose() {
    this.element.remove();
  }
}

function placeMark(mark, heading) {
  const bearing = relativeBearing(mark.worldDx, mark.worldDz, heading);
  const visible = Math.abs(bearing) <= FIELD_DEGREES;
  mark.element.style.visibility = visible ? '' : 'hidden';
  if (visible) mark.element.style.setProperty('--mark-at', (bearing / FIELD_DEGREES).toFixed(4));
  return bearing;
}
