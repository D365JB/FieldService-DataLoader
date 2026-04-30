"""Reset — delete only loader-created rows.

Strategy: every row the loader writes carries the ``DEMO-`` prefix
(configurable via ``run-config.reset.prefix``) on its alternate-key field.
Reset queries Dataverse for those rows and deletes them in dependency-safe
order (children → parents).

For child entities that don't have a natural alt-key (notably
``bookableresourcebooking``), the reset traverses by parent: a booking is
deleted iff its work order has the demo prefix.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

from . import run_config
from .auth import from_env
from .dataverse_client import DataverseClient

log = logging.getLogger(__name__)

# Order matters: delete children before parents.
RESET_PLAN: list[dict] = [
    # Bookings — child of work order; filter by parent prefix.
    {
        "entity_set": "bookableresourcebookings",
        "filter_template": "startswith(name,'{prefix}')",
        "id_field": "bookableresourcebookingid",
    },
    # Resource Requirements
    {
        "entity_set": "msdyn_resourcerequirements",
        "filter_template": "startswith(msdyn_name,'{prefix}')",
        "id_field": "msdyn_resourcerequirementid",
    },
    # Work Order Incidents
    {
        "entity_set": "msdyn_workorderincidents",
        "filter_template": "startswith(msdyn_name,'{prefix}')",
        "id_field": "msdyn_workorderincidentid",
    },
    # Work Orders
    {
        "entity_set": "msdyn_workorders",
        "filter_template": "startswith(msdyn_name,'{prefix}')",
        "id_field": "msdyn_workorderid",
    },
    # Agreements (and children — booking setup, incidents, invoice setup)
    {
        "entity_set": "msdyn_agreementbookingincidents",
        "filter_template": "startswith(msdyn_name,'{prefix}')",
        "id_field": "msdyn_agreementbookingincidentid",
    },
    {
        "entity_set": "msdyn_agreementbookingsetups",
        "filter_template": "startswith(msdyn_name,'{prefix}')",
        "id_field": "msdyn_agreementbookingsetupid",
    },
    {
        "entity_set": "msdyn_agreementinvoicesetups",
        "filter_template": "startswith(msdyn_name,'{prefix}')",
        "id_field": "msdyn_agreementinvoicesetupid",
    },
    {
        "entity_set": "msdyn_agreements",
        "filter_template": "startswith(msdyn_name,'{prefix}')",
        "id_field": "msdyn_agreementid",
    },
    # Master data
    {
        "entity_set": "bookableresourcecharacteristics",
        "filter_template": "startswith(name,'{prefix}')",
        "id_field": "bookableresourcecharacteristicid",
    },
    {
        "entity_set": "bookableresources",
        "filter_template": "startswith(name,'{prefix}')",
        "id_field": "bookableresourceid",
    },
    {
        "entity_set": "msdyn_customerassets",
        "filter_template": "startswith(msdyn_name,'{prefix}')",
        "id_field": "msdyn_customerassetid",
    },
    {
        "entity_set": "msdyn_functionallocations",
        "filter_template": "startswith(msdyn_name,'{prefix}')",
        "id_field": "msdyn_functionallocationid",
    },
    {
        "entity_set": "products",
        "filter_template": "startswith(productnumber,'{prefix}')",
        "id_field": "productid",
    },
    {
        "entity_set": "contacts",
        "filter_template": "startswith(emailaddress1,'{prefix_lower}')",
        "id_field": "contactid",
    },
    {
        "entity_set": "accounts",
        "filter_template": "startswith(accountnumber,'{prefix}')",
        "id_field": "accountid",
    },
]


def reset(client: DataverseClient, prefix: str) -> dict:
    summary: dict = {"deleted_by_entity": {}, "errors": []}
    prefix_lower = prefix.lower()
    for step in RESET_PLAN:
        entity_set = step["entity_set"]
        flt = step["filter_template"].format(prefix=prefix, prefix_lower=prefix_lower)
        id_field = step["id_field"]
        try:
            rows = client.query(entity_set, filter=flt, select=id_field, top=5000)
            log.info("Resetting %s: %d rows match %r", entity_set, len(rows), flt)
            for row in rows:
                row_id = row[id_field]
                # Delete by primary key path, e.g. accounts(<guid>)
                try:
                    client._request("DELETE", f"{entity_set}({row_id})")  # noqa: SLF001
                except Exception as e:  # noqa: BLE001
                    summary["errors"].append(f"{entity_set}({row_id}): {e}")
            summary["deleted_by_entity"][entity_set] = len(rows)
        except Exception as e:  # noqa: BLE001
            log.error("Failed to query %s: %s", entity_set, e)
            summary["errors"].append(f"{entity_set}: {e}")
    return summary


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Delete loader-created rows by prefix.")
    p.add_argument("--run-config", required=True, type=Path)
    p.add_argument("--confirm", required=True,
                   help="Type the target env URL to confirm — must match run-config.target.env_url")
    p.add_argument("--env-file", type=Path, default=None)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)

    repo_root = args.run_config.parent
    env_file = args.env_file or (repo_root / ".env")
    if env_file.exists():
        load_dotenv(env_file)

    cfg = run_config.load(args.run_config)
    if args.confirm.rstrip("/") != cfg.target.env_url.rstrip("/"):
        print(f"REFUSED: --confirm {args.confirm!r} does not match target.env_url {cfg.target.env_url!r}",
              file=sys.stderr)
        return 2

    auth = from_env(env_url=cfg.target.env_url)
    client = DataverseClient(auth, dry_run=args.dry_run)
    log.info("Resetting rows with prefix %r on %s", cfg.reset.prefix, cfg.target.env_url)
    result = reset(client, cfg.reset.prefix)
    print(result)
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
