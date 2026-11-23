"""Character names from the map's own culture name bases, by a seeded letter-pair Markov chain (as Azgaar does)."""

import random
from collections import defaultdict
from typing import Any


class NameGenerator:
    def __init__(self, base: dict[str, Any]):
        words = [w.strip().lower() for w in str(base.get("b") or "").split(",") if w.strip().isalpha()]
        self.words = set(words)
        self.min = int(base.get("min") or 4)
        self.max = int(base.get("max") or 10)
        self.chain: dict[str, list[str]] = defaultdict(list)
        for w in words:
            padded = f"^^{w}$"
            for i in range(len(padded) - 2):
                self.chain[padded[i:i + 2]].append(padded[i + 2])

    def name(self, rng: random.Random, limit: int | None = None) -> str:
        """A new name in the base's style, at most `limit` letters when given (people's names run shorter than towns')."""
        top = min(self.max, limit) if limit else self.max
        if not self.chain:
            return f"Trader {rng.randint(100, 999)}"
        for _ in range(50):
            out, key = "", "^^"
            while len(out) < top:
                nxt = rng.choice(self.chain.get(key) or ["$"])
                if nxt == "$":
                    break
                out += nxt
                key = key[1] + nxt
            if min(self.min, top) <= len(out) <= top and out not in self.words:
                return out.capitalize()
        return out.capitalize() or "Nameless"


def generator_for(document: dict[str, Any], culture_index: int | None) -> NameGenerator:
    cultures = {c["i"]: c for c in document["pack"]["cultures"] if isinstance(c, dict)}
    bases = document.get("nameBases") or []
    base_index = (cultures.get(culture_index) or {}).get("base", 0)
    return NameGenerator(bases[base_index] if 0 <= base_index < len(bases) else {})
