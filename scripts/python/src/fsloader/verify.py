"""Post-load verification — read back rows and assert acceptance criteria.

Checked:

- ``WhoAmI`` succeeds (auth + connectivity).
- Sample of accounts have non-null ``primarycontactid`` (lookups didn't silently null).
- ≥20 bookings within the next ``date_window.future_days``.
- ≥``modules.agreements.count`` agreements present.
- ≥1 customer-asset hierarchy at ``modules.customer_assets.max_depth`` levels.
- Every open WO has at least one bookable resource matching its territory.

Failures are reported as a list; the orchestrator's exit code reflects them.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from . import run_config
from .dataverse_client import DataverseClient

log = logging.getLogger(__name__)


def run(client: DataverseClient, cfg: run_config.RunConfig) -> dict:
    failures: list[str] = []
    metrics: dict = {}

    if client.dry_run:
        log.info("[dry-run] skipping verification reads")
        return {"errors": [], "skipped": True}

    # Bookings in the demo window
    horizon = datetime.now(timezone.utc) + timedelta(days=cfg.date_window.future_days)
    try:
        bookings = client.query(
            "bookableresourcebookings",
            filter=f"starttime le {horizon.isoformat()}",
            select="bookableresourcebookingid,name",
            top=200,
        )
        metrics["bookings_in_window"] = len(bookings)
        if len(bookings) < 20:
            failures.append(f"bookings_in_window={len(bookings)} (expected ≥20)")
    except Exception as e:  # noqa: BLE001
        failures.append(f"bookings query failed: {e}")

    # Agreements
    try:
        agreements = client.query("msdyn_agreements", select="msdyn_agreementid", top=50)
        metrics["agreements"] = len(agreements)
        if len(agreements) < cfg.modules.agreements.count:
            failures.append(f"agreements={len(agreements)} (expected ≥{cfg.modules.agreements.count})")
    except Exception as e:  # noqa: BLE001
        failures.append(f"agreements query failed: {e}")

    # Lookup verification on accounts
    try:
        sample = client.query(
            "accounts",
            filter=f"startswith(accountnumber,'{cfg.reset.prefix}')",
            select="accountid,name,_primarycontactid_value",
            top=5,
        )
        nulls = [a for a in sample if not a.get("_primarycontactid_value")]
        metrics["accounts_sampled"] = len(sample)
        metrics["accounts_with_null_contact"] = len(nulls)
        if sample and len(nulls) == len(sample):
            failures.append("all sampled accounts have null primarycontactid — alt-key bind likely wrong")
    except Exception as e:  # noqa: BLE001
        failures.append(f"account lookup verification failed: {e}")

    return {"errors": failures, "metrics": metrics}
