"""Page 3 — Apply: full orchestrator run, per-track progress + summary."""

from __future__ import annotations

import sys
import time
from pathlib import Path

import streamlit as st

_THIS = Path(__file__).resolve().parent.parent
if str(_THIS) not in sys.path:
    sys.path.insert(0, str(_THIS))

from components import auth_panel, progress  # noqa: E402

REPO_ROOT = Path(st.session_state.get("repo_root", _THIS.parent))

st.title("3 — Apply")
st.caption("Runs the full loader: config → master → transactional → verify.")

bundle = auth_panel.render()
rc_path = REPO_ROOT / "run-config.yaml"

if not rc_path.exists():
    st.warning(f"{rc_path} not found.")
    st.stop()

skip_config = st.checkbox(
    "Skip config track (Tier 1 already loaded)", value=False,
    help="Tick this if `pac data import` has already run against the target env.",
)
use_webapi = st.checkbox(
    "Use Web API for config (Linux fallback)", value=False,
    help="Slower; not a full replacement for `pac data import`. See docs/troubleshooting.md.",
)

if st.button("Apply", type="primary"):
    args = ["--run-config", str(rc_path)]
    if skip_config:
        args.append("--skip-config")
    if use_webapi:
        args.append("--use-webapi-config")

    started = time.time()
    rc = progress.stream_command(
        progress.python_module("fsloader.orchestrate", args),
        cwd=REPO_ROOT,
        env_overrides=bundle.as_env(),
        title="Loader output",
    )
    elapsed = time.time() - started

    st.divider()
    if rc == 0:
        st.success(f"Loader finished in {elapsed:.1f}s.")
    else:
        st.error(f"Loader failed in {elapsed:.1f}s (exit {rc}). See log above for the offending track.")
