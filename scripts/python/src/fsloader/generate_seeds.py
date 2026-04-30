"""Seed generator — preset + scale + geography → ``data/*.yaml``.

Reads a vertical preset (``ui-streamlit/presets/<vertical>.yaml``) and the
relevant fields of ``run-config.yaml``, then writes the numbered seed YAML
files under ``data/`` that the loaders consume.

This is the **only** code path the Streamlit UI uses to materialize seeds —
the UI never touches Dataverse directly.
"""

from __future__ import annotations

import argparse
import logging
import random
import sys
from pathlib import Path

import yaml
from faker import Faker

from . import run_config

log = logging.getLogger(__name__)

# Approximate metro centers (lat, lon). Used for clustering accounts/resources.
METROS: dict[str, tuple[float, float]] = {
    "seattle":       (47.6062, -122.3321),
    "dallas":        (32.7767,  -96.7970),
    "atlanta":       (33.7490,  -84.3880),
    "boston":        (42.3601,  -71.0589),
    "san francisco": (37.7749, -122.4194),
    "chicago":       (41.8781,  -87.6298),
    "new york":      (40.7128,  -74.0060),
    "denver":        (39.7392, -104.9903),
}


def generate(cfg: run_config.RunConfig, *, preset: dict, out_dir: Path) -> dict:
    """Materialize the data/*.yaml files. Returns a summary."""
    out_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(cfg.geography.random_seed)
    fake = Faker()
    Faker.seed(cfg.geography.random_seed)
    prefix = cfg.reset.prefix

    metros = [m for m in cfg.geography.metros if m in METROS]
    if not metros:
        raise ValueError(f"No known metros in {cfg.geography.metros}; known: {list(METROS)}")

    summary: dict[str, int] = {}

    # 01-territories.yaml — one per metro
    territories = [{"name": f"{prefix}TER-{m.upper().replace(' ', '')}", "description": f"{m.title()} territory"}
                   for m in metros]
    _write(out_dir / "01-territories.yaml", "territories", "name", territories)
    summary["territories"] = len(territories)

    # 02-org-units.yaml — one per metro with lat/long
    orgs = []
    for m in metros:
        lat, lon = METROS[m]
        orgs.append({
            "msdyn_name": f"{prefix}OU-{m.upper().replace(' ', '')}",
            "msdyn_description": f"{m.title()} operations",
            "msdyn_latitude": lat,
            "msdyn_longitude": lon,
        })
    _write(out_dir / "02-org-units.yaml", "msdyn_organizationalunits", "msdyn_name", orgs)
    summary["org_units"] = len(orgs)

    # 03-resource-categories.yaml — from preset
    cats = [{"name": f"{prefix}CAT-{c.upper().replace(' ', '-')}", "description": c}
            for c in preset.get("resource_categories", ["Field Technician"])]
    _write(out_dir / "03-resource-categories.yaml", "bookableresourcecategories", "name", cats)
    summary["resource_categories"] = len(cats)

    # 04-characteristics.yaml — from preset skills list
    chars = []
    for s in preset.get("skills", []):
        chars.append({
            "name": f"{prefix}SKL-{s['code']}",
            "description": s.get("description", s["code"]),
            "characteristictype": 1,  # 1 = Skill
        })
    _write(out_dir / "04-characteristics.yaml", "characteristics", "name", chars)
    summary["characteristics"] = len(chars)

    # 05-incident-types.yaml — from preset
    incidents = []
    for it in preset.get("incident_types", []):
        incidents.append({
            "msdyn_name": f"{prefix}IT-{it['code']}",
            "msdyn_description": it.get("description", it["code"]),
            "msdyn_estimateduration": it.get("estimated_minutes", 60),
        })
    _write(out_dir / "05-incident-types.yaml", "msdyn_incidenttypes", "msdyn_name", incidents)
    summary["incident_types"] = len(incidents)

    # 06-asset-categories.yaml — from preset
    asset_cats = [{"msdyn_name": f"{prefix}AC-{a}", "msdyn_description": a}
                  for a in preset.get("asset_categories", [])]
    _write(out_dir / "06-asset-categories.yaml", "msdyn_customerassetcategories", "msdyn_name", asset_cats)
    summary["asset_categories"] = len(asset_cats)

    # 10-accounts.yaml
    accounts = []
    for i in range(cfg.scale.accounts):
        m = rng.choice(metros)
        lat, lon = _jitter(METROS[m], rng)
        accounts.append({
            "accountnumber": f"{prefix}ACC-{i+1:04d}",
            "name": fake.company(),
            "address1_city": m.title(),
            "address1_stateorprovince": _state_for(m),
            "address1_country": "USA",
            "address1_latitude": lat,
            "address1_longitude": lon,
            "telephone1": fake.phone_number(),
        })
    _write(out_dir / "10-accounts.yaml", "accounts", "accountnumber", accounts)
    summary["accounts"] = len(accounts)

    # 11-contacts.yaml — one primary contact per account
    contacts = []
    for i, a in enumerate(accounts):
        email = f"{prefix.lower()}contact-{i+1:04d}@example.com"
        contacts.append({
            "emailaddress1": email,
            "firstname": fake.first_name(),
            "lastname": fake.last_name(),
            "parentcustomerid_account@odata.bind": f"/accounts(accountnumber='{a['accountnumber']}')",
        })
    _write(out_dir / "11-contacts.yaml", "contacts", "emailaddress1", contacts)
    summary["contacts"] = len(contacts)

    # 12-functional-locations.yaml — one site per account
    locs = []
    for a in accounts:
        locs.append({
            "msdyn_name": f"{prefix}FL-{a['accountnumber'][len(prefix)+4:]}",
            "msdyn_account@odata.bind": f"/accounts(accountnumber='{a['accountnumber']}')",
        })
    _write(out_dir / "12-functional-locations.yaml", "msdyn_functionallocations", "msdyn_name", locs)
    summary["functional_locations"] = len(locs)

    # 13-customer-assets.yaml — 3-deep tree on first N accounts
    assets = []
    asset_target = max(3, cfg.scale.accounts // 3)
    for i, a in enumerate(accounts[:asset_target]):
        root_alt = f"{prefix}AST-{i+1:03d}-ROOT"
        child_alt = f"{prefix}AST-{i+1:03d}-CHILD"
        leaf_alt = f"{prefix}AST-{i+1:03d}-LEAF"
        bind_acc = f"/accounts(accountnumber='{a['accountnumber']}')"
        assets.append({"msdyn_name": root_alt, "msdyn_account@odata.bind": bind_acc})
        assets.append({"msdyn_name": child_alt, "msdyn_account@odata.bind": bind_acc,
                       "msdyn_parentasset@odata.bind": f"/msdyn_customerassets(msdyn_name='{root_alt}')"})
        assets.append({"msdyn_name": leaf_alt, "msdyn_account@odata.bind": bind_acc,
                       "msdyn_parentasset@odata.bind": f"/msdyn_customerassets(msdyn_name='{child_alt}')"})
    _write(out_dir / "13-customer-assets.yaml", "msdyn_customerassets", "msdyn_name", assets)
    summary["customer_assets"] = len(assets)

    # 14-products.yaml — from preset
    products = []
    for p in preset.get("products", []):
        products.append({
            "productnumber": f"{prefix}{p['code']}",
            "name": p["name"],
            "producttypecode": 1,
            "msdyn_fieldserviceproducttype": p.get("fs_type", 690970000),  # 690970000 = Inventory
        })
    _write(out_dir / "14-products.yaml", "products", "productnumber", products)
    summary["products"] = len(products)

    # 15-warehouses.yaml — one per metro
    warehouses = []
    for m in metros:
        warehouses.append({
            "msdyn_name": f"{prefix}WH-{m.upper().replace(' ', '')}",
            "msdyn_description": f"{m.title()} warehouse",
        })
    _write(out_dir / "15-warehouses.yaml", "msdyn_warehouses", "msdyn_name", warehouses)
    summary["warehouses"] = len(warehouses)

    # 20-bookable-resources.yaml — Equipment-type by default; User-type only if cfg.users supplied
    resources = []
    n_user = min(len(cfg.users), cfg.scale.bookable_resources)
    n_equipment = cfg.scale.bookable_resources - n_user
    for i, upn in enumerate(cfg.users[:n_user]):
        m = rng.choice(metros)
        lat, lon = _jitter(METROS[m], rng)
        resources.append({
            "name": f"{prefix}BR-USER-{i+1:03d}",
            "resourcetype": 3,  # 3 = User
            "userid@odata.bind": f"/systemusers(domainname='{upn}')",
            "msdyn_startlocation": 690970001,  # Resource Address
            "msdyn_homeaddresslatitude": lat,
            "msdyn_homeaddresslongitude": lon,
        })
    for i in range(n_equipment):
        m = rng.choice(metros)
        lat, lon = _jitter(METROS[m], rng)
        resources.append({
            "name": f"{prefix}BR-EQ-{i+1:03d}",
            "resourcetype": 1,  # 1 = Equipment
            "msdyn_startlocation": 690970002,  # Organizational Unit
            "msdyn_homeaddresslatitude": lat,
            "msdyn_homeaddresslongitude": lon,
        })
    _write(out_dir / "20-bookable-resources.yaml", "bookableresources", "name", resources)
    summary["bookable_resources"] = len(resources)

    # 30-agreements.yaml
    agreements = []
    for i in range(cfg.modules.agreements.count):
        a = accounts[i % len(accounts)]
        agreements.append({
            "msdyn_name": f"{prefix}AGR-{i+1:03d}",
            "msdyn_serviceaccount@odata.bind": f"/accounts(accountnumber='{a['accountnumber']}')",
            "msdyn_billingaccount@odata.bind": f"/accounts(accountnumber='{a['accountnumber']}')",
        })
    _write(out_dir / "30-agreements.yaml", "msdyn_agreements", "msdyn_name", agreements)
    summary["agreements"] = len(agreements)

    # 40-work-orders.template.yaml — template consumed by load_transactional
    template = {
        "template": {
            "entity_set": "msdyn_workorders",
            "alt_key_field": "msdyn_name",
            "base_attributes": {
                "msdyn_systemstatus": 690970000,  # Open-Unscheduled
            },
            "incident_pool": [f"{prefix}IT-{it['code']}" for it in preset.get("incident_types", [])],
            "resource_pool": [r["name"] for r in resources],
            "territory_pool": [t["name"] for t in territories],
        }
    }
    (out_dir / "40-work-orders.template.yaml").write_text(
        yaml.safe_dump(template, sort_keys=False), encoding="utf-8"
    )
    summary["work_order_template"] = 1

    log.info("Seed generation summary: %s", summary)
    return summary


def _write(path: Path, entity_set: str, alt_key_field: str, rows: list[dict]) -> None:
    doc = {"entity_set": entity_set, "alt_key_field": alt_key_field, "rows": rows}
    path.write_text(yaml.safe_dump(doc, sort_keys=False), encoding="utf-8")


def _jitter(center: tuple[float, float], rng: random.Random) -> tuple[float, float]:
    lat, lon = center
    return (lat + rng.uniform(-0.15, 0.15), lon + rng.uniform(-0.15, 0.15))


def _state_for(metro: str) -> str:
    return {
        "seattle": "WA", "dallas": "TX", "atlanta": "GA", "boston": "MA",
        "san francisco": "CA", "chicago": "IL", "new york": "NY", "denver": "CO",
    }.get(metro, "")


def load_preset(repo_root: Path, vertical: str) -> dict:
    p = repo_root / "ui-streamlit" / "presets" / f"{vertical}.yaml"
    if not p.exists():
        raise FileNotFoundError(f"Preset not found: {p}")
    with p.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate /data/*.yaml from a run-config")
    parser.add_argument("--run-config", required=True, type=Path)
    parser.add_argument("--out", type=Path, default=None, help="Override output dir (default: <repo>/data)")
    parser.add_argument("--repo-root", type=Path, default=None)
    args = parser.parse_args(argv)

    cfg = run_config.load(args.run_config)
    repo_root = args.repo_root or args.run_config.parent
    out_dir = args.out or (repo_root / "data")
    preset = load_preset(repo_root, cfg.vertical)
    # Apply preset_overrides via shallow merge
    if cfg.preset_overrides:
        for k, v in cfg.preset_overrides.items():
            preset[k] = v
    summary = generate(cfg, preset=preset, out_dir=out_dir)
    print(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
