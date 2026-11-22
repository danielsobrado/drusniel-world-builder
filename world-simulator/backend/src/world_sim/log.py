"""One JSON object per line, so logs stay greppable and machine-readable."""

import json
import sys
import traceback
from datetime import UTC, datetime
from typing import Any


def _write(level: str, message: str, context: dict[str, Any]) -> None:
    line = json.dumps({"time": datetime.now(UTC).isoformat(), "level": level, "message": message, **context}, default=str)
    stream = sys.stderr if level in ("warn", "error") else sys.stdout
    stream.write(line + "\n")
    stream.flush()


def info(message: str, **context: Any) -> None:
    _write("info", message, context)


def warn(message: str, **context: Any) -> None:
    _write("warn", message, context)


def error(message: str, exc: BaseException | None = None, **context: Any) -> None:
    if exc is not None:
        context = {**context, "error": str(exc), "stack": "".join(traceback.format_exception(exc))}
    _write("error", message, context)
