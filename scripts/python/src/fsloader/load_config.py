"""Tier 1 — configuration data loader.

Two paths:

1. **Default (Windows):** delegate to ``pac data import`` on the
   ``config/data/fs-config-data.zip`` bundle. This is what Microsoft ships
   for the Configuration Migration Tool and is the supported path for
   FieldServiceStatus mapping, price-list defaults, etc.

2. **``--use-webapi-config`` (Linux):** load YAML rows under ``config/webapi/``
   directly via Dataverse Web API. Slower, and not a complete replacement
   for CMT — see docs/troubleshooting.md.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

import yaml

from . import run_config
from .dataverse_client import DataverseClient

log = logging.getLogger(__name__)


def run(
    client: DataverseClient,
    cfg: run_config.RunConfig,
    *,
    repo_root: Path,
    manifest_path: Path,
    use_webapi: bool,
) -> dict:
    """Apply Tier 1 configuration. Returns a summary dict."""
    if use_webapi:
        return _run_webapi(client, cfg, repo_root=repo_root)
    return _run_pac(client, cfg, repo_root=repo_root)


def _run_pac(client: DataverseClient, cfg: run_config.RunConfig, *, repo_root: Path) -> dict:
    pac = shutil.which("pac")
    if not pac:
        log.error("pac CLI not found on PATH. Install Power Platform CLI or use --use-webapi-config.")
        return {"errors": ["pac not found"], "rows": 0}

    bundle = repo_root / "config" / "data" / "fs-config-data.zip"
    if not bundle.exists():
        log.warning("CMT bundle missing: %s — skipping config track", bundle)
        return {"errors": [], "rows": 0, "skipped": True, "reason": "no bundle"}

    if client.dry_run:
        log.info("[dry-run] pac data import --data %s", bundle)
        return {"errors": [], "rows": 0, "dry_run": True}

    cmd = [pac, "data", "import", "--data", str(bundle)]
    log.info("Running: %s", " ".join(cmd))
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        log.error("pac data import failed: %s", e)
        return {"errors": [str(e)], "rows": 0}
    return {"errors": [], "rows": "imported via pac"}


def _run_webapi(client: DataverseClient, cfg: run_config.RunConfig, *, repo_root: Path) -> dict:
    """Linux fallback: load YAML rows under config/webapi/<entity>.yaml.

    Each file: ``{"entity_set": "...", "alt_key_field": "...", "rows": [...]}``
    """
    webapi_dir = repo_root / "config" / "webapi"
    if not webapi_dir.exists():
        log.warning("No config/webapi/ directory; skipping. Create it for Linux fallback.")
        return {"errors": [], "rows": 0, "skipped": True}

    total = 0
    errors: list[str] = []
    for yml in sorted(webapi_dir.glob("*.yaml")):
        try:
            with yml.open("r", encoding="utf-8") as f:
                doc = yaml.safe_load(f) or {}
            entity_set = doc["entity_set"]
            alt_key_field = doc["alt_key_field"]
            rows = doc.get("rows", [])
            log.info("Loading %s rows into %s from %s", len(rows), entity_set, yml.name)
            payloads = [
                ({alt_key_field: r[alt_key_field]}, {k: v for k, v in r.items() if k != alt_key_field})
                for r in rows
            ]
            client.upsert_many(entity_set, payloads)
            total += len(payloads)
        except Exception as e:  # noqa: BLE001
            log.error("Failed loading %s: %s", yml, e)
            errors.append(f"{yml.name}: {e}")
    return {"errors": errors, "rows": total}
