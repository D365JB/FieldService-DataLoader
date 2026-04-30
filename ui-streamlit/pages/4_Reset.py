"""Page 4 — Reset: typed-confirm teardown of DEMO-* rows."""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st
import yaml

_THIS = Path(__file__).resolve().parent.parent
if str(_THIS) not in sys.path:
    sys.path.insert(0, str(_THIS))

from components import auth_panel, progress  # noqa: E402

REPO_ROOT = Path(st.session_state.get("repo_root", _THIS.parent))

st.title("4 — Reset")
st.caption("Deletes only rows tagged with the run-config reset.prefix (default DEMO-).")

bundle = auth_panel.render()
rc_path = REPO_ROOT / "run-config.yaml"

if not rc_path.exists():
    st.warning(f"{rc_path} not found.")
    st.stop()

with rc_path.open("r", encoding="utf-8") as f:
    cfg = yaml.safe_load(f) or {}
target_url = (cfg.get("target") or {}).get("env_url", "")
prefix = (cfg.get("reset") or {}).get("prefix", "DEMO-")

st.error(f"This will **delete every row** with alt-key starting `{prefix}` from {target_url}.")
typed = st.text_input("Type the target environment URL exactly to confirm:")

if st.button("Reset", type="primary", disabled=(typed.rstrip("/") != target_url.rstrip("/"))):
    rc = progress.stream_command(
        progress.python_module(
            "fsloader.reset",
            ["--run-config", str(rc_path), "--confirm", target_url],
        ),
        cwd=REPO_ROOT,
        env_overrides=bundle.as_env(),
        title="Reset output",
    )
    if rc == 0:
        st.success("Reset complete.")
    else:
        st.error(f"Reset reported errors (exit {rc}).")
