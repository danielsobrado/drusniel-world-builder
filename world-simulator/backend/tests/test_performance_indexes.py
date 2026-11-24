from world_sim.simulation.people.relationships import Ties
from world_sim.simulation.store import ScenarioStore


def test_relationship_indexes_keep_order_and_history():
    ties = Ties([], 0)
    first = ties.add("friend", "a", "b", 1)
    second = ties.add("parent", "a", "c", 2)
    ties.add("friend", "b", "a", 3)
    assert ties.of("a", active=False)[0] == first
    assert ties.children("a") == ["c"]
    assert ties.parents("c") == ["a"]
    assert ties.linked("b", "a", "friend")
    ties.adjust("b", "a", 0.2)
    assert ties.of("a", "friend")[0].trust == 0.8
    assert [r.id for r in ties.end("a", 4, {"friend"})] == [first.id, ties.items[2].id]
    assert not ties.linked("a", "b", "friend")
    assert ties.of("a") == [second]
    rebuilt = Ties(ties.items, ties.seq)
    assert rebuilt.of("a", active=False) == ties.of("a", active=False)


def test_snapshot_metadata_is_cached_and_invalidated(tmp_path, monkeypatch):
    store = ScenarioStore(tmp_path)
    store.save_snapshot("scenario", {"id": "snap-001", "label": "first"}, {"large": [1] * 100})
    assert store.snapshots("scenario")[0]["label"] == "first"
    import world_sim.simulation.store as module
    original = module._read
    calls = []

    def counted(path):
        calls.append(path)
        return original(path)

    monkeypatch.setattr(module, "_read", counted)
    assert store.snapshots("scenario")[0]["label"] == "first"
    assert not calls
    store.save_snapshot("scenario", {"id": "snap-001", "label": "updated"}, {"large": [2] * 200})
    assert store.snapshots("scenario")[0]["label"] == "updated"
    assert len(calls) == 1
