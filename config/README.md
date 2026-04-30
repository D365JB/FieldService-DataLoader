# `config/` — Tier 1 configuration

This directory holds the **Configuration Migration Tool** (CMT) artifacts plus a Web API fallback for Linux runners.

## Files

| Path | Purpose |
|---|---|
| `manifest.yaml` | Module list + run order, read by the orchestrator. |
| `schema/fs-config-schema.xml` | CMT schema (committed for reviewable diffs). |
| `data/fs-config-data.zip` | CMT export bundle consumed by `pac data import`. **Not committed** until you generate it (see below). |
| `data/fs-config-data.xml` | Unpacked `data.xml` from the bundle, committed alongside the zip for reviewable PR diffs. |
| `webapi/` | Linux fallback — YAML rows the orchestrator loads via Web API when `--use-webapi-config` is passed. Optional. |

## Generating the CMT bundle

1. Install the **Configuration Migration Tool** ([download](https://learn.microsoft.com/power-platform/admin/manage-configuration-data)).
2. Run `DataMigrationUtility.exe` → **Create schema** → connect to your **source** environment (a fully-configured FS demo org).
3. Add the entities listed in [docs/runbook.md](../docs/runbook.md#tier-1-cmt-entity-list) to the schema and save it as `config/schema/fs-config-schema.xml`.
4. Re-launch CMT → **Export data** → produces a zip; rename to `config/data/fs-config-data.zip`.
5. Unpack the zip and commit the resulting `data.xml` as `config/data/fs-config-data.xml` for reviewable diffs.
6. From this repo root: `python scripts/python/repack_cmt.py` will rebuild the zip from the XML if you ever edit the XML by hand.

## Linux fallback (`--use-webapi-config`)

If you can't run a Windows job, drop `entity_set/alt_key_field/rows`-shaped YAMLs into `webapi/` and pass `--use-webapi-config` to the orchestrator. **Note:** Booking Status `FieldServiceStatus` mapping and Price List defaults still require a Windows + `pac data import` first run — the Linux fallback is incremental, not a full replacement.
