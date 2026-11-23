"""
Who writes the words. An OpenAI-compatible local server (Ollama, LM Studio, llama.cpp)
when one is reachable with a model; otherwise the built-in draft writer, which composes
plain sentences strictly from the recorded facts. Either way the simulation's facts are
inputs only: nothing a provider writes flows back into the state.
"""

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol

Message = dict[str, str]


class Provider(Protocol):
    name: str
    model: str

    def complete(self, messages: list[Message], max_tokens: int, kind: str, context: dict[str, Any]) -> str: ...


class ProviderError(RuntimeError):
    pass


@dataclass
class OpenAICompatible:
    """POSTs to <baseUrl>/chat/completions with the standard library; only local servers are expected."""
    base_url: str
    model: str
    timeout: float
    temperature: float
    seed: int | None
    reasoning_effort: str | None = None
    name: str = "local-llm"

    def complete(self, messages: list[Message], max_tokens: int, kind: str, context: dict[str, Any]) -> str:
        body = {"model": self.model, "messages": messages, "max_tokens": max_tokens, "temperature": self.temperature, "stream": False}
        if self.seed is not None:
            body["seed"] = self.seed
        if self.reasoning_effort is not None:
            body["reasoning_effort"] = self.reasoning_effort
        request = urllib.request.Request(f"{self.base_url.rstrip('/')}/chat/completions", data=json.dumps(body).encode(),
                                         headers={"content-type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:  # noqa: S310 - configured local server
                data = json.loads(response.read())
        except urllib.error.HTTPError as exc:
            # The server's own reason (e.g. Bionic's "Failed to load model") says what to do; "HTTP Error 400" does not.
            reason = exc.read().decode(errors="replace")[:300]
            raise ProviderError(f"the local model server refused ({exc.code}): {reason}") from exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise ProviderError(f"the local model did not answer: {exc}") from exc
        try:
            choice = data["choices"][0]
            text = str(choice["message"]["content"]).strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError("the local model's answer had no message") from exc
        if not text:
            raise ProviderError("the local model returned no text; a thinking model may have spent its tokens reasoning "
                                "(see reasoningEffort)")
        return last_full_sentence(text) if choice.get("finish_reason") == "length" else text


def last_full_sentence(text: str) -> str:
    """A reply cut off by the token limit, ended at its last complete sentence (unchanged when none ends)."""
    end = max(text.rfind(p) for p in (".", "!", "?", "…", '."', '!"', '?"'))
    return text[: end + 1].rstrip() if end > 0 else text


def _get(url: str, timeout: float) -> dict[str, Any] | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:  # noqa: S310 - configured local server
            return json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return None


def list_models(base_url: str, timeout: float = 3.0) -> list[str] | None:
    """Model ids the server offers, or None when it cannot be reached. Older Ollama lacks /v1/models but lists /api/tags."""
    base = base_url.rstrip("/")
    data = _get(f"{base}/models", timeout)
    if data is not None:
        return sorted(str(m.get("id")) for m in data.get("data") or [] if isinstance(m, dict) and m.get("id"))
    tags = _get(f"{base.removesuffix('/v1')}/api/tags", timeout)
    if tags is not None:
        return sorted(str(m.get("name")) for m in tags.get("models") or [] if isinstance(m, dict) and m.get("name"))
    return None


def resolve(cfg: dict[str, Any]) -> tuple[Provider, dict[str, Any]]:
    """The provider to use now, and a status the UI can show (with a hint when no model is available)."""
    from .draft import DraftWriter

    models = list_models(cfg["baseUrl"]) if cfg.get("baseUrl") else None
    model = cfg.get("model") or (models[0] if models else None)
    status: dict[str, Any] = {"baseUrl": cfg.get("baseUrl"), "reachable": models is not None, "models": models or [],
                              "configuredModel": cfg.get("model")}
    if model and models is not None and (not cfg.get("model") or cfg["model"] in models):
        provider = OpenAICompatible(cfg["baseUrl"], model, cfg["timeoutSeconds"], cfg["temperature"], cfg.get("seed"),
                                    cfg.get("reasoningEffort"))
        return provider, {**status, "mode": "llm", "provider": provider.name, "model": model, "hint": None}
    if models is None:
        hint = (f"No local model server answered at {cfg.get('baseUrl')}. Start Bionic (LM Studio) and its server, "
                "or Ollama or llama.cpp with WS_LLM_BASE_URL.")
    elif not models:
        hint = "The local server has no models. With Ollama, pull a chat model: ollama pull phi3 (or qwen2.5:3b on Ollama 0.3 or later)"
    else:
        hint = (f"Model {cfg.get('model')} is not on the server; it offers {', '.join(models[:5])}. "
                "Download it, or set WS_LLM_MODEL.")
    return DraftWriter(), {**status, "mode": "draft", "provider": "draft", "model": "draft writer", "hint": hint}
