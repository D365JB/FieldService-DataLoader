import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { msalInstance } from "@/auth/msal";
import { getTelemetrySessionId } from "@/lib/telemetry";

/**
 * v1.44.0 — Global fetch interceptor.
 *
 * Auto-attach `x-fsdl-session` to every same-origin `/api/*` call so even
 * legacy call sites that still use bare `fetch()` (Generate.tsx, Analyze.tsx,
 * Brand.tsx, etc.) get tagged with the session id without per-site edits.
 *
 * Skip absolute URLs (e.g. Dataverse) — only relative `/api/...` paths get
 * the header. Browsers strip custom headers from cross-origin requests
 * unless CORS allows them, so adding it everywhere would break the
 * Dataverse calls under preflight.
 */
(function installApiFetchInterceptor() {
  const orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (!url || !url.startsWith("/api/")) {
      return orig(input as RequestInfo, init);
    }
    const headers = new Headers(init?.headers ?? {});
    if (!headers.has("x-fsdl-session")) {
      try {
        headers.set("x-fsdl-session", getTelemetrySessionId());
      } catch {
        /* swallow — never break fetch over telemetry */
      }
    }
    return orig(input as RequestInfo, { ...init, headers });
  };
})();

// MSAL v4 requires explicit initialize() before any auth calls.
async function bootstrap() {
  await msalInstance.initialize();
  await msalInstance.handleRedirectPromise();

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed", err);
  document.getElementById("root")!.innerHTML = `
    <div style="padding: 2rem; color: #fca5a5; font-family: monospace;">
      <h2>Failed to start</h2>
      <pre>${(err as Error).message}</pre>
    </div>
  `;
});
