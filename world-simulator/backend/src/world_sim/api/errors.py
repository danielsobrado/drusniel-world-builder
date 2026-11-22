from typing import Any

API_VERSION = 1


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details


def ok(world: dict[str, Any], data: Any, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    body = {"apiVersion": API_VERSION, "world": world, "data": data}
    if meta:
        body["meta"] = meta
    return body


def failure(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if details:
        error["details"] = details
    return {"apiVersion": API_VERSION, "error": error}
