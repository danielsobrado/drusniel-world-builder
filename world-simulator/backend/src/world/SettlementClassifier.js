/** First class whose maxPopulation the population is below; the last class is unbounded. */
export function classifySettlement(population, classes) {
  return classes.find((entry) => entry.maxPopulation == null || population < entry.maxPopulation) ?? classes.at(-1);
}

export function classDistribution(settlements, classes) {
  return classes.map((entry) => {
    const members = settlements.filter((s) => s.class === entry.id);
    return {
      id: entry.id,
      label: entry.label,
      minPopulation: classes[classes.indexOf(entry) - 1]?.maxPopulation ?? 0,
      maxPopulation: entry.maxPopulation ?? null,
      count: members.length,
      population: members.reduce((sum, s) => sum + s.population, 0),
    };
  });
}
