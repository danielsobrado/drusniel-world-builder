"""`npm run audit`: build the world model and write the deterministic reports."""

import sys

from .. import log
from ..config import load_config
from ..reports.builder import build_reports
from ..reports.writer import write_reports
from ..world.model import build_world_model


def main() -> int:
    try:
        config = load_config()
        model = build_world_model(config)
        directory = config.root / config.simulator["output"]["directory"]
        written = write_reports(build_reports(model), directory)
        audit, pilot = model.audit, model.pilot
        log.info(
            "audit complete",
            mapId=audit["identity"]["mapId"],
            sourceFingerprint=audit["identity"]["sourceFingerprint"],
            counts=audit["counts"],
            referenceCheck=audit["referenceCheck"],
            population=audit["population"],
            invalidRecords=len(audit["invalidRecords"]),
            connectivity=model.connectivity["summary"],
            budgets=[{"target": b["target"], "allocated": b["allocated"], "feasible": b["feasible"]} for b in model.scenarios],
            pilot=[f"{r['role']}:{r['sourceId']} {r['name']} ({r['npcs']} NPCs)" for r in pilot["roles"]],
            pilotNpcs=pilot["totalNpcs"],
            output=str(directory.relative_to(config.root)),
            files=written,
        )
        return 0
    except Exception as exc:  # noqa: BLE001 - top-level CLI boundary logs and exits non-zero
        log.error("audit failed", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
