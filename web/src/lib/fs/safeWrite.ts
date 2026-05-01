/**
 * Resilient write wrappers for the seeder.
 *
 * Every Dataverse mutation in the seed pipeline flows through `safeCreate` /
 * `safeUpdate` so a single 400 from a single record can never abort the whole
 * run. Errors are classified into a small set of `SkipReason`s; the caller
 * gets either the created id (or update success) or a `skipped` result it can
 * record on the run summary and continue past.
 *
 * Three classes of behaviour:
 *   1. **Schema fallback** (folded in from the old `createWithSchemaFallback`):
 *      when the server says "Invalid property 'foo'" or "undeclared property
 *      'foo'", strip that key from the payload and retry. Field Service
 *      schemas vary across orgs (some columns ship optionally) so this lets
 *      the seeder include richer demo data without hard-failing per-tenant.
 *      Nav properties (`@odata.bind`) are required relationships — never
 *      stripped.
 *   2. **Classified-skip**: known-benign 400s (Posted-WO, asset/account
 *      mismatch, missing-lookup, etc.) become `{ skipped: { reason, ... } }`
 *      so the caller can keep going.
 *   3. **Re-throw**: anything we can't classify still bubbles up so genuine
 *      bugs surface instead of being silently swallowed.
 *
 * The classifier is substring-matching on `Error.message`. This is the same
 * approach the seeder already used for `isPostedWoError`; alternatives (parse
 * Dataverse error codes from the raw response) are more brittle across orgs.
 */

import type { DataverseClient } from "@/lib/dataverse";

/**
 * Why a write was skipped. New entries get a string-literal key so callers
 * can `switch` on `result.skipped.reason` exhaustively. Order is by frequency
 * observed in production, most-common first.
 */
export type SkipReason =
  /** WO is Posted; FS plugin won't accept new child rows or reopens. */
  | "posted-wo"
  /** msdyn_customerasset.msdyn_account != WO.msdyn_serviceaccount. */
  | "account-mismatch"
  /** A required nav-bound record (Contact, Resource, etc.) doesn't exist. */
  | "lookup-not-found"
  /** Generic FS plugin / business-rule validation (e.g. Contact lat/long). */
  | "validation"
  /** RBAC / privilege denied. Run continues so partial demo data still seeds. */
  | "permission"
  /** Couldn't classify; surfaced for visibility but treated as skip. */
  | "unknown";

export interface SkipInfo {
  reason: SkipReason;
  /** Original error message (truncated upstream when shown to users). */
  message: string;
  /** Caller-supplied label so the run summary can identify the row. */
  recordLabel?: string;
  /** Caller-supplied step name (matches SeedProgress.step) for grouping. */
  step?: string;
}

export type SafeCreateResult =
  | { ok: true; id: string }
  | { ok: false; skipped: SkipInfo };

export type SafeUpdateResult =
  | { ok: true }
  | { ok: false; skipped: SkipInfo };

export interface SafeWriteContext {
  /** Step name (e.g. "Work Orders", "WO Products"). */
  step?: string;
  /** Record label for the run summary (e.g. "WO #30", "Tech: Jane Doe"). */
  recordLabel?: string;
  /**
   * Optional callback invoked whenever a write is skipped. The seeder uses
   * this to record skips on `SeedResult.skipped` so the success card can
   * display them.
   */
  onSkip?: (info: SkipInfo) => void;
}

/**
 * Classify an error from a Dataverse write into a `SkipReason`. Returns
 * `null` when the error is not a known-benign skip (caller should re-throw).
 *
 * Patterns here are real error strings observed in production runs — keep
 * them comprehensive. New entries: add the substring + a one-line comment
 * citing the run that produced it.
 */
export function classifyError(err: unknown): SkipReason | null {
  const raw = (err as Error)?.message;
  if (typeof raw !== "string") return null;
  const msg = raw.toLowerCase();

  // FS plugin: writing to a Posted WO. Wording varies slightly across orgs.
  // Triggered v1.31.6 by an existing target-Closed WO that wouldn't reopen.
  if (
    msg.includes("been posted") ||
    msg.includes("already posted") ||
    msg.includes("work order that's posted") ||
    msg.includes("work order that is posted")
  ) {
    return "posted-wo";
  }

  // FS plugin: re-opening a WO is blocked because it has bookings already
  // in Scheduled / In Progress / Completed. Same recommended action as
  // Posted WOs (skip child-row attachment so the run continues), so we
  // classify under "posted-wo". Triggered v1.39.5 by an existing-mode
  // Customer Assets re-run that previously left WOs with live bookings.
  // Real error: `400 You can't change the status to "Unscheduled" because
  // the work order has bookings that have a "Scheduled," "In Progress,"
  // or "Completed" status.`
  if (
    (msg.includes("can't change the status") ||
      msg.includes("cannot change the status") ||
      msg.includes("can\u2019t change the status")) &&
    msg.includes("unscheduled")
  ) {
    return "posted-wo";
  }

  // FS plugin: asset's account doesn't match WO service account.
  // Triggered v1.31.5 at WO #30 mid-run.
  if (
    msg.includes("customer asset must be related to the service account") ||
    msg.includes("asset must be related to the service account")
  ) {
    return "account-mismatch";
  }

  // FS plugin: Contact's lat/long not valid for Resource Address mode.
  // Triggered v1.31.3/.4 — even healed contacts can fail this strict check.
  if (
    msg.includes("latitude or longitude for the contact record") ||
    msg.includes("latitude or longitude for the contact")
  ) {
    return "validation";
  }

  // Lookup target deleted / not found. Common after Reset.
  if (
    msg.includes("does not exist") ||
    msg.includes("with id =") && msg.includes("does not exist") ||
    msg.includes("entity 'contact' with id")
  ) {
    return "lookup-not-found";
  }

  // RBAC denial. We don't want to abort a 200-WO run because one entity has
  // a missing privilege — record and continue.
  if (
    msg.includes("privilege") ||
    msg.includes("not have access") ||
    msg.includes("principalprivilegedeniedexception") ||
    msg.includes("insufficient permissions")
  ) {
    return "permission";
  }

  return null;
}

/**
 * Strip the offending column when the server reports an unknown / undeclared
 * property. Returns the column name to remove, or null when the error is not
 * a schema-shape error.
 *
 * Same regex set the old `createWithSchemaFallback` used; folded in here so
 * one wrapper handles both schema-shape and business-rule errors.
 */
function detectMissingProperty(err: unknown): string | null {
  const msg = (err as Error)?.message;
  if (typeof msg !== "string") return null;
  const m =
    msg.match(/Invalid property '([^']+)'/i) ??
    msg.match(/undeclared property '([^']+)'/i) ??
    msg.match(/property '([^']+)' .* does not exist on type/i);
  if (!m) return null;
  // Nav properties are required relationships — caller must fix the binding,
  // not silently strip it.
  if (m[1].includes("@odata.bind")) return null;
  return m[1];
}

/**
 * Resilient `dv.create`. Strips schema-mismatched columns up to `maxRetries`
 * times, classifies known-benign business-rule errors as skips, re-throws
 * anything unexpected.
 */
export async function safeCreate(
  dv: DataverseClient,
  entitySet: string,
  payload: Record<string, unknown>,
  ctx: SafeWriteContext = {},
  maxRetries = 5,
): Promise<SafeCreateResult> {
  const working = { ...payload };
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const id = await dv.create(entitySet, working);
      return { ok: true, id };
    } catch (err) {
      const missingProp = detectMissingProperty(err);
      if (missingProp && missingProp in working && attempt < maxRetries) {
        delete working[missingProp];
        continue;
      }
      const reason = classifyError(err);
      if (reason) {
        const info: SkipInfo = {
          reason,
          message: (err as Error).message ?? String(err),
          recordLabel: ctx.recordLabel,
          step: ctx.step,
        };
        ctx.onSkip?.(info);
        return { ok: false, skipped: info };
      }
      throw err;
    }
  }
  // Exhausted retries — final attempt with whatever's left, surface result.
  try {
    const id = await dv.create(entitySet, working);
    return { ok: true, id };
  } catch (err) {
    const reason = classifyError(err) ?? "unknown";
    const info: SkipInfo = {
      reason,
      message: (err as Error).message ?? String(err),
      recordLabel: ctx.recordLabel,
      step: ctx.step,
    };
    ctx.onSkip?.(info);
    return { ok: false, skipped: info };
  }
}

/**
 * Resilient `dv.update`. No schema-fallback retry (PATCH targets specific
 * columns the caller chose) — just the classifier.
 */
export async function safeUpdate(
  dv: DataverseClient,
  entitySet: string,
  id: string,
  patch: Record<string, unknown>,
  ctx: SafeWriteContext = {},
): Promise<SafeUpdateResult> {
  try {
    await dv.update(entitySet, id, patch);
    return { ok: true };
  } catch (err) {
    const reason = classifyError(err);
    if (reason) {
      const info: SkipInfo = {
        reason,
        message: (err as Error).message ?? String(err),
        recordLabel: ctx.recordLabel,
        step: ctx.step,
      };
      ctx.onSkip?.(info);
      return { ok: false, skipped: info };
    }
    throw err;
  }
}

/**
 * Human-friendly label for a skip reason. Used by the run summary card so
 * users see "3 records already Posted in Dataverse" instead of the enum key.
 */
export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  "posted-wo": "Work order is already Posted",
  "account-mismatch": "Related record points to a different account",
  "lookup-not-found": "Referenced record no longer exists",
  validation: "Field Service validation rule",
  permission: "Insufficient privileges",
  unknown: "Unclassified error",
};
