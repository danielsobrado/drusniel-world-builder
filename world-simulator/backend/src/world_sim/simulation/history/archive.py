"""
The append-only event archive of one scenario, in SQLite beside its scenario bundle.
Events are numbered by the scenario's counter (`seq`), which the canonical state
carries: restoring a snapshot cuts the archive back to the snapshot's counter, a branch
copies the events up to its snapshot, and a crash between appending and saving heals
on load by the same cut. A branch can therefore never see a sibling's future.
"""

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any

from .contracts import HistoryEvent

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, id TEXT UNIQUE, day INTEGER, kind TEXT, category TEXT,
    importance INTEGER, source TEXT, settlement TEXT, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS participants (seq INTEGER, person TEXT, role TEXT);
CREATE TABLE IF NOT EXISTS entities (seq INTEGER, entity TEXT);
CREATE INDEX IF NOT EXISTS participants_person ON participants (person, seq);
CREATE INDEX IF NOT EXISTS entities_entity ON entities (entity, seq);
CREATE INDEX IF NOT EXISTS events_day ON events (day, seq);
CREATE TABLE IF NOT EXISTS causes (seq INTEGER, cause TEXT);
CREATE INDEX IF NOT EXISTS causes_cause ON causes (cause, seq);
"""
CAUSES_VERSION = 1      # PRAGMA user_version once the causes table is filled for an archive made before it


class HistoryArchive:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._db()) as db, db:
            db.executescript(SCHEMA)
            if db.execute("PRAGMA user_version").fetchone()[0] < CAUSES_VERSION:      # an archive from before the index
                rows = db.execute("SELECT seq, body FROM events").fetchall()
                links = [(seq, c) for seq, body in rows for c in json.loads(body).get("causedBy", [])]
                db.executemany("INSERT INTO causes VALUES (?, ?)", links)
                db.execute(f"PRAGMA user_version = {CAUSES_VERSION}")

    def _db(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def append(self, events: list[HistoryEvent]) -> None:
        if not events:
            return
        with closing(self._db()) as db, db:
            db.executemany("INSERT OR REPLACE INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                           [(e.seq, e.id, e.day, e.kind, e.category, e.importance, e.source, e.settlementId, e.model_dump_json())
                            for e in events])
            people = [(e.seq, p.personId, p.role) for e in events for p in e.participants]
            db.executemany("INSERT INTO participants VALUES (?, ?, ?)", people)
            entities = [(e.seq, x) for e in events for x in {e.settlementId, e.routeId, e.businessId, e.caravanId, e.householdId,
                                                              e.locationId, *e.relatedEntities} if x]
            db.executemany("INSERT INTO entities VALUES (?, ?)", entities)
            db.executemany("INSERT INTO causes VALUES (?, ?)", [(e.seq, c) for e in events for c in e.causedBy])

    def cut(self, seq: int) -> None:
        """Forgets every event numbered `seq` or later."""
        with closing(self._db()) as db, db:
            for table in ("events", "participants", "entities", "causes"):
                db.execute(f"DELETE FROM {table} WHERE seq >= ?", (seq,))  # noqa: S608 - fixed table names

    def copy_to(self, other: "HistoryArchive", seq: int) -> None:
        """Copies the events numbered below `seq` into another (empty) archive, for a branch."""
        other.append(self.query(before=seq, limit=None))

    def count(self) -> int:
        with closing(self._db()) as db:
            return db.execute("SELECT COUNT(*) FROM events").fetchone()[0]

    def get(self, event_id: str) -> HistoryEvent | None:
        with closing(self._db()) as db:
            row = db.execute("SELECT body FROM events WHERE id = ?", (event_id,)).fetchone()
        return HistoryEvent(**json.loads(row[0])) if row else None

    def many(self, ids: list[str]) -> list[HistoryEvent]:
        if not ids:
            return []
        with closing(self._db()) as db:
            rows = db.execute(f"SELECT body FROM events WHERE id IN ({','.join('?' * len(ids))}) ORDER BY seq", ids).fetchall()  # noqa: S608
        return [HistoryEvent(**json.loads(r[0])) for r in rows]

    def consequences(self, event: HistoryEvent, limit: int = 20) -> list[HistoryEvent]:
        """Later events that name this one as a cause."""
        with closing(self._db()) as db:
            rows = db.execute("SELECT e.body FROM causes c JOIN events e ON e.seq = c.seq WHERE c.cause = ? ORDER BY c.seq LIMIT ?",
                              (event.id, limit)).fetchall()
        return [HistoryEvent(**json.loads(r[0])) for r in rows]

    def query(self, *, person: str | None = None, entity: str | None = None, kinds: list[str] | None = None,
              categories: list[str] | None = None, sources: list[str] | None = None, min_importance: int = 1,
              from_day: int | None = None, to_day: int | None = None, before: int | None = None, newest_first: bool = False,
              limit: int | None = 200, offset: int = 0) -> list[HistoryEvent]:
        where, args = ["e.importance >= ?"], [min_importance]
        joins = ""
        if person:
            joins += " JOIN participants p ON p.seq = e.seq AND p.person = ?"
            args.insert(0, person)
        if entity:
            joins += " JOIN entities x ON x.seq = e.seq AND x.entity = ?"
            args.insert(1 if person else 0, entity)
        for column, values in (("kind", kinds), ("category", categories), ("source", sources)):
            if values:
                where.append(f"e.{column} IN ({','.join('?' * len(values))})")
                args += values
        for clause, value in (("e.day >= ?", from_day), ("e.day <= ?", to_day), ("e.seq < ?", before)):
            if value is not None:
                where.append(clause)
                args.append(value)
        sql = (f"SELECT DISTINCT e.seq, e.body FROM events e{joins} WHERE {' AND '.join(where)} "  # noqa: S608 - built from fixed fragments
               f"ORDER BY e.day {'DESC' if newest_first else 'ASC'}, e.seq {'DESC' if newest_first else 'ASC'}")
        if limit is not None:
            sql += " LIMIT ? OFFSET ?"
            args += [limit, offset]
        with closing(self._db()) as db:
            rows = db.execute(sql, args).fetchall()
        return [HistoryEvent(**json.loads(r[1])) for r in rows]

    def summary(self, person: str | None = None) -> dict[str, Any]:
        with closing(self._db()) as db:
            if person:
                rows = db.execute("SELECT e.category, COUNT(*) FROM events e JOIN participants p ON p.seq = e.seq AND p.person = ? "
                                  "GROUP BY e.category", (person,)).fetchall()
            else:
                rows = db.execute("SELECT category, COUNT(*) FROM events GROUP BY category").fetchall()
        return dict(rows)
