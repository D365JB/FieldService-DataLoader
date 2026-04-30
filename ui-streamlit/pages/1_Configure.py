"""Page 1 — Configure: wizard inputs → run-config.yaml + data/*.yaml."""

from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import streamlit as st
import yaml

# Make sibling components importable when Streamlit launches the page.
_THIS = Path(__file__).resolve().parent.parent
if str(_THIS) not in sys.path:
    sys.path.insert(0, str(_THIS))

from components import auth_panel, presets  # noqa: E402

REPO_ROOT = Path(st.session_state.get("repo_root", _THIS.parent))
PRESETS_DIR = REPO_ROOT / "ui-streamlit" / "presets"

st.title("1 — Configure")
st.caption("Pick vertical, scale, geography, modules. The wizard will write run-config.yaml and seed YAMLs.")

bundle = auth_panel.render()

st.divider()
st.subheader("Vertical & scale")

verticals = presets.list_verticals(PRESETS_DIR) or ["hvac"]
vertical = st.selectbox("Industry vertical", verticals, index=verticals.index("hvac") if "hvac" in verticals else 0)

col1, col2, col3 = st.columns(3)
with col1:
    accounts = st.slider("Accounts", 5, 100, 20)
with col2:
    resources = st.slider("Bookable resources", 3, 50, 10)
with col3:
    work_orders = st.slider("Open work orders", 10, 500, 60)

st.divider()
st.subheader("Geography")
metros = st.multiselect(
    "Metros (resources/accounts cluster around these)",
    ["seattle", "dallas", "atlanta", "boston", "san francisco", "chicago", "new york", "denver"],
    default=["seattle", "dallas", "atlanta"],
)
random_seed = st.number_input("Random seed (reproducibility)", min_value=0, value=42)

st.divider()
st.subheader("Date window")
col1, col2 = st.columns(2)
with col1:
    past_days = st.slider("Past days", 1, 60, 14)
with col2:
    future_days = st.slider("Future days", 1, 60, 14)

st.markdown("**Distribution** — must sum to 100.")
col1, col2, col3 = st.columns(3)
with col1:
    past_pct = st.slider("Past %", 0, 100, 30)
with col2:
    near_pct = st.slider("Near future %", 0, 100, 50)
with col3:
    far_pct = st.slider("Far future %", 0, 100, 20)
if past_pct + near_pct + far_pct != 100:
    st.warning(f"Distribution sums to {past_pct + near_pct + far_pct} (must be 100).")

st.divider()
st.subheader("Modules")
col1, col2 = st.columns(2)
with col1:
    mod_agreements = st.checkbox("Agreements", value=True)
    agreement_count = st.number_input("Agreement count", 0, 20, 3)
    mod_assets = st.checkbox("Customer assets", value=True)
    asset_depth = st.number_input("Asset tree depth", 1, 5, 3)
with col2:
    st.caption("Deferred to v2 — manifest stubs only:")
    st.checkbox("RSO (paid add-in)", value=False, disabled=True)
    st.checkbox("IoT / Connected Field Service", value=False, disabled=True)
    st.checkbox("Customer Voice", value=False, disabled=True)

st.divider()
st.subheader("Attachments")
attach_photo = st.checkbox("Attach sample photo to one open WO", value=True)
attach_pdf = st.checkbox("Attach sample inspection PDF to one open WO", value=True)

st.divider()
st.subheader("Optional: User-type bookable resources")
st.caption("Provide UPNs of real Entra users. Leave empty to synthesize Equipment-type only.")
users_text = st.text_area("UPNs (one per line)", value="")

st.divider()
if st.button("Generate run-config + seed YAMLs", type="primary"):
    if not bundle.env_url:
        st.error("Environment URL is required.")
        st.stop()
    if past_pct + near_pct + far_pct != 100:
        st.error("Distribution must sum to 100.")
        st.stop()
    if not metros:
        st.error("Pick at least one metro.")
        st.stop()

    run_id = f"DEMO-{dt.datetime.utcnow():%Y%m%d-%H%M%S}"
    cfg = {
        "schema_version": 1,
        "run_id": run_id,
        "target": {
            "env_url": bundle.env_url,
            "auth_method": bundle.method,
            "tenant_id": bundle.tenant_id or None,
            "client_id": bundle.client_id or None,
        },
        "vertical": vertical,
        "scale": {
            "accounts": int(accounts),
            "bookable_resources": int(resources),
            "open_work_orders": int(work_orders),
        },
        "geography": {"metros": metros, "random_seed": int(random_seed)},
        "date_window": {
            "past_days": int(past_days),
            "future_days": int(future_days),
            "distribution": {
                "past_pct": int(past_pct),
                "near_future_pct": int(near_pct),
                "far_future_pct": int(far_pct),
            },
        },
        "modules": {
            "config": {"enabled": True, "use_webapi": False},
            "master": {"enabled": True},
            "transactional": {"enabled": True},
            "agreements": {"enabled": mod_agreements, "count": int(agreement_count)},
            "customer_assets": {"enabled": mod_assets, "max_depth": int(asset_depth)},
            "rso": {"enabled": False},
            "iot_cfs": {"enabled": False},
            "customer_voice": {"enabled": False},
        },
        "attachments": {
            "attach_photo_to_open_wo": attach_photo,
            "attach_pdf_inspection_to_open_wo": attach_pdf,
        },
        "reset": {"prefix": "DEMO-"},
        "logging": {"level": "INFO", "output": "text"},
        "users": [u.strip() for u in users_text.splitlines() if u.strip()],
    }

    rc_path = REPO_ROOT / "run-config.yaml"
    rc_path.write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
    st.success(f"Wrote {rc_path}")

    # Generate seed YAMLs by invoking the loader's generator.
    from components import progress  # noqa: PLC0415

    rc = progress.stream_command(
        progress.python_module("fsloader.generate_seeds", ["--run-config", str(rc_path)]),
        cwd=REPO_ROOT,
        env_overrides=bundle.as_env(),
        title="Generating seed YAMLs",
    )
    if rc == 0:
        st.success("Seed YAMLs written to data/. Continue to **2 — Validate**.")
    else:
        st.error(f"Seed generation failed (exit {rc}). See log above.")
