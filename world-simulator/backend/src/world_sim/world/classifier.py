from typing import Any


def classify_settlement(population: float, classes: list[dict[str, Any]]) -> dict[str, Any]:
    """First class whose maxPopulation the population is below; the last class is unbounded."""
    for entry in classes:
        if entry.get("maxPopulation") is None or population < entry["maxPopulation"]:
            return entry
    return classes[-1]


def class_distribution(settlements: list[dict[str, Any]], classes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for index, entry in enumerate(classes):
        members = [s for s in settlements if s["class"] == entry["id"]]
        rows.append({
            "id": entry["id"],
            "label": entry["label"],
            "minPopulation": classes[index - 1]["maxPopulation"] if index > 0 else 0,
            "maxPopulation": entry.get("maxPopulation"),
            "count": len(members),
            "population": sum(s["population"] for s in members),
        })
    return rows
