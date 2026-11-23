"""
The built-in draft writer: plain sentences assembled only from the biography context,
for when no local model is available. It cannot invent anything, which makes it a useful
baseline as well as a fallback; its output is always labelled as a draft.
"""

from typing import Any

from .providers import Message

PRONOUN = {"female": "she", "male": "he"}
ROLE = {"child": "a young one", "unemployed": "looking for work", "retired": "retired", "trader": "caravan master",
        "outlaw": "living rough", "imprisoned": "in prison", "worker": "working"}


def _when(m: dict[str, Any]) -> str:
    year = m["date"][:4]
    return f"around {year}" if m["precision"] == "approximate" else f"in {year}"


def _topics(context: dict[str, Any]) -> str:
    return "; ".join(h["text"].lower() for h in context["hooks"])


def _without_name(summary: str, name: str) -> str:
    return summary[len(name) + 1:] if summary.startswith(name) else summary


class DraftWriter:
    name = "draft"
    model = "draft writer"

    def complete(self, messages: list[Message], max_tokens: int, kind: str, context: dict[str, Any]) -> str:
        if kind == "reply":
            return self.reply(messages[-1]["content"], context)
        ident, work = context["identity"], context["work"]
        name = ident["name"]
        they = PRONOUN.get(ident["sex"], "they")
        trade = work["profession"] or ROLE.get(work["role"], work["role"])
        if kind == "style":
            temperament = context["personality"].get("temperament", "plain")
            talks = _topics(context) or "daily work"
            return f"{name} speaks in a {temperament} way and is {context['outlook']['mood']} these days. " \
                   f"{they.capitalize()} talks most readily about {talks}."
        if kind == "self":
            hooks = " ".join(h["text"] + "." for h in context["hooks"])
            role = f"{trade} of {ident['home']}" if work["profession"] else f"of {ident['home']}, {trade}"
            return f"I am {name}, {role}, born {ident['born'][:4]} in {ident['birthplace']}. {hooks}".strip()
        lines = [f"{name} was born in {ident['born'][:4]} in {ident['birthplace']}."]
        events = context["milestones"] if kind == "detailed" else [m for m in context["milestones"] if m["kind"] != "born"][:3]
        for m in events:
            if m["kind"] != "born":
                lines.append(f"{_when(m).capitalize()}, {_without_name(m['summary'], name)}.".replace("..", "."))
        if work["workplace"]:
            lines.append(f"{they.capitalize()} works as {trade} at {work['workplace']}.")
        if kind == "detailed" and context["hooks"]:
            lines.append(f"These days {they} is {context['outlook']['mood']}: {_topics(context)}.")
        return " ".join(lines)

    def reply(self, said: str, context: dict[str, Any]) -> str:
        text = said.lower()
        ident, work = context["identity"], context["work"]
        if any(w in text for w in ("who are you", "your name", "hello", "greetings", "good day")):
            return f"Good day. I'm {ident['name']}, {work['profession'] or work['role']} here in {ident['home']}."
        if any(w in text for w in ("news", "heard", "rumour", "rumor", "happen")):
            told = [k for k in context["knowledge"] if k["wouldTell"]]
            if told:
                story = told[-1]["event"]
                return f"They say: {story}. I had it as a {told[-1]['how']} report, so take it as you will."
            history = context["settlementHistory"]
            return f"The last I remember: {history[0]['summary']}." if history else "Nothing much I could tell you."
        if any(w in text for w in ("family", "wife", "husband", "children", "son", "daughter")):
            kin = [r["name"] for r in context["relationships"] if r["kind"] in ("spouse", "parent", "sibling") and r["alive"]]
            return f"My family? {', '.join(kin)}." if kin else "I keep my own counsel about family."
        if any(w in text for w in ("work", "job", "trade")):
            return f"I work as {work['profession']} at {work['workplace']}." if work["workplace"] else "I'm without steady work just now."
        if context["hooks"]:
            return context["hooks"][0]["text"] + "."
        return f"Times are {context['outlook']['mood']} enough, I suppose."
