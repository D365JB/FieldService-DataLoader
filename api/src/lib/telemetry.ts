/**
 * Telemetry store backed by an Azure Storage Table on the Function App's
 * AzureWebJobsStorage account. The Function App's managed identity already
 * has "Storage Table Data Contributor" granted via Bicep, so we authenticate
 * with DefaultAzureCredential — no connection string required.
 *
 * Schema (table: `telemetry`):
 *   PartitionKey = ISO date bucket (YYYY-MM-DD) — keeps queries narrow.
 *   RowKey       = `${reverseTimestamp}-${randomSuffix}` so the newest rows
 *                  sort first when scanning a partition top-down.
 *   ts           = ISO timestamp (string, kept for display).
 *   kind         = "login" | "logout" | "page" | "action" | "error".
 *   user         = MSAL `username` (UPN/email) or "anonymous".
 *   tenant       = MSAL `tenantId` (informational; this is the user's home
 *                  tenant, not ours).
 *   sessionId    = client-generated UUID, stable for one browser session.
 *   path         = current SPA route (e.g. "/analyze").
 *   detail       = JSON-stringified extras (action name, durationMs, etc.).
 *   ua           = sanitized user agent (first 200 chars).
 */
import { TableClient, TableServiceClient } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

const TABLE_NAME = "telemetry";

const accountName = process.env.AzureWebJobsStorage__accountName ?? "";
let cachedClient: TableClient | null = null;
let ensured = false;

function getClient(): TableClient {
  if (!accountName) {
    throw new Error(
      "AzureWebJobsStorage__accountName is not set; cannot reach the telemetry table.",
    );
  }
  if (!cachedClient) {
    const cred = new DefaultAzureCredential();
    cachedClient = new TableClient(
      `https://${accountName}.table.core.windows.net`,
      TABLE_NAME,
      cred,
    );
  }
  return cachedClient;
}

async function ensureTable(): Promise<void> {
  if (ensured) return;
  // CreateTable is idempotent at the service level (returns 409 we swallow).
  const svc = new TableServiceClient(
    `https://${accountName}.table.core.windows.net`,
    new DefaultAzureCredential(),
  );
  try {
    await svc.createTable(TABLE_NAME);
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? "";
    if (!/already exists|TableAlreadyExists/i.test(msg)) {
      throw err;
    }
  }
  ensured = true;
}

export interface TelemetryEventInput {
  kind: string;
  user?: string;
  tenant?: string;
  sessionId?: string;
  path?: string;
  detail?: unknown;
  ua?: string;
}

export interface TelemetryRow {
  partitionKey: string;
  rowKey: string;
  ts: string;
  kind: string;
  user: string;
  tenant: string;
  sessionId: string;
  path: string;
  detail: string;
  ua: string;
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

function dateBucket(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function reverseTicks(d: Date): string {
  // Big number that sorts newest-first ascending. 9_999_999_999_999 is far
  // enough in the future for our lifetimes.
  return String(9_999_999_999_999 - d.getTime()).padStart(13, "0");
}

function randSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function clip(s: string | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) : s;
}

export async function writeEvent(evt: TelemetryEventInput): Promise<void> {
  await ensureTable();
  const now = new Date();
  const partitionKey = dateBucket(now);
  const rowKey = `${reverseTicks(now)}-${randSuffix()}`;
  const entity = {
    partitionKey,
    rowKey,
    ts: now.toISOString(),
    kind: clip(evt.kind, 32),
    user: clip(evt.user ?? "anonymous", 256),
    tenant: clip(evt.tenant ?? "", 64),
    sessionId: clip(evt.sessionId ?? "", 64),
    path: clip(evt.path ?? "", 256),
    detail: clip(
      typeof evt.detail === "string"
        ? evt.detail
        : evt.detail == null
          ? ""
          : JSON.stringify(evt.detail),
      4096,
    ),
    ua: clip(evt.ua ?? "", 200),
  };
  await getClient().createEntity(entity);
}

/**
 * Returns up to `limit` of the most recent telemetry events, scanning the
 * last `daysBack` partitions. Default: last 7 days, top 500.
 *
 * Storage Tables don't support a global descending sort, so we walk
 * partitions newest → oldest and rely on the rowKey ordering inside each
 * partition (which already sorts newest-first because of `reverseTicks`).
 */
export async function readRecent(
  limit = 500,
  daysBack = 7,
): Promise<TelemetryRow[]> {
  await ensureTable();
  const client = getClient();
  const out: TelemetryRow[] = [];
  const now = new Date();

  for (let i = 0; i < daysBack && out.length < limit; i++) {
    const day = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - i,
    ));
    const pk = dateBucket(day);
    const iter = client.listEntities<TelemetryRow>({
      queryOptions: { filter: `PartitionKey eq '${pk}'` },
    });
    for await (const row of iter) {
      out.push({
        partitionKey: row.partitionKey ?? pk,
        rowKey: row.rowKey ?? "",
        ts: row.ts ?? "",
        kind: row.kind ?? "",
        user: row.user ?? "",
        tenant: row.tenant ?? "",
        sessionId: row.sessionId ?? "",
        path: row.path ?? "",
        detail: row.detail ?? "",
        ua: row.ua ?? "",
      });
      if (out.length >= limit) break;
    }
  }

  // Each partition came back sorted newest-first; concatenated they're
  // already in (mostly) descending order across days because we walked days
  // newest-first. Sort once more by ts to be safe.
  out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return out.slice(0, limit);
}
