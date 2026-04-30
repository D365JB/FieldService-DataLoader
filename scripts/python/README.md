# fsloader

Python package implementing the D365 Field Service demo data loader.

## Install

```powershell
pip install -e .[dev]
```

## Modules

| Module | Purpose |
|---|---|
| `auth` | MSAL token acquisition (interactive + client-credentials) |
| `dataverse_client` | Web API wrapper: `$batch`, alt-key upsert, 429 Retry-After, `@odata.bind` helpers |
| `run_config` | pydantic models for `run-config.yaml` |
| `orchestrate` | CLI entry point — runs all tracks per manifest |
| `load_config` | Tier 1 — `pac data import` (default) or Web API fallback |
| `load_master` | Tier 2 — master data via alt-key upsert |
| `load_transactional` | Tier 3 — date-relative WO/booking generator |
| `verify` | Post-load read-back assertions |
| `reset` | DEMO-* prefix-scoped teardown |
| `generate_seeds` | Preset + scale + geo → `/data/*.yaml` |
