# Field Service Data Studio — Web

React + Vite + TypeScript SPA for the Field Service data loader.

## Architecture (Phase 1A)

- **Auth**: MSAL.js multi-tenant (popup), authority `login.microsoftonline.com/organizations`
- **Data**: Browser → Dataverse Web API directly with the user's bearer token
- **AI**: Browser → `/api/generateContent` proxy (separate Function App holds the AOAI key)
- **Hosting**: Azure Static Web Apps with managed Functions in `../api`

See `/memories/repo/aistudio-recon.md` for the architecture origin (reverse-engineered from the reference app).

## Local dev

```powershell
cd web
npm install
copy .env.example .env.local
# edit .env.local — paste your VITE_MSAL_CLIENT_ID
npm run dev
```

The app runs at http://localhost:5173. `/api/*` is proxied to the Functions runtime at :7071 (start it from `../api` separately when needed).

## App Reg setup

```powershell
az ad app create `
  --display-name "FS Data Studio" `
  --sign-in-audience AzureADMultipleOrgs `
  --web-redirect-uris http://localhost:5173 https://<your-swa>.azurestaticapps.net
```

In the App Reg portal:
- **Authentication** → enable SPA platform with the same redirect URIs
- **API permissions** → add `Dynamics CRM` → `user_impersonation` (delegated) — or rely on `${orgUrl}/.default` dynamic consent at sign-in
- **Expose an API** → not needed (we consume Dataverse, not expose our own)

## Routes (current)

| Path | Page |
|---|---|
| `/` | Landing — marketing + sign in |
| `/connect` | Pick env, test WhoAmI |
| `/dashboard` | Action picker (Generate / Reset) |

Phases 1B+ will add `/generate` (AI wizard) and `/reset`.
