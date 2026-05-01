/**
 * Lightweight client-side telemetry. Best-effort fire-and-forget POSTs to
 * `/api/events`. Never throws, never blocks UI. Reads the current MSAL
 * account (if any) so we can attribute events to the signed-in demo user.
 *
 * Schema mirrors `api/src/lib/telemetry.ts`:
 *   { kind, user, tenant, sessionId, path, detail }
 *
 * `kind` values currently emitted:
 *   - "session-start"   first event of the tab
 *   - "page"            route change
 *   - "login"           MSAL acquireToken / loginRedirect succeeds
 *   - "action"          user-initiated meaningful action (analyze, generate, …)
 *   - "error"           caught error worth recording
 */
import { msalInstance } from "@/auth/msal";

const SESSION_KEY = "fsdl:telemetry-session";

function getSessionId(): string {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

function getActor(): { user: string; tenant: string } {
  try {
    const acct = msalInstance.getAllAccounts()[0];
    if (!acct) return { user: "anonymous", tenant: "" };
    return {
      user: acct.username || acct.name || "anonymous",
      tenant: acct.tenantId ?? "",
    };
  } catch {
    return { user: "anonymous", tenant: "" };
  }
}

export interface TrackOptions {
  detail?: unknown;
  /** Override the path; defaults to current `location.pathname`. */
  path?: string;
}

export function track(kind: string, opts: TrackOptions = {}): void {
  try {
    const actor = getActor();
    const body = JSON.stringify({
      kind,
      user: actor.user,
      tenant: actor.tenant,
      sessionId: getSessionId(),
      path: opts.path ?? window.location.pathname,
      detail: opts.detail,
    });
    // Use sendBeacon when possible so we don't lose the event on tab close
    // (e.g. a "logout" or "unload" emit). Falls back to fetch keepalive.
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/events", blob);
      if (ok) return;
    }
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // never crash the app over telemetry
  }
}

let lastPath = "";
/**
 * Mount in a top-level effect; emits `page` events on every route change.
 * Returns the unsubscribe function.
 */
export function attachRouteTracker(): () => void {
  const fire = () => {
    const p = window.location.pathname;
    if (p === lastPath) return;
    lastPath = p;
    track("page", { path: p });
  };
  // Initial.
  fire();
  // popstate covers back/forward. react-router's navigate triggers
  // pushState; we monkey-patch to catch those too.
  const onPop = () => fire();
  window.addEventListener("popstate", onPop);
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = function (...args: Parameters<typeof origPush>) {
    const r = origPush(...args);
    fire();
    return r;
  };
  history.replaceState = function (...args: Parameters<typeof origReplace>) {
    const r = origReplace(...args);
    fire();
    return r;
  };
  return () => {
    window.removeEventListener("popstate", onPop);
    history.pushState = origPush;
    history.replaceState = origReplace;
  };
}
