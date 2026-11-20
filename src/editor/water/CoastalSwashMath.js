export const COASTAL_SWASH_CHANNELS = Object.freeze({
  WETNESS: 0, FILM: 1, MOBILE_FOAM: 2, STRANDED_FOAM: 3,
});

export function coastalWindowOrigin(position, span, snapMeters) {
  return Math.floor((position - span * 0.5) / snapMeters) * snapMeters;
}

export function coastalScrollCells(previousOrigin, nextOrigin, texelMeters) {
  return Math.round((nextOrigin - previousOrigin) / texelMeters);
}

export function coastalDecay(seconds, lifetime) {
  return Math.exp(-Math.max(0, seconds) / lifetime);
}

export function coastalFlowVelocity(frontSpeed, landwardX, landwardZ, slope, film, config) {
  const directionLength = Math.hypot(landwardX, landwardZ);
  if (directionLength < 1e-6) return { x: 0, z: 0 };
  const speed = frontSpeed >= 0
    ? Math.min(frontSpeed / Math.max(config.minSlope, slope), config.maxUprushSpeed)
    : -Math.min(-frontSpeed / Math.max(config.minSlope, slope), config.maxBackwashSpeed);
  const filmFactor = 0.15 + 0.85 * Math.min(1, Math.max(0, film));
  return { x: landwardX / directionLength * speed * filmFactor,
    z: landwardZ / directionLength * speed * filmFactor };
}

export function coastalFoamStep({
  wetness, film, mobileFoam, strandedFoam, coverageNow, coveragePrevious, breaking, foamPattern,
  shelter = 1,
}, dt, config) {
  const advance = Math.max(0, coverageNow - coveragePrevious);
  const retreat = Math.max(0, coveragePrevious - coverageNow);
  const wet = Math.min(1, Math.max(wetness * coastalDecay(dt, config.wetSeconds), coverageNow));
  const thinFilm = Math.min(1, Math.max(film * coastalDecay(dt, config.filmSeconds), coverageNow));
  const lifetime = config.foamDrySeconds + (config.foamWetSeconds - config.foamDrySeconds) * thinFilm;
  const carried = Math.min(1, mobileFoam * coastalDecay(dt, lifetime)
    + config.foamInjection * advance * breaking * foamPattern
      * Math.min(1, Math.max(0, shelter)));
  const deposit = Math.min(carried, carried * retreat * config.foamDeposition);
  const stranded = Math.min(1, strandedFoam * coastalDecay(dt, config.strandedSeconds)
    * Math.exp(-config.washOff * advance) + deposit);
  return { wetness: wet, film: thinFilm, mobileFoam: carried - deposit, strandedFoam: stranded };
}
