"""
A cheap guard on generated text: names the record does not know, and claims about family,
war or magic that the record does not support. It flags rather than edits, so the text
and its warnings can be judged together and regenerated.
"""

import re
from typing import Any

COMMON = {
    "i", "he", "she", "they", "his", "her", "their", "the", "a", "an", "in", "on", "at", "of", "and", "but", "when", "after",
    "before", "years", "year", "around", "these", "days", "today", "now", "then", "there", "here", "my", "me", "we", "our", "you",
    "your", "it", "its", "as", "for", "with", "from", "by", "to", "into", "good", "day", "greetings", "yes", "no", "well", "ah",
    "aye", "times", "this", "that", "those", "since", "while", "though", "although", "life", "work", "town", "family",
    "people", "traveller", "traveler", "nothing", "something", "everyone", "nobody", "still", "once", "however", "born",
    "married", "worked", "working", "caravan", "master", "bandits", "pirates", "road", "market", "mother", "father", "son",
    "daughter", "wife", "husband", "brother", "sister", "friend", "children", "some", "many", "what", "who", "where", "why", "how",
    "if", "so", "not", "never", "always", "perhaps", "maybe", "indeed", "truly", "sometimes", "every", "each", "one", "two", "three",
}
CLAIMS = [
    (r"\b(sons?|daughters?|children|child|grandchild\w*)\b", "child", "mentions children the record does not have"),
    (r"\b(wife|wives|husbands?|married|widow\w*|spouses?)\b", "spouse", "mentions a spouse the record does not have"),
    (r"\b(wars?|battles?|sieges?|army|armies)\b", None, "mentions a war or battle the record does not hold"),
    (r"\b(magic\w*|spells?|wizards?|sorcer\w*|enchant\w*)\b", None, "mentions magic the record does not hold"),
]


def vocabulary(context: dict[str, Any]) -> set[str]:
    words: set[str] = set()

    def add(text: str | None) -> None:
        for w in re.findall(r"[A-Za-z][A-Za-z'\-]+", text or ""):
            words.add(w.lower())

    ident = context["identity"]
    for value in (ident["name"], ident["birthplace"], ident["culture"], ident["home"], context["work"]["workplace"],
                  context["work"]["profession"], context["work"]["role"], *(r["name"] for r in context["relationships"]),
                  *context["places"],
                  *(m["summary"] for m in context["milestones"]), *(e["summary"] for e in context["settlementHistory"]),
                  *(k["event"] for k in context["knowledge"]), *(h["text"] for h in context["hooks"]),
                  context["household"]["family"] if context["household"] else None):
        add(value)
    return words


def check(text: str, context: dict[str, Any]) -> list[str]:
    known = vocabulary(context) | COMMON
    warnings = []
    names = {w for w in re.findall(r"(?<![.!?]\s)(?<!^)\b([A-Z][a-z'\-]{2,})", text) if w.lower() not in known}
    if names:
        warnings.append("names the record does not know: " + ", ".join(sorted(names)[:8]))
    kinds = {r["kind"] for r in context["relationships"]}
    has_child = any(r["kind"] == "parent" and r["direction"] == "from" for r in context["relationships"])
    recorded = vocabulary(context)
    for pattern, needs, message in CLAIMS:
        said = {m.lower() for m in re.findall(pattern, text, re.IGNORECASE)}
        if not said or said <= recorded:
            continue        # absent, or the person's own record uses these very words
        supported = has_child if needs == "child" else (needs in kinds if needs else False)
        if not supported:
            warnings.append(message)
    return warnings
