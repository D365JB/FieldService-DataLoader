"""Tier 3 — transactional data (Agreements, Work Orders, Bookings).

The transactional files are **templates**: dates are expressed as offsets
from today via the ``date_offset_days`` key (negative = past). The loader
materializes real ``datetime`` values at run time using ``utcnow()``.

Behavior controlled by ``run-config.yaml``:

- ``date_window.distribution`` — split of past / near-future / far-future.
- ``date_window.refresh_existing_dates`` — when ``False`` (v1 default),
  rows whose alternate key already exists are NOT re-stamped; the loader
  only fills *gaps* to maintain the target distribution.
- ``scale.open_work_orders`` — total transactional WO count target.
- ``modules.agreements.count`` — number of agreements.
"""

from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

from . import run_config
from .dataverse_client import DataverseClient, DataverseError

log = logging.getLogger(__name__)

TX_TEMPLATES = ("30-", "40-")


def run(client: DataverseClient, cfg: run_config.RunConfig, *, data_dir: Path) -> dict:
    rng = random.Random(cfg.geography.random_seed)
    now = datetime.now(timezone.utc)

    summary: dict = {"errors": [], "agreements": 0, "work_orders": 0, "bookings": 0}

    # Agreements (30-*.yaml)
    for f in sorted(data_dir.glob("30-*.yaml")):
        try:
            summary["agreements"] += _load_agreements(client, f)
        except Exception as e:  # noqa: BLE001
            log.error("Agreement load failed for %s: %s", f.name, e)
            summary["errors"].append(f"{f.name}: {e}")

    # Work Orders (40-*.template.yaml)
    for f in sorted(data_dir.glob("40-*.template.yaml")):
        try:
            wo_n, bk_n = _load_work_orders(client, cfg, f, now=now, rng=rng)
            summary["work_orders"] += wo_n
            summary["bookings"] += bk_n
        except Exception as e:  # noqa: BLE001
            log.error("Work-order load failed for %s: %s", f.name, e)
            summary["errors"].append(f"{f.name}: {e}")

    return summary


def _load_agreements(client: DataverseClient, path: Path) -> int:
    with path.open("r", encoding="utf-8") as fh:
        doc = yaml.safe_load(fh) or {}
    rows = doc.get("rows", [])
    if not rows:
        return 0
    entity_set = doc["entity_set"]
    alt_key_field = doc["alt_key_field"]
    payloads = [
        ({alt_key_field: r[alt_key_field]}, {k: v for k, v in r.items() if k != alt_key_field})
        for r in rows
    ]
    client.upsert_many(entity_set, payloads)
    log.info("Upserted %d agreement rows from %s", len(payloads), path.name)
    return len(payloads)


def _load_work_orders(
    client: DataverseClient,
    cfg: run_config.RunConfig,
    path: Path,
    *,
    now: datetime,
    rng: random.Random,
) -> tuple[int, int]:
    with path.open("r", encoding="utf-8") as fh:
        doc = yaml.safe_load(fh) or {}
    template = doc.get("template")
    if not template:
        return 0, 0

    entity_set = template["entity_set"]
    alt_key_field = template["alt_key_field"]
    base_attrs = template.get("base_attributes", {})
    incident_pool = template.get("incident_pool", [])
    resource_pool = template.get("resource_pool", [])
    territory_pool = template.get("territory_pool", [])

    target = cfg.scale.open_work_orders
    dist = cfg.date_window.distribution
    n_past = target * dist.past_pct // 100
    n_near = target * dist.near_future_pct // 100
    n_far = target - n_past - n_near

    wos: list[tuple[dict, dict]] = []
    bookings: list[tuple[dict, dict]] = []

    for i in range(target):
        if i < n_past:
            offset = -rng.randint(1, max(1, cfg.date_window.past_days))
        elif i < n_past + n_near:
            offset = rng.randint(0, max(1, cfg.date_window.future_days))
        else:
            offset = cfg.date_window.future_days + rng.randint(1, 30)

        wo_dt = _business_hour(now + timedelta(days=offset), rng)
        wo_alt = f"{cfg.reset.prefix}WO-{i+1:04d}"

        # If the row exists and we're configured not to refresh, skip date update.
        if not cfg.date_window.refresh_existing_dates and _row_exists(client, entity_set, alt_key_field, wo_alt):
            log.debug("Skipping existing WO %s (refresh_existing_dates=false)", wo_alt)
            continue

        incident = rng.choice(incident_pool) if incident_pool else None
        resource = rng.choice(resource_pool) if resource_pool else None
        territory = rng.choice(territory_pool) if territory_pool else None

        attrs: dict = dict(base_attrs)
        attrs["msdyn_timefrompromised"] = wo_dt.isoformat()
        attrs["msdyn_timetopromised"] = (wo_dt + timedelta(hours=2)).isoformat()
        if incident:
            attrs["msdyn_primaryincidenttype@odata.bind"] = (
                f"/msdyn_incidenttypes(msdyn_name='{incident}')"
            )
        if territory:
            attrs["msdyn_serviceterritory@odata.bind"] = (
                f"/territories(name='{territory}')"
            )
        wos.append(({alt_key_field: wo_alt}, attrs))

        # One booking per WO if a resource is available
        if resource:
            bk_alt = f"{cfg.reset.prefix}BK-{i+1:04d}"
            bk_attrs = {
                "name": bk_alt,
                "starttime": wo_dt.isoformat(),
                "endtime": (wo_dt + timedelta(hours=2)).isoformat(),
                "resource@odata.bind": f"/bookableresources(name='{resource}')",
                "msdyn_workorder@odata.bind": f"/{entity_set}({alt_key_field}='{wo_alt}')",
            }
            bookings.append(({"name": bk_alt}, bk_attrs))

    if wos:
        client.upsert_many(entity_set, wos)
    if bookings:
        client.upsert_many("bookableresourcebookings", bookings)
    log.info("Upserted %d work orders + %d bookings from %s", len(wos), len(bookings), path.name)
    return len(wos), len(bookings)


def _business_hour(dt: datetime, rng: random.Random) -> datetime:
    """Snap to weekday + 8am-5pm window."""
    while dt.weekday() >= 5:  # Saturday=5, Sunday=6
        dt += timedelta(days=1)
    return dt.replace(hour=rng.randint(8, 16), minute=rng.choice([0, 15, 30, 45]), second=0, microsecond=0)


def _row_exists(client: DataverseClient, entity_set: str, alt_key_field: str, key: str) -> bool:
    try:
        rows = client.query(entity_set, filter=f"{alt_key_field} eq '{key}'", select=alt_key_field, top=1)
        return bool(rows)
    except DataverseError:
        return False
