"""Noncanonical wall-clock diagnostics for simulation phases."""

from time import perf_counter


class PhaseTimings:
    def __init__(self) -> None:
        self.ms: dict[str, float] = {}
        self.started = perf_counter()

    def mark(self, name: str) -> None:
        now = perf_counter()
        self.ms[name] = self.ms.get(name, 0.0) + (now - self.started) * 1000
        self.started = now

    def report(self) -> dict[str, float]:
        return {name: round(value, 2) for name, value in self.ms.items()}
