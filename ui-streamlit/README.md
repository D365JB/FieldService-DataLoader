# Streamlit UI — Field Service Demo Loader

A wizard layered on top of the CLI. Pick vertical / scale / geography / modules; the UI generates a `run-config.yaml`, materializes seed YAMLs, and shells out to `python -m fsloader.orchestrate`.

## Run

```powershell
pip install -r requirements.txt
streamlit run app.py
```

## Architecture

The UI **never** writes to Dataverse directly. Every action is one of:

1. Read/write local YAML files (`run-config.yaml`, `data/*.yaml`).
2. `subprocess.Popen([..., "python", "-m", "fsloader.orchestrate", ...])` and stream output.

This keeps the CLI as the single source of truth for loader behavior. Anyone can hand-edit YAML and bypass the UI entirely.

## Pages

| Page | Purpose |
|---|---|
| `1_Configure` | Wizard inputs → emits `run-config.yaml` and `data/*.yaml`. |
| `2_Validate` | Runs `orchestrate.py --dry-run`; streams stdout/stderr. |
| `3_Apply` | Runs the full orchestrator; per-track progress + summary. |
| `4_Reset` | Typed-confirm teardown via `reset.py`. |

## Secrets

Service-principal credentials live in `st.session_state` only — never written to disk. Use the `.env` flow (`python-dotenv`) for CLI runs that need to persist creds.
