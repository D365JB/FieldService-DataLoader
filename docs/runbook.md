# Runbook

End-to-end run order, common refresh flows, and CMT regeneration.

## End-to-end run (CLI)

```powershell
# 0. Prereqs (one-time per env): see prerequisites.md.

# 1. Clone and install
git clone <repo>
cd FieldServiceDataLoader
pip install -e scripts/python[dev]

# 2. Configure
cp run-config.example.yaml run-config.yaml
# Edit env_url / tenant_id / client_id

# 3. Set secret (PowerShell)
$env:CLIENT_SECRET = "<your secret>"

# 4. Generate seed YAMLs from the chosen vertical preset
python -m fsloader.generate_seeds --run-config run-config.yaml

# 5. Dry-run (validates schema + connectivity, no writes)
python -m fsloader.orchestrate --run-config run-config.yaml --dry-run

# 6. Apply (≤ 30 minutes for default scale)
python -m fsloader.orchestrate --run-config run-config.yaml
```

## End-to-end run (Streamlit UI)

```powershell
pip install -r ui-streamlit/requirements.txt
streamlit run ui-streamlit/app.py
# Wizard pages: Configure → Validate → Apply → Reset
```

## Track-by-track

| Track | Tier | Inputs | Notes |
|---|---|---|---|
| `config` | 1 | `config/data/fs-config-data.zip` (or `config/webapi/*.yaml` with `--use-webapi-config`) | Windows-only by default. |
| `master` | 2 | `data/10-…20-*.yaml` | Linux-friendly. Alt-key upserts. |
| `transactional` | 3 | `data/30-*.yaml`, `data/40-*.template.yaml` | Dates computed at runtime. |
| `verify` | n/a | live env reads | Asserts acceptance criteria. |

Run a single track:

```powershell
python -m fsloader.orchestrate --run-config run-config.yaml --track master
```

## Refresh transactional data without re-running config

After the env is set up, you typically only want fresh dates / new WOs:

```powershell
python -m fsloader.orchestrate --run-config run-config.yaml --skip-config --track transactional --track verify
```

By default this **fills gaps** in the date distribution rather than overwriting existing WO dates (per `date_window.refresh_existing_dates: false`).

## Tier 1 CMT entity list

When you (re)generate the CMT bundle, the schema must include at minimum:

- `territory`
- `msdyn_organizationalunit`
- `bookableresourcecategory`
- `characteristic`, `ratingmodel`, `ratingvalue`
- `msdyn_workordertype`, `msdyn_workordersubstatus`, `bookingstatus`
- `msdyn_incidenttype` and children: `msdyn_incidenttypeservicetask`, `msdyn_incidenttypeproduct`, `msdyn_incidenttypeservice`, `msdyn_incidenttypecharacteristic`
- `msdyn_servicetasktype`
- `msdyn_customerassetcategory`, `msdyn_property`
- `pricelevel`, `uomschedule`, `uom`

Make sure every custom Booking Status maps to a valid `FieldServiceStatus` enum value or the schedule-board color coding will break.

## Regenerating the CMT bundle

1. Open `DataMigrationUtility.exe` (CMT) → **Create schema**.
2. Connect to a fully-configured FS source environment.
3. Add the entities above; save schema as `config/schema/fs-config-schema.xml`.
4. Re-launch CMT → **Export data** → produces a zip.
5. Drop the zip at `config/data/fs-config-data.zip`.
6. Unpack the zip; commit `data.xml` as `config/data/fs-config-data.xml` for diffability.
7. From repo root: `python scripts/python/repack_cmt.py` rebuilds the zip if you edit the XML by hand.

## Reset

```powershell
python -m fsloader.reset --run-config run-config.yaml --confirm https://orgname.crm.dynamics.com
```

The `--confirm` value must equal `target.env_url` exactly. The script deletes only rows whose alternate key starts with `reset.prefix` (default `DEMO-`), plus their child rows (bookings under demo WOs, etc.).
