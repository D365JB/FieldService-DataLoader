# Deploying with `azd`

This project uses Azure Developer CLI to provision infra (Bicep) and deploy
both the SPA and the Functions API in one shot.

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`az`)
- [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) (`azd`) v1.10+
- Node 20+
- An Azure subscription with permission to create resource groups and AOAI accounts

## Architecture

```
┌──────────────────────────┐         ┌────────────────────────┐
│  Static Web App (web)    │ /api/* →│  Function App (api)    │
│  swa-…  Standard plan    │ proxy   │  func-…  Linux/Y1      │
│  Hosts the React SPA     │         │  Node 20, system MI    │
└────────────┬─────────────┘         └──────────┬─────────────┘
             │                                  │ MI bearer token
             │                                  ▼
             │                        ┌──────────────────────┐
             │                        │ Azure OpenAI         │
             │                        │ aoai-…  S0           │
             │                        │ gpt-5-mini deployment│
             │                        └──────────────────────┘
             │
             ▼  user signs in with their D365 tenant
        Microsoft Entra (multi-tenant App Reg)
```

We use **bring-your-own Functions** (a separate Function App linked to the SWA
via `linkedBackends`) instead of SWA's managed Functions, because managed
Functions don't support managed identity — and we want the AOAI proxy to use
MI rather than a stored API key.

## One-time App Reg setup

The web app needs a multi-tenant App Registration so anyone can sign in with
their D365 credentials.

```powershell
az login

az ad app create `
  --display-name "FS Data Studio" `
  --sign-in-audience AzureADMultipleOrgs `
  --web-redirect-uris http://localhost:5173

# Capture the appId. Then enable the SPA platform on the same redirect URIs
# in the portal under Authentication > Add a platform > SPA.
```

## Deploy

```powershell
azd auth login

# Capture the appId from above and set it before the first deploy so it gets
# baked into the Vite bundle:
azd env set VITE_MSAL_CLIENT_ID <appId>

azd up
```

You'll be prompted for:

- **Environment name** (3–12 lowercase chars; used as the resource name prefix)
- **Subscription**
- **Location** (RG / AOAI / Functions)

`azd up` runs the prepackage hook (which runs `npm install && npm run build`
in both `web/` and `api/`), provisions infra from `infra/main.bicep`, and
deploys both bundles.

When it finishes, the postdeploy hook prints the deployed URLs. **Add the SWA
URL to your App Reg's SPA redirect URIs** before the first sign-in:

```powershell
$webUrl = azd env get-values | Select-String 'WEB_URL' | ForEach-Object { ($_ -split '"')[1] }
az ad app update --id <appId> --add web.redirectUris $webUrl
```

(Or do it via the portal under *Authentication > SPA platform*.)

## Re-deploy after code changes

```powershell
azd deploy            # both services
azd deploy web        # SPA only
azd deploy api        # Function App only
azd up                # full re-provision + deploy
azd down --purge      # tear it all down (including AOAI soft-delete)
```

## Resources provisioned

| Resource | SKU | Purpose |
|---|---|---|
| Static Web App (`swa-…`) | Standard | Hosts the SPA; proxies `/api/*` to the Function App |
| Function App (`func-…`) | Linux Consumption (Y1) | Runs `generateContent` (AOAI proxy via MI) and `fetchWebsite` |
| Storage account (`st…`) | Standard_LRS | Required by the Functions runtime |
| Azure OpenAI (`aoai-…`) | S0 | gpt-5-mini deployment, GlobalStandard, 100k TPM |
| App Insights + Log Analytics | PerGB2018, 30d | Tracing + logs from both apps |
| Role assignment | "Cognitive Services OpenAI User" | Function App MI → AOAI account |

## Cost ballpark

- Static Web App Standard: ~$9/mo
- Function App on Y1 (Consumption): free for 1M executions/mo + free 400k GB-s
- Storage: pennies/mo at demo scale
- Log Analytics + App Insights: pay-per-GB (negligible at demo scale)
- Azure OpenAI: pay-per-token. gpt-5-mini at typical preset-generation prompts
  is well under $0.01 per analyze call.

Total at demo scale: under $15/mo idle, plus AOAI tokens.
