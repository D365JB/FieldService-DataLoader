# Prerequisites

Before running the loader against a target environment, complete each of the steps below.

## 1. Licensing

| Capability | Required license |
|---|---|
| Field Service core (Work Orders, Bookings, Agreements, Assets) | **Dynamics 365 Field Service** — one user license + Application User. |
| RSO (Resource Scheduling Optimization) | **Dynamics 365 Field Service Resource Scheduling Optimization** add-in. *(Deferred to v2.)* |
| IoT / Connected Field Service | Connected Field Service add-in. *(Deferred to v2.)* |
| Customer Voice | Customer Voice subscription. *(Deferred to v2.)* |

> **The Microsoft 365 / Power Platform tenant must already have the FS solution installed** in the target environment. See [Install Field Service](https://learn.microsoft.com/dynamics365/field-service/install-field-service).

## 2. Entra App Registration

1. Entra admin center → **App registrations** → **New registration**.
2. **Name:** `fsloader-<orgname>`. **Supported account types:** single tenant.
3. After creation, copy the **Application (client) ID** and **Directory (tenant) ID**.
4. **Certificates & secrets** → **New client secret**. Copy the value — it is not shown again. Store in a secret manager / `.env` (CI: `FS_CLIENT_SECRET`).
5. **API permissions** → **Add** → **Dynamics CRM** → **Application permissions** → `user_impersonation`. **Grant admin consent**.

## 3. Application User in Dataverse

1. **Power Platform admin center** → select target environment → **Settings → Users + permissions → Application users**.
2. **+ New app user** → **+ Add an app** → pick the App Registration above → choose Business Unit (root is fine for demos).
3. Assign one of the role configurations below.

### Required Dataverse roles for the Application User

| Configuration | Roles | Use when |
|---|---|---|
| **Quick path** (non-prod) | `System Administrator` | Demo / sandbox tenants where you control all access. |
| **Least privilege** (recommended) | `System Customizer` + `Field Service - Administrator` + `Resource Scheduling Administrator` | Shared / customer-facing tenants. |

> **Important:** creating Bookable Resources requires `Field Service - Administrator`. `System Customizer` alone is not sufficient.

## 4. Environment URL

In Power Platform admin center → environment → **Environment URL** (e.g., `https://orgname.crm.dynamics.com`). Drop the trailing slash.

## 5. Local prerequisites

| Tool | Why | Where |
|---|---|---|
| Python 3.10+ | Loader runtime | python.org |
| Power Platform CLI (`pac`) | Tier 1 config import (Windows only) | `winget install Microsoft.PowerPlatformCLI` |
| Streamlit (optional) | Wizard UI | `pip install streamlit` |

## 6. CI prerequisites (GitHub Actions)

Configure these repository secrets:

| Secret | Required for | Description |
|---|---|---|
| `FS_TENANT_ID` | both jobs | Entra tenant ID |
| `FS_CLIENT_ID` | both jobs | App registration client ID |
| `FS_CLIENT_SECRET` | both jobs | App registration secret |
| `FS_SANDBOX_ENV_URL` | `validate.yml` (optional) | Sandbox env URL for dry-run |

The `deploy-demo.yml` workflow accepts the target env URL as a `workflow_dispatch` input, so the same workflow can target multiple environments without per-env secrets.
