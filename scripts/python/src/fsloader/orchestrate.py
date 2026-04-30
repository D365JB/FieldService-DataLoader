"""Orchestrator — single CLI entry point for the loader.

Reads ``run-config.yaml`` + ``config/manifest.yaml`` and runs each enabled
track in order: config → master → transactional → verify.

Examples
--------
Dry-run::

    python -m fsloader.orchestrate --run-config run-config.yaml --dry-run

Apply, skipping config (because it ran on a Windows job earlier)::

    python -m fsloader.orchestrate --run-config run-config.yaml --skip-config

Linux-only path using Web API for config rows (slower)::

    python -m fsloader.orchestrate --run-config run-config.yaml --use-webapi-config
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from rich.console import Console
from rich.logging import RichHandler

from . import load_config, load_master, load_transactional, run_config, verify
from .auth import AuthConfig
from .dataverse_client import DataverseClient

console = Console()
log = logging.getLogger("fsloader")


def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=level,
        format="%(message)s",
        datefmt="[%X]",
        handlers=[RichHandler(console=console, rich_tracebacks=True, show_path=False)],
    )


def _resolve_repo_root(start: Path) -> Path:
    """Walk up looking for a marker (config/manifest.yaml or .git)."""
    cur = start.resolve()
    for parent in [cur, *cur.parents]:
        if (parent / "config" / "manifest.yaml").exists() or (parent / ".git").exists():
            return parent
    return cur


def _build_auth(cfg: run_config.RunConfig) -> AuthConfig:
    method = cfg.target.auth_method
    tenant = cfg.target.tenant_id or os.environ.get("TENANT_ID")
    client = cfg.target.client_id or os.environ.get("CLIENT_ID")
    secret = os.environ.get("CLIENT_SECRET")
    if not tenant or not client:
        raise RuntimeError("tenant_id and client_id required (set in run-config or env)")
    if method == "service_principal" and not secret:
        raise RuntimeError("service_principal auth requires CLIENT_SECRET env var")
    return AuthConfig(
        tenant_id=tenant,
        client_id=client,
        env_url=cfg.target.env_url,
        client_secret=secret,
        method=method,
    )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="fsloader", description="D365 Field Service demo loader")
    p.add_argument("--run-config", required=True, type=Path, help="Path to run-config.yaml")
    p.add_argument("--data-dir", type=Path, default=None, help="Override path to /data")
    p.add_argument("--manifest", type=Path, default=None, help="Override path to config/manifest.yaml")
    p.add_argument("--dry-run", action="store_true", help="Validate + log; perform no writes")
    p.add_argument("--skip-config", action="store_true", help="Skip Tier 1 config track")
    p.add_argument("--use-webapi-config", action="store_true",
                   help="Load Tier 1 config via Web API instead of pac data import")
    p.add_argument("--track", choices=["config", "master", "transactional", "verify"],
                   action="append", help="Run only specified track(s); repeatable")
    p.add_argument("--env-file", type=Path, default=None, help="Path to .env (default: repo root)")
    args = p.parse_args(argv)

    repo_root = _resolve_repo_root(args.run_config.parent)
    env_file = args.env_file or (repo_root / ".env")
    if env_file.exists():
        load_dotenv(env_file)

    cfg = run_config.load(args.run_config)
    _setup_logging(cfg.logging.level)
    log.info("Loaded run-config: run_id=%s vertical=%s scale=%s",
             cfg.run_id, cfg.vertical, cfg.scale.model_dump())

    auth = _build_auth(cfg)
    client = DataverseClient(auth, dry_run=args.dry_run)

    # Probe connectivity early
    try:
        who = client.whoami()
        log.info("Connected to Dataverse as user %s", who.get("UserId", "(dry-run)"))
    except Exception as e:  # noqa: BLE001
        log.error("Connectivity check failed: %s", e)
        return 3

    data_dir = args.data_dir or (repo_root / "data")
    manifest_path = args.manifest or (repo_root / "config" / "manifest.yaml")

    tracks_to_run = set(args.track) if args.track else {"config", "master", "transactional", "verify"}
    if args.skip_config:
        tracks_to_run.discard("config")

    started = time.time()
    summary: dict[str, dict] = {}

    if "config" in tracks_to_run and cfg.modules.config.enabled:
        log.info("[bold cyan]Track 1: config[/]", extra={"markup": True})
        summary["config"] = load_config.run(
            client, cfg, repo_root=repo_root, manifest_path=manifest_path,
            use_webapi=args.use_webapi_config or cfg.modules.config.use_webapi,
        )

    if "master" in tracks_to_run and cfg.modules.master.enabled:
        log.info("[bold cyan]Track 2: master[/]", extra={"markup": True})
        summary["master"] = load_master.run(client, cfg, data_dir=data_dir)

    if "transactional" in tracks_to_run and cfg.modules.transactional.enabled:
        log.info("[bold cyan]Track 3: transactional[/]", extra={"markup": True})
        summary["transactional"] = load_transactional.run(client, cfg, data_dir=data_dir)

    if "verify" in tracks_to_run:
        log.info("[bold cyan]Track 4: verify[/]", extra={"markup": True})
        summary["verify"] = verify.run(client, cfg)

    elapsed = time.time() - started
    console.rule(f"[bold green]Done in {elapsed:.1f}s")
    for track, result in summary.items():
        console.print(f"  [cyan]{track}[/]: {result}")
    failed = any(r.get("errors") for r in summary.values() if isinstance(r, dict))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
