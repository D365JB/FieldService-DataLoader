"""MSAL-based authentication for Dataverse Web API.

Two flows:
- **client_credentials**: service principal (CI / non-interactive). Requires CLIENT_SECRET.
- **interactive**: device-code flow for local development.

The token is scoped to ``{env_url}/.default`` per Dataverse Web API requirements.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse

import msal

log = logging.getLogger(__name__)

AuthMethod = Literal["service_principal", "interactive", "env"]


@dataclass(frozen=True)
class AuthConfig:
    tenant_id: str
    client_id: str
    env_url: str
    client_secret: str | None = None  # only for service_principal
    method: AuthMethod = "service_principal"


def _resource_scope(env_url: str) -> str:
    """Return the OAuth scope for a Dataverse environment URL."""
    parsed = urlparse(env_url.rstrip("/"))
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"Invalid env_url: {env_url!r}")
    return f"{parsed.scheme}://{parsed.netloc}/.default"


def acquire_token(cfg: AuthConfig) -> str:
    """Return a bearer access token for ``cfg.env_url``.

    Caller is responsible for token lifetime; for long-running loads,
    re-call this between tracks.
    """
    authority = f"https://login.microsoftonline.com/{cfg.tenant_id}"
    scope = [_resource_scope(cfg.env_url)]

    if cfg.method == "service_principal":
        if not cfg.client_secret:
            raise ValueError(
                "service_principal auth requires client_secret "
                "(set CLIENT_SECRET env var or pass explicitly)"
            )
        app = msal.ConfidentialClientApplication(
            client_id=cfg.client_id,
            authority=authority,
            client_credential=cfg.client_secret,
        )
        result = app.acquire_token_for_client(scopes=scope)
    elif cfg.method in ("interactive", "env"):
        app = msal.PublicClientApplication(client_id=cfg.client_id, authority=authority)
        # Try silent from cache first
        accounts = app.get_accounts()
        result = None
        if accounts:
            result = app.acquire_token_silent(scopes=scope, account=accounts[0])
        if not result:
            flow = app.initiate_device_flow(scopes=scope)
            if "user_code" not in flow:
                raise RuntimeError(f"Device flow failed: {flow}")
            print(flow["message"], flush=True)
            result = app.acquire_token_by_device_flow(flow)
    else:
        raise ValueError(f"Unknown auth method: {cfg.method}")

    if not result or "access_token" not in result:
        err = result.get("error_description") if result else "no result"
        raise RuntimeError(f"Token acquisition failed: {err}")

    log.debug("Acquired token for %s (expires_in=%s)", cfg.env_url, result.get("expires_in"))
    return result["access_token"]


def from_env(env_url: str | None = None) -> AuthConfig:
    """Build an :class:`AuthConfig` from environment variables.

    Reads TENANT_ID / CLIENT_ID / CLIENT_SECRET / ENV_URL.
    Method is inferred: client_secret present → service_principal, else interactive.
    """
    tenant_id = os.environ.get("TENANT_ID")
    client_id = os.environ.get("CLIENT_ID")
    secret = os.environ.get("CLIENT_SECRET") or None
    url = env_url or os.environ.get("ENV_URL")
    missing = [k for k, v in [("TENANT_ID", tenant_id), ("CLIENT_ID", client_id), ("ENV_URL", url)] if not v]
    if missing:
        raise RuntimeError(f"Missing env vars: {', '.join(missing)}")
    return AuthConfig(
        tenant_id=tenant_id,  # type: ignore[arg-type]
        client_id=client_id,  # type: ignore[arg-type]
        env_url=url,  # type: ignore[arg-type]
        client_secret=secret,
        method="service_principal" if secret else "interactive",
    )
