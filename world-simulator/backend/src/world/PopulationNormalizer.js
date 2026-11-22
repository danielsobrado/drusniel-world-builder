/**
 * Azgaar stores population in "points". Its UI converts them to inhabitants as
 *   burg:  population * populationRate * urbanization
 *   rural: cell.pop * populationRate
 * The game's SettlementProfile reads burg.population as thousands (correct only
 * while populationRate * urbanization = 1000); sim/import keeps the raw points.
 * The audit's canonical unit is inhabitants from the formulas above.
 */
export function populationScale(settings) {
  const populationRate = Number(settings.populationRate);
  const urbanization = Number(settings.urbanization);
  return {
    populationRate,
    urbanization,
    urbanInhabitantsPerPoint: populationRate * urbanization,
    ruralInhabitantsPerPoint: populationRate,
  };
}

export function burgInhabitants(points, scale) {
  return Math.round(Number(points) * scale.urbanInhabitantsPerPoint);
}

export function ruralInhabitants(cells, scale) {
  let points = 0;
  for (const cell of cells) points += Number(cell?.pop) || 0;
  return Math.round(points * scale.ruralInhabitantsPerPoint);
}

/** States where the game's "thousands" reading of burg.population diverges from inhabitants. */
export function interpretationNotes(scale) {
  const gameAssumes = 1000;
  return {
    canonical: 'inhabitants = burg.population * populationRate * urbanization',
    gameRenderingAssumption: 'SettlementProfile treats burg.population as thousands of inhabitants',
    simulationProjection: 'src/sim/import/projectAzgaarWorld.js stores raw burg.population points',
    gameRenderingAgrees: scale.urbanInhabitantsPerPoint === gameAssumes,
  };
}
