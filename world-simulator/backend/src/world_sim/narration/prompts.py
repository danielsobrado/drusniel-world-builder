"""
Prompts for narration and dialogue, built from the biography context. The facts go in
as compact JSON with their sources and date precision; the restrictions go in the system
message; the length follows the person's tier.
"""

import json
from typing import Any

from .providers import Message

KINDS = {
    "short": "Write a short biography of {words} words in the third person.",
    "detailed": "Write a detailed biography of {words} words in the third person, in chronological order.",
    "style": "Describe in 2-4 sentences how this person speaks: tone, manner, favourite subjects. Do not narrate events.",
    "self": "Write how this person would introduce themselves to a stranger, in the first person, in under 120 words.",
}


def _facts(context: dict[str, Any]) -> str:
    keep = {k: context[k] for k in ("identity", "household", "work", "circumstances", "milestones", "settlementHistory", "places",
                                    "personality", "outlook", "hooks")}
    if "journeys" in context:
        keep["journeys"] = context["journeys"]
    if "culturalContext" in context:
        keep["culturalContext"] = context["culturalContext"]
    keep["relationships"] = [{k: r[k] for k in ("kind", "direction", "name", "alive", "since", "until")} for r in context["relationships"]]
    keep["knowledge"] = [k for k in context["knowledge"] if k["wouldTell"]]
    return json.dumps(keep, ensure_ascii=False, separators=(",", ":"))


# Scores and purses are simulation numbers; a person would never say "reputation 50.0".
NO_SCORES = "- Never quote scores, ratings or coin amounts as numbers; describe them in words (well regarded, comfortably off)."


def biography_messages(context: dict[str, Any], kind: str) -> list[Message]:
    low, high = context["targets"]["words"]
    words = f"{low}-{high}" if kind == "detailed" else f"{max(40, low // 2)}-{low}"
    rules = "\n".join(f"- {r}" for r in context["restrictions"])
    return [
        {"role": "system", "content": "You write character biographies for a fantasy world simulation. You only narrate facts you are "
                                      f"given.\nRules:\n{rules}\n- Write plain prose with no headings or lists.\n{NO_SCORES}"},
        {"role": "user", "content": f"{KINDS[kind].format(words=words)}\nFacts (JSON):\n{_facts(context)}"},
    ]


def dialogue_messages(context: dict[str, Any], history: list[Message], memory: list[str], said: str) -> list[Message]:
    ident = context["identity"]
    secrets = [k["event"] for k in context["knowledge"] if not k["wouldTell"]]
    rules = "\n".join(f"- {r}" for r in context["restrictions"])
    system = (
        f"You are {ident['name']}, speaking with a traveller in {ident['home']} on {context['asOf']}. Stay in character and answer "
        "in one to four sentences of plain speech.\n"
        f"Everything you know about yourself and your world is in these facts (JSON):\n{_facts(context)}\n"
        f"Rules:\n{rules}\n- If asked about something not in the facts, say you do not know or change the subject; never make it up.\n"
        "- Speak about what you were told or heard as hearsay, with the uncertainty it deserves.\n"
        f"{NO_SCORES}\n"
        + (f"- You also know of {len(secrets)} matters you keep to yourself; do not reveal them.\n" if secrets else "")
        + ("What the traveller told you before:\n" + "\n".join(f"- {m}" for m in memory) + "\n" if memory else "")
    )
    return [{"role": "system", "content": system}, *history, {"role": "user", "content": said}]
