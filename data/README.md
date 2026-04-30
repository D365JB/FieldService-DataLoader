# /data — seed YAML files

These files describe the rows the loader writes to Dataverse.

**Each file follows the same shape:**

```yaml
entity_set: accounts          # OData entity-set name
alt_key_field: accountnumber  # Field used for upsert + reset prefix matching
rows:
  - accountnumber: DEMO-ACC-001
    name: Contoso HVAC
    # @odata.bind lookups always use alternate keys, never GUIDs:
    primarycontactid@odata.bind: /contacts(emailaddress1='joe@contoso.example')
```

**Numeric prefix = run order:**

| Prefix | Tier | Loader | Notes |
|---|---|---|---|
| `01-` … `06-` | 1 (config) | `pac data import` (or `--use-webapi-config`) | Shipped as part of `config/data/fs-config-data.zip` in the default flow; YAMLs here are only consumed when `--use-webapi-config` is used. |
| `10-` … `15-`, `20-` | 2 (master) | `load_master.py` | Accounts, contacts, locations, assets, products, warehouses, bookable resources. |
| `30-` | 3 (transactional) | `load_transactional.py` | Agreements. |
| `40-…template.yaml` | 3 (transactional) | `load_transactional.py` | Work orders + bookings; dates computed at runtime. |

**Idempotency:** every row's alt-key must start with the `reset.prefix` from `run-config.yaml` (default `DEMO-`). `reset.py` deletes only rows whose alt-key starts with this prefix.

**Generation:** when the Streamlit UI (or `python -m fsloader.generate_seeds`) is used, files in this folder are **overwritten**. Hand-edited files survive only if the UI is not invoked. To preserve a hand edit, set a non-default `run_id` and check the file into source control before regenerating.

The starter files committed here are minimal placeholders to document the schema; running `python -m fsloader.generate_seeds --run-config run-config.yaml` populates them with vertical-specific content from the matching preset.
