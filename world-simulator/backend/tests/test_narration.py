"""PR7: local-LLM biographies and the Dialogue Lab, with a fake provider standing in for the model."""

import time

import pytest
from fastapi.testclient import TestClient

from world_sim.api.app import create_app
from world_sim.narration import providers
from world_sim.narration.draft import DraftWriter
from world_sim.narration.factcheck import check, unknown_names
from world_sim.narration.providers import ProviderError, last_full_sentence, resolve


class FakeModel:
    name = "local-llm"
    model = "fake-1"

    def __init__(self, text: str = "A quiet life of honest work.", fail: bool = False):
        self.text, self.fail, self.calls = text, fail, []

    def complete(self, messages, max_tokens, kind, context):
        self.calls.append({"messages": messages, "kind": kind, "max_tokens": max_tokens})
        if self.fail:
            raise ProviderError("the local model did not answer: connection refused")
        return self.text if kind != "reply" else f"Well met. {self.text}"


def wait_for_jobs(client, timeout=10.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        jobs = client.get("/api/llm/jobs").json()["data"]
        if jobs and all(j["status"] in ("done", "failed") for j in jobs):
            return jobs
        time.sleep(0.05)
    raise AssertionError("jobs did not finish")


def a_master(client):
    people = client.get("/api/scenarios/baseline-pilot/people?role=trader").json()["data"]
    return people[0]


def test_status_reports_the_model_or_the_draft_writer(monkeypatch, config):
    with TestClient(create_app_for(config, FakeModel())) as client:
        status = client.get("/api/llm").json()["data"]
        assert status["mode"] == "llm" and status["model"] == "fake-1" and status["jobs"]["queued"] == 0
    monkeypatch.setattr(providers, "list_models", lambda url, timeout=3.0: None)
    provider, status = resolve(config.llm)
    assert isinstance(provider, DraftWriter) and status["mode"] == "draft" and "No local model server" in status["hint"]
    monkeypatch.setattr(providers, "list_models", lambda url, timeout=3.0: [])
    assert "ollama pull" in resolve(config.llm)[1]["hint"]
    monkeypatch.setattr(providers, "list_models", lambda url, timeout=3.0: ["qwen2.5:3b"])
    provider, status = resolve(config.llm)
    assert status["mode"] == "llm" and provider.model == "qwen2.5:3b", "the first model the server lists is used"


def create_app_for(config, provider):
    from world_sim.world.model import build_world_model
    return create_app(build_world_model(config), provider=provider)


@pytest.fixture
def lab(fresh_model):
    model = FakeModel()
    with TestClient(create_app(fresh_model, provider=model)) as client:
        client.post("/api/scenarios/baseline-pilot/step", json={"days": 720})
        yield client, model


def test_biographies_are_written_in_the_background_from_the_context(lab):
    client, model = lab
    master = a_master(client)
    base = f"/api/scenarios/baseline-pilot/people/{master['id']}"
    queued = client.post(f"{base}/biographies", json={"kinds": ["short", "self"]})
    assert queued.status_code == 202 and len(queued.json()["data"]) == 2
    jobs = wait_for_jobs(client)
    assert all(j["status"] == "done" for j in jobs)
    stored = {b["kind"]: b for b in client.get(f"{base}/biographies").json()["data"]}
    assert set(stored) == {"short", "self"} and stored["short"]["text"] == model.text
    assert stored["short"]["model"] == "fake-1" and stored["short"]["stale"] is False
    prompt = model.calls[0]["messages"]
    assert "Use only the facts listed here" in prompt[0]["content"]
    assert master["name"] in prompt[1]["content"] and '"milestones"' in prompt[1]["content"]
    assert client.post(f"{base}/biographies", json={"kinds": ["epic"]}).status_code == 400


def test_prose_goes_stale_when_the_life_record_moves_on(lab):
    client, _ = lab
    master = a_master(client)
    base = f"/api/scenarios/baseline-pilot/people/{master['id']}"
    client.post(f"{base}/biographies", json={"kinds": ["short"]})
    wait_for_jobs(client)
    client.post("/api/scenarios/baseline-pilot/step", json={"days": 1800})
    [bio] = client.get(f"{base}/biographies").json()["data"]
    assert bio["stale"] is True, "five more years on the road add milestones the prose does not know"


def test_the_fact_check_flags_invented_people_and_children(fresh_model):
    narrator_model = FakeModel()
    with TestClient(create_app(fresh_model, provider=narrator_model)) as client:
        lonely = next(p for p in client.get("/api/scenarios/baseline-pilot/people?pageSize=200").json()["data"]
                      if p["role"] == "worker" and not client.get(
                          f"/api/scenarios/baseline-pilot/people/{p['id']}/relationships").json()["data"].__len__() > 1)
        context = client.get(f"/api/scenarios/baseline-pilot/people/{lonely['id']}/context").json()["data"]
    has_child = any(r["kind"] == "parent" and r["direction"] == "from" for r in context["relationships"])
    warnings = check(f"{context['identity']['name']} raised three sons with his friend Zorblax before the war.", context)
    assert any("Zorblax" in w for w in warnings)
    assert any("war" in w for w in warnings)
    assert has_child or any("children" in w for w in warnings)
    assert check(f"{context['identity']['name']} was born in {context['identity']['birthplace']}.", context) == []


def test_possessives_contractions_and_sentence_openers_are_not_names():
    known = {"abraethei", "sshanderi"}
    text = "Abraethei's trade grew.\n\nUpon her return I'm told Sshanderi’s market thrived. She met Zorblax's brother."
    assert unknown_names(text, known) == {"Zorblax"}


def test_childhood_is_not_a_child_and_cut_replies_end_on_a_sentence():
    context = {"identity": {"name": "Abraethei Dormaen", "birthplace": "Sshanderi", "culture": "Darkhold", "home": "Sshanderi"},
               "work": {"workplace": None, "profession": None, "role": "trader"}, "relationships": [], "places": [],
               "milestones": [], "settlementHistory": [], "knowledge": [], "hooks": [], "household": None}
    assert check("As a child she watched the caravans.", context) == []
    assert check("She raised two sons.", context) == ["mentions children the record does not have"]
    assert last_full_sentence("I trade wool. What brings you to Ssh") == "I trade wool."
    assert last_full_sentence("No full stop here") == "No full stop here"


def test_the_draft_writer_only_states_recorded_facts(fresh_model):
    with TestClient(create_app(fresh_model, provider=DraftWriter())) as client:
        client.post("/api/scenarios/baseline-pilot/step", json={"days": 720})
        people = client.get("/api/scenarios/baseline-pilot/people?pageSize=30").json()["data"]
        writer = DraftWriter()
        for p in people:
            context = client.get(f"/api/scenarios/baseline-pilot/people/{p['id']}/context").json()["data"]
            for kind in ("short", "detailed", "self"):
                text = writer.complete([], 400, kind, context)
                assert check(text, context) == [], (p["id"], kind, text)


def test_dialogue_remembers_and_records_a_first_meeting(lab):
    client, model = lab
    master = a_master(client)
    base = f"/api/scenarios/baseline-pilot/people/{master['id']}"
    convo = client.post(f"{base}/conversations", json={"title": "At the gate"}).json()["data"]
    first = client.post(f"/api/scenarios/baseline-pilot/conversations/{convo['id']}/messages", json={"text": "I come from the coast."})
    assert first.status_code == 201
    mine, theirs = first.json()["data"]
    assert mine["role"] == "user" and theirs["role"] == "npc" and theirs["text"].startswith("Well met")
    met = client.get(f"{base}/timeline?source=player").json()["data"]
    assert len(met) == 1 and met[0]["kind"] == "met-player" and met[0]["participants"][0]["personId"] == master["id"]

    again = client.post(f"{base}/conversations", json={}).json()["data"]
    client.post(f"/api/scenarios/baseline-pilot/conversations/{again['id']}/messages", json={"text": "Any news?"})
    assert len(client.get(f"{base}/timeline?source=player").json()["data"]) == 1, "only the first meeting is history"
    system = model.calls[-1]["messages"][0]["content"]
    assert "I come from the coast." in system, "what the traveller said before is remembered"
    assert f"You are {master['name']} {master['family']}" in system
    detail = client.get(f"/api/scenarios/baseline-pilot/conversations/{convo['id']}").json()["data"]
    assert [m["role"] for m in detail["messages"]] == ["user", "npc"]
    assert client.post("/api/scenarios/baseline-pilot/conversations/9999/messages", json={"text": "hi"}).status_code == 404


def test_secrets_stay_out_of_the_prompt_and_a_dead_model_is_reported(fresh_model):
    model = FakeModel(fail=True)
    with TestClient(create_app(fresh_model, provider=model)) as client:
        master = a_master(client)
        convo = client.post(f"/api/scenarios/baseline-pilot/people/{master['id']}/conversations", json={}).json()["data"]
        res = client.post(f"/api/scenarios/baseline-pilot/conversations/{convo['id']}/messages", json={"text": "Hello"})
        assert res.status_code == 503 and res.json()["error"]["code"] == "llm_unavailable"
        context = client.get(f"/api/scenarios/baseline-pilot/people/{master['id']}/context").json()["data"]
        system = model.calls[0]["messages"][0]["content"]
        for k in context["knowledge"]:
            assert (k["event"] in system) == k["wouldTell"], "what a person would not tell is not in their prompt"
