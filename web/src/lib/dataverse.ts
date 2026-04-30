import { getDataverseToken } from "@/auth/msal";

/**
 * Minimal Dataverse Web API client.
 *
 * Design notes pulled from the reference SPA recon:
 * - Always URL-encode filter VALUES (& ' " etc.) — `oencode` helper.
 * - `msdyn_territory` (and many FS lookups) are case-sensitive lowercase in OData nav properties.
 * - PATCH with `If-None-Match: *` is "create-only"; with neither header it's "upsert".
 * - 429/5xx → exponential backoff up to 5 attempts.
 * - Use `$batch` for >5 writes — single-transaction changesets cut latency dramatically.
 */

export interface DataverseClientOptions {
  orgUrl: string;
  apiVersion?: string; // defaults to v9.2
  /** Called for each retry attempt (UI hook). */
  onRetry?: (attempt: number, status: number, waitMs: number) => void;
}

export class DataverseError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "DataverseError";
    this.status = status;
    this.detail = detail;
  }
}

/** Encode a value for use inside an $filter expression. */
export function oencode(value: string): string {
  // Single-quote-escape per OData (double them), then URI-encode the whole thing.
  return encodeURIComponent(value.replace(/'/g, "''"));
}

export class DataverseClient {
  readonly orgUrl: string;
  readonly apiVersion: string;
  private readonly onRetry?: DataverseClientOptions["onRetry"];

  constructor(opts: DataverseClientOptions) {
    this.orgUrl = opts.orgUrl.replace(/\/+$/, "");
    this.apiVersion = opts.apiVersion ?? "v9.2";
    this.onRetry = opts.onRetry;
  }

  private get baseUrl(): string {
    return `${this.orgUrl}/api/data/${this.apiVersion}`;
  }

  private async authHeader(): Promise<Record<string, string>> {
    const token = await getDataverseToken(this.orgUrl);
    return { Authorization: `Bearer ${token}` };
  }

  /** Fetch with retry/backoff on 429/5xx. */
  async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const baseHeaders: Record<string, string> = {
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      ...(await this.authHeader()),
    };

    const maxAttempts = 5;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(url, {
          ...init,
          headers: { ...baseHeaders, ...(init.headers as Record<string, string>) },
        });
        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          const wait = Math.min(2 ** attempt * 1000, 16000);
          this.onRetry?.(attempt + 1, res.status, wait);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err as Error;
        const wait = Math.min(2 ** attempt * 1000, 16000);
        this.onRetry?.(attempt + 1, 0, wait);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw new DataverseError(
      0,
      `Network error after ${maxAttempts} attempts: ${lastErr?.message ?? "unknown"}`,
    );
  }

  private async json<T>(res: Response, action: string): Promise<T> {
    if (!res.ok) {
      let detail: unknown;
      try {
        detail = await res.json();
      } catch {
        detail = await res.text().catch(() => "");
      }
      const dvMessage =
        (detail as { error?: { message?: string } })?.error?.message ??
        res.statusText;
      throw new DataverseError(
        res.status,
        `${action} failed: ${res.status} ${dvMessage}`,
        detail,
      );
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  /** GET single record by id. */
  async retrieve<T>(
    entitySet: string,
    id: string,
    select?: string[],
  ): Promise<T> {
    const qs = select?.length ? `?$select=${select.join(",")}` : "";
    const res = await this.request(`/${entitySet}(${id})${qs}`);
    return this.json<T>(res, `retrieve ${entitySet}`);
  }

  /** GET list with optional $filter/$select/$top. */
  async query<T>(
    entitySet: string,
    options: {
      filter?: string;
      select?: string[];
      top?: number;
      orderby?: string;
    } = {},
  ): Promise<T[]> {
    const params: string[] = [];
    if (options.filter) params.push(`$filter=${options.filter}`);
    if (options.select?.length) params.push(`$select=${options.select.join(",")}`);
    if (options.top) params.push(`$top=${options.top}`);
    if (options.orderby) params.push(`$orderby=${options.orderby}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    const res = await this.request(`/${entitySet}${qs}`);
    const body = await this.json<{ value: T[] }>(res, `query ${entitySet}`);
    return body.value ?? [];
  }

  /** POST a new record. Returns the created id (parsed from OData-EntityId header). */
  async create(entitySet: string, body: Record<string, unknown>): Promise<string> {
    const res = await this.request(`/${entitySet}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      await this.json(res, `create ${entitySet}`);
    }
    // With return=representation we get the body back; the id is in the entity's primary key.
    const created = (await res.json()) as Record<string, unknown>;
    // Find the *id field — primary keys are conventionally <entityname>id (singular).
    const idField = Object.keys(created).find(
      (k) => k.endsWith("id") && typeof created[k] === "string",
    );
    return idField ? (created[idField] as string) : "";
  }

  /**
   * Upsert by alternate key. PATCH /entityset(altkey='value') with the body.
   * Without `If-Match` or `If-None-Match` this is true upsert (insert or update).
   * Returns the entity id from the OData-EntityId response header.
   */
  async upsertByAltKey(
    entitySet: string,
    altKey: string,
    altValue: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    const res = await this.request(
      `/${entitySet}(${altKey}='${oencode(altValue)}')`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      await this.json(res, `upsert ${entitySet}`);
    }
    // Pull id from OData-EntityId header: ".../entityset(GUID)"
    const entityIdHeader = res.headers.get("OData-EntityId");
    if (entityIdHeader) {
      const m = entityIdHeader.match(/\(([0-9a-f-]{36})\)/i);
      if (m) return m[1];
    }
    // Fallback: parse body
    try {
      const created = (await res.json()) as Record<string, unknown>;
      const idField = Object.keys(created).find(
        (k) => k.endsWith("id") && typeof created[k] === "string",
      );
      if (idField) return created[idField] as string;
    } catch {
      /* no body on 204 */
    }
    return "";
  }

  /** DELETE by id. */
  async delete(entitySet: string, id: string): Promise<void> {
    const res = await this.request(`/${entitySet}(${id})`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      await this.json(res, `delete ${entitySet}`);
    }
  }

  /** WhoAmI — sanity check. */
  async whoAmI(): Promise<{
    UserId: string;
    BusinessUnitId: string;
    OrganizationId: string;
  }> {
    const res = await this.request("/WhoAmI");
    return this.json(res, "WhoAmI");
  }
}

/** Build a deep-link URL to a record in the model-driven app. */
export function deepLink(
  orgUrl: string,
  entitySet: string,
  id: string,
): string {
  // Reference recon: ${orgUrl}/main.aspx?etn=${entitySingular}&id=${id}&pagetype=entityrecord
  const singular = entitySetToLogical(entitySet);
  return `${orgUrl.replace(/\/+$/, "")}/main.aspx?etn=${singular}&id=${id}&pagetype=entityrecord`;
}

/** Map common entity *sets* to their logical (singular) names for deep-links. */
function entitySetToLogical(entitySet: string): string {
  const map: Record<string, string> = {
    accounts: "account",
    contacts: "contact",
    products: "product",
    bookableresources: "bookableresource",
    bookableresourcebookings: "bookableresourcebooking",
    territories: "territory",
    msdyn_workorders: "msdyn_workorder",
    msdyn_workordertypes: "msdyn_workordertype",
    msdyn_incidenttypes: "msdyn_incidenttype",
    msdyn_incidenttypeservicetasks: "msdyn_incidenttypeservicetask",
    msdyn_incidenttypeproducts: "msdyn_incidenttypeproduct",
    characteristics: "characteristic",
  };
  return map[entitySet] ?? entitySet.replace(/s$/, "");
}
