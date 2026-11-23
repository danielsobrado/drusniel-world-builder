"""
Generated prose and conversations of one scenario, in SQLite beside its bundle. Prose is
stored with the hash of the facts it was written from, so it is shown as stale when the
person's record moves on; regenerating replaces the prose and never touches the facts.
"""

import json
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS biographies (person TEXT, kind TEXT, text TEXT, provider TEXT, model TEXT, facts_hash TEXT,
    day INTEGER, created TEXT, warnings TEXT, PRIMARY KEY (person, kind));
CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, person TEXT, title TEXT, day INTEGER, created TEXT);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation INTEGER, role TEXT, text TEXT, day INTEGER,
    created TEXT, provider TEXT, model TEXT, warnings TEXT);
CREATE INDEX IF NOT EXISTS conversations_person ON conversations (person, id);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages (conversation, id);
"""


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class NarrationStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with closing(sqlite3.connect(path)) as db, db:
            db.executescript(SCHEMA)

    def _db(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        return db

    def save_biography(self, person: str, kind: str, text: str, provider: str, model: str, facts_hash: str, day: int,
                       warnings: list[str]) -> None:
        with closing(self._db()) as db, db:
            db.execute("INSERT OR REPLACE INTO biographies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                       (person, kind, text, provider, model, facts_hash, day, _now(), json.dumps(warnings)))

    def biographies(self, person: str) -> list[dict[str, Any]]:
        with closing(self._db()) as db:
            rows = db.execute("SELECT * FROM biographies WHERE person = ?", (person,)).fetchall()
        return [{**dict(r), "warnings": json.loads(r["warnings"])} for r in rows]

    def written(self) -> set[tuple[str, str]]:
        with closing(self._db()) as db:
            return {(r[0], r[1]) for r in db.execute("SELECT person, kind FROM biographies").fetchall()}

    def start_conversation(self, person: str, title: str, day: int) -> dict[str, Any]:
        with closing(self._db()) as db, db:
            cur = db.execute("INSERT INTO conversations (person, title, day, created) VALUES (?, ?, ?, ?)", (person, title, day, _now()))
            return {"id": cur.lastrowid, "person": person, "title": title, "day": day}

    def conversations(self, person: str) -> list[dict[str, Any]]:
        with closing(self._db()) as db:
            rows = db.execute("SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation = c.id) AS messages "
                              "FROM conversations c WHERE person = ? ORDER BY id DESC", (person,)).fetchall()
        return [dict(r) for r in rows]

    def conversation(self, conversation: int) -> dict[str, Any] | None:
        with closing(self._db()) as db:
            row = db.execute("SELECT * FROM conversations WHERE id = ?", (conversation,)).fetchone()
        return dict(row) if row else None

    def add_message(self, conversation: int, role: str, text: str, day: int, provider: str | None = None, model: str | None = None,
                    warnings: list[str] | None = None) -> dict[str, Any]:
        with closing(self._db()) as db, db:
            cur = db.execute("INSERT INTO messages (conversation, role, text, day, created, provider, model, warnings) VALUES "
                             "(?, ?, ?, ?, ?, ?, ?, ?)", (conversation, role, text, day, _now(), provider, model,
                                                          json.dumps(warnings or [])))
            return {"id": cur.lastrowid, "conversation": conversation, "role": role, "text": text, "day": day, "provider": provider,
                    "model": model, "warnings": warnings or []}

    def messages(self, conversation: int) -> list[dict[str, Any]]:
        with closing(self._db()) as db:
            rows = db.execute("SELECT * FROM messages WHERE conversation = ? ORDER BY id", (conversation,)).fetchall()
        return [{**dict(r), "warnings": json.loads(r["warnings"] or "[]")} for r in rows]

    def memory(self, person: str, limit: int) -> list[str]:
        """What the traveller said to this person before, newest last, across conversations."""
        with closing(self._db()) as db:
            rows = db.execute("SELECT m.text FROM messages m JOIN conversations c ON c.id = m.conversation WHERE c.person = ? "
                              "AND m.role = 'user' ORDER BY m.id DESC LIMIT ?", (person, limit)).fetchall()
        return [r[0] for r in reversed(rows)]
