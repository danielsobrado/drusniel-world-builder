"""Runs the API with uvicorn on the configured loopback host and port.

    python -m world_sim.server [--reload] [--serve-frontend]
"""

import argparse
import os

import uvicorn

from . import log
from .config import SIMULATOR_ROOT, load_config


def main() -> None:
    parser = argparse.ArgumentParser(description="Drusniel World Simulator backend")
    parser.add_argument("--reload", action="store_true", help="restart on backend source changes")
    parser.add_argument("--serve-frontend", action="store_true", help="also serve frontend/dist")
    args = parser.parse_args()
    if args.serve_frontend:
        os.environ["WS_SERVE_FRONTEND"] = "1"
    server = load_config().simulator["server"]
    log.info("backend starting", url=f"http://{server['host']}:{server['port']}", servesFrontend=args.serve_frontend)
    uvicorn.run(
        "world_sim.api.app:create_app_from_env",
        factory=True,
        host=server["host"],
        port=server["port"],
        reload=args.reload,
        reload_dirs=[str(SIMULATOR_ROOT / "backend/src"), str(SIMULATOR_ROOT / "config")] if args.reload else None,
        reload_includes=["*.py", "*.yaml"] if args.reload else None,
        log_level="warning",
    )


if __name__ == "__main__":
    main()
