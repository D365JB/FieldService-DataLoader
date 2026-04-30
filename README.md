# Field Service Data Loader

Idempotent loader that takes a fresh Dataverse environment with the **Dynamics 365 Field Service** solution installed and brings it to "demo-ready" state in one command.

> **Audience:** Microsoft Solution Engineers running customer demos.
> **Re-running** the loader updates rows in place — never creates duplicates.

## What's in this repo

There are now **two front-ends** that share the same idea:

| Path | What | When to use |
|---|---|---|
| **`web/` + `api/`** | Hosted React SPA — paste a customer URL, AOAI generates a Field Service preset, one-click seeds Dataverse from the browser via your D365 sign-in | Live customer-facing demos. Deploy with `azd up` (see [docs/deploy.md](docs/deploy.md)) |
| `scripts/python/` + `data/` + `config/` | Python CLI loader (this is the original track) | CI/CD, bulk seeding, scriptable refresh, no browser |

**Hosted SPA quick deploy:**

```powershell
azd auth login
azd env set VITE_MSAL_CLIENT_ID <your-multi-tenant-app-reg-id>
azd up
```

See [docs/deploy.md](docs/deploy.md) for the App Registration setup and post-deploy redirect URI step.

## CI/CD

Two GitHub Actions workflows ship in `.github/workflows/`:

- **`ci.yml`** — runs on every PR and push to `main`. Builds `web/`, builds `api/`, compiles bicep, runs the Python loader's pytest suite. No Azure auth required.
- **`azd-deploy.yml`** — runs on push to `main`. Uses `azd provision && azd deploy` with a federated GitHub OIDC credential (no client secret).

To bootstrap the federated credential the first time:

```powershell
azd pipeline config --provider github
```

That command creates the App Registration with federated credential, sets the required GitHub Actions repository variables (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_ENV_NAME`, `AZURE_LOCATION`), and pushes the workflow. Add `VITE_MSAL_CLIENT_ID` manually as a repo variable.

## Architecture (four tracks)

| Track | What it does | How |
|---|---|---|
| `config/` | Tier 1 — configuration rows (work order types, incident types, booking statuses, territories, price lists, …) | `pac data import` (Windows) or `--use-webapi-config` fallback (Linux) |
| `data/` + `scripts/python/` | Tier 2 master data + Tier 3 transactional data (accounts, resources, agreements, work orders, bookings) | Python (MSAL + requests) → Dataverse Web API, alt-key upserts |
| `ui-streamlit/` | Wizard UI for picking vertical / scale / geography → generates `run-config.yaml` and shells out to the CLI | Streamlit |

> **Note:** A `/solutions/` track is documented for future use but **not** included in v1. RSO, IoT/CFS and Customer Voice modules are stubbed in `manifest.yaml` (`enabled: false`) and deferred to v2.

## Quick start (CLI)

```powershell
# 1. Create Entra App Registration + Application User in Dataverse (see docs/prerequisites.md)
# 2. Copy .env.example → .env and fill in TENANT_ID / CLIENT_ID / ENV_URL
# 3. Install
cd scripts/python
pip install -e .

# 4. Validate against target env
python -m fsloader.orchestrate --run-config ../../run-config.yaml --dry-run

# 5. Apply
python -m fsloader.orchestrate --run-config ../../run-config.yaml
```

## Quick start (Streamlit UI)

```powershell
cd ui-streamlit
pip install -r requirements.txt
streamlit run app.py
```

## Repo layout

```
config/      CMT schema + exported data bundle + module manifest
data/        Numbered seed YAMLs (01-territories.yaml … 40-work-orders.template.yaml)
scripts/     Python CLI loader + optional PowerShell wrappers
ui-streamlit/ Streamlit wizard (thin layer over CLI)
docs/        Prerequisites, runbook, troubleshooting, demo scripts
```

## Idempotency

Every Web API write is an **upsert keyed on an alternate key** (`accountnumber`, `productnumber`, custom `*_externalid`). All loader-created rows are tagged with the `DEMO-` alt-key prefix so `reset.py` can scope teardown precisely.

## Documentation

- [Prerequisites](docs/prerequisites.md) — licensing, App Reg, Application User, role assignments
- [Runbook](docs/runbook.md) — end-to-end run order + refresh flows
- [Troubleshooting](docs/troubleshooting.md) — 429s, lookup nulling, status mapping
- [Demo scripts](docs/demo-scripts/) — dispatcher / mobile technician / Copilot summary

## License

MIT
