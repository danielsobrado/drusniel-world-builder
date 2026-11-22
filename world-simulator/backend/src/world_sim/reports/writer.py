from pathlib import Path
from typing import Any

from ..canonical import canonical_json


def write_reports(reports: dict[str, Any], directory: Path) -> list[dict[str, Any]]:
    """Sorted-key JSON with a trailing newline: identical inputs give identical bytes."""
    directory.mkdir(parents=True, exist_ok=True)
    written = []
    for name in sorted(reports):
        data = canonical_json(reports[name]).encode("utf-8")
        (directory / name).write_bytes(data)
        written.append({"name": name, "bytes": len(data)})
    return written
