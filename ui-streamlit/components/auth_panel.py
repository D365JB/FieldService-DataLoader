"""Reusable auth panel — collects creds in session-state only (never on disk).

Returns a :class:`AuthBundle` mapping the wizard inputs to the values the CLI
expects via env vars when it shells out.
"""

from __future__ import annotations

from dataclasses import dataclass

import streamlit as st


@dataclass
class AuthBundle:
    tenant_id: str
    client_id: str
    client_secret: str
    env_url: str
    method: str  # "service_principal" | "interactive" | "env"

    def as_env(self) -> dict[str, str]:
        env = {}
        if self.tenant_id:
            env["TENANT_ID"] = self.tenant_id
        if self.client_id:
            env["CLIENT_ID"] = self.client_id
        if self.client_secret:
            env["CLIENT_SECRET"] = self.client_secret
        if self.env_url:
            env["ENV_URL"] = self.env_url
        return env


def render() -> AuthBundle:
    st.subheader("Target environment & auth")
    st.caption("Credentials live only in session memory. Nothing is written to disk by this UI.")

    method = st.radio(
        "Auth method",
        ["service_principal", "interactive", "env"],
        index=0,
        help="Use 'env' to inherit values from .env / shell environment.",
        horizontal=True,
    )

    env_url = st.text_input("Environment URL", st.session_state.auth.get("env_url", ""),
                            placeholder="https://orgname.crm.dynamics.com")
    col1, col2 = st.columns(2)
    with col1:
        tenant = st.text_input("Tenant ID", st.session_state.auth.get("tenant_id", ""))
    with col2:
        client = st.text_input("Client ID", st.session_state.auth.get("client_id", ""))

    secret = ""
    if method == "service_principal":
        secret = st.text_input("Client secret", type="password",
                               value=st.session_state.auth.get("client_secret", ""))

    bundle = AuthBundle(tenant_id=tenant, client_id=client, client_secret=secret,
                        env_url=env_url.rstrip("/"), method=method)

    # Persist to session state
    st.session_state.auth = {
        "tenant_id": tenant, "client_id": client,
        "client_secret": secret, "env_url": env_url.rstrip("/"), "method": method,
    }
    return bundle
