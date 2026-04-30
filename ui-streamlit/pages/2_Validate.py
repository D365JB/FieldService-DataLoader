"""Page 2 — Validate: orchestrator dry-run, log streaming."""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

_THIS = Path(__file__).resolve().parent.parent
if str(_THIS) not in sys.path:
    sys.path.insert(0, str(_THIS))

from components import auth_panel, progress  # noqa: E402

REPO_ROOT = Path(st.session_state.get("repo_root", _THIS.parent))

st.title("2 — Validate (dry-run)")
st.caption("Authenticates, validates the schema, and walks through the loader without writing.")

bundle = auth_panel.render()
rc_path = REPO_ROOT / "run-config.yaml"

if not rc_path.exists():
    st.warning(f"{rc_path} not found. Use **1 — Configure** first or hand-write the file.")
    st.stop()

st.divider()
if st.button("Run dry-run", type="primary"):
    rc = progress.stream_command(
        progress.python_module(
            "fsloader.orchestrate",
            ["--run-config", str(rc_path), "--dry-run"],
        ),
        cwd=REPO_ROOT,
        env_overrides=bundle.as_env(),
        title="Dry-run output",
    )
    if rc == 0:
        st.success("Dry-run passed.")
    else:
        st.error(f"Dry-run reported issues (exit {rc}).")
