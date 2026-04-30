# Field Service Data Studio — API

Azure Functions (Node v4 programming model, TypeScript) for the SWA managed `/api`.

## Functions

| Path | Purpose |
|---|---|
| `POST /api/generateContent` | AOAI proxy. Holds the API key (or uses managed identity in prod). |
| `GET  /api/fetchWebsite?url=...` | Server-side fetch of a customer URL — extracts title, meta description, ~3KB of stripped text. SSRF-guarded. |

## Local dev

```powershell
cd api
npm install
copy local.settings.example.json local.settings.json
# edit local.settings.json — set _AOAI_ENDPOINT, _AOAI_API_KEY (rename keys without leading underscore in real file)
npm run build
func start                       # requires Azure Functions Core Tools v4
```

The web app's Vite dev server proxies `/api/*` to `http://localhost:7071`.

## Production secrets

Set these as **Application settings** on the Function App (or as SWA configuration values):

| Setting | Value |
|---|---|
| `AOAI_ENDPOINT` | `https://<aoai-account>.openai.azure.com` |
| `AOAI_DEPLOYMENT` | `gpt-5-mini` |
| `AOAI_API_VERSION` | `2024-10-21` |
| `AOAI_API_KEY` | (omit if using managed identity — preferred) |
| `ALLOWED_ORIGINS` | `https://<your-swa>.azurestaticapps.net` |

When `AOAI_API_KEY` is unset, the function calls `getToken("https://cognitiveservices.azure.com/.default")` via `DefaultAzureCredential`, so grant the Function's managed identity the **Cognitive Services OpenAI User** role on the AOAI account.
