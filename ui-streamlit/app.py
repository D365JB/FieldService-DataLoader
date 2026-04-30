"""Streamlit entry point — landing page + shared session state init.

Pages live under ``pages/`` and inherit Streamlit's auto-discovery routing.
"""

from __future__ import annotations

from pathlib import Path

import streamlit as st

REPO_ROOT = Path(__file__).resolve().parents[1]


def _init_state() -> None:
    ss = st.session_state
    ss.setdefault("repo_root", str(REPO_ROOT))
    ss.setdefault("run_config_path", str(REPO_ROOT / "run-config.yaml"))
    ss.setdefault("auth", {"tenant_id": "", "client_id": "", "client_secret": "", "env_url": ""})
    ss.setdefault("draft", None)


def main() -> None:
    st.set_page_config(page_title="FS Demo Loader", page_icon="🛠️", layout="wide")
    _init_state()

    st.title("Field Service — Demo Loader")
    st.markdown(
        """
A wizard for spinning up a **demo-ready** Dynamics 365 Field Service environment.

This UI is a thin layer over the CLI loader (`python -m fsloader.orchestrate`).
Every action it takes either writes a local YAML file or runs the loader as a
subprocess — so anyone can skip the UI and edit YAML directly.

### Workflow

1. **Configure** — pick vertical, scale, geography, modules → generate `run-config.yaml` + seed files.
2. **Validate** — dry-run against the target environment; live log stream.
3. **Apply** — run the full loader (config → master → transactional → verify).
4. **Reset** — typed-confirm teardown of `DEMO-` rows.

Use the sidebar to navigate.
        """
    )

    st.subheader("Repository")
    st.code(str(REPO_ROOT), language="text")

    if not (REPO_ROOT / "scripts" / "python" / "src" / "fsloader").exists():
        st.error("Loader package not found. Run from a checkout that includes scripts/python/.")
        return

    st.success("Loader package detected. Use the sidebar to begin.")


if __name__ == "__main__":
    main()
