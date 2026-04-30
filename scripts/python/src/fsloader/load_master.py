"""Tier 2 — master data loader.

Reads the numbered YAML files in ``data/`` (10-accounts.yaml, 11-contacts.yaml,
…, 20-bookable-resources.yaml) and upserts each row by its declared
alternate key.

Each YAML file declares its target entity set, alt-key field, and rows in
the same shape the seed generator emits::

    entity_set: accounts
    alt_key_field: accountnumber
    rows:
      - accountnumber: DEMO-ACC-001
        name: Contoso HVAC Service
        address1_latitude: 47.6062
        address1_longitude: -122.3321
        # @odata.bind lookups by alt-key:
        primarycontactid@odata.bind: /contacts(emailaddress1='joe@contoso.example')
"""

from __future__ import annotations

import logging
from pathlib import Path

import yaml

from . import run_config
from .dataverse_client import DataverseClient

log = logging.getLogger(__name__)

# Master-data files load in numeric order. Generated/seeded files share this prefix range.
MASTER_PREFIXES = ("10-", "11-", "12-", "13-", "14-", "15-", "20-")


def run(client: DataverseClient, cfg: run_config.RunConfig, *, data_dir: Path) -> dict:
    files = _ordered_files(data_dir, MASTER_PREFIXES)
    total = 0
    errors: list[str] = []
    for f in files:
        try:
            n = _load_file(client, f)
            total += n
        except Exception as e:  # noqa: BLE001
            log.error("Master load failed for %s: %s", f.name, e)
            errors.append(f"{f.name}: {e}")
    return {"errors": errors, "rows": total, "files": [f.name for f in files]}


def _ordered_files(data_dir: Path, prefixes: tuple[str, ...]) -> list[Path]:
    out: list[Path] = []
    for f in sorted(data_dir.glob("*.yaml")):
        if any(f.name.startswith(p) for p in prefixes) and not f.name.endswith(".template.yaml"):
            out.append(f)
    return out


def _load_file(client: DataverseClient, path: Path) -> int:
    with path.open("r", encoding="utf-8") as fh:
        doc = yaml.safe_load(fh) or {}
    if not doc.get("rows"):
        log.info("No rows in %s; skipping", path.name)
        return 0
    entity_set = doc["entity_set"]
    alt_key_field = doc["alt_key_field"]
    rows = doc["rows"]
    log.info("Upserting %d rows into %s from %s", len(rows), entity_set, path.name)
    payloads: list[tuple[dict[str, str], dict]] = []
    for r in rows:
        if alt_key_field not in r:
            raise ValueError(f"row missing alt-key {alt_key_field!r} in {path.name}: {r!r}")
        key = {alt_key_field: str(r[alt_key_field])}
        attrs = {k: v for k, v in r.items() if k != alt_key_field}
        payloads.append((key, attrs))
    client.upsert_many(entity_set, payloads)
    return len(payloads)
