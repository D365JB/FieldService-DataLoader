# Troubleshooting

## Throttling: 429 / 503

Symptom: `DataverseError: 429 Too Many Requests`.

**Loader behaviour:** the client honors the `Retry-After` header exactly and retries up to 5 attempts with exponential back-off (`tenacity`). If a single request still fails after that, the orchestrator logs the offending payload and exits non-zero.

**If you hit this often:**

1. Lower `--concurrency` (default 10) on the CLI: `python -m fsloader.orchestrate ... --concurrency 4`.
2. Check whether *another* tool is hitting the same env (e.g., Dataflows refreshing).
3. Spread loads — Dataverse service protection is per-user-per-5-minutes, so the App Reg user shares budget with itself.

## Lookups silently null after upsert

Symptom: `_msdyn_workorder_value` is null on a booking even though the orchestrator logged a successful PATCH.

**Cause:** the `@odata.bind` reference must point at the correct **entity set** plural and use a valid alt-key value. The most common slip is using the singular logical name (`account`) instead of the entity set (`accounts`).

**Fix:** check the relevant `*.yaml` template — every `@odata.bind` should look like `/accounts(accountnumber='DEMO-001')`. The helper `fsloader.dataverse_client.odata_bind()` enforces this; prefer using it over hand-crafting.

## Booking status / `FieldServiceStatus` mismatch

Symptom: bookings created OK, but the schedule board shows them as **Canceled** or with the wrong color.

**Cause:** Field Service uses an internal enum `FieldServiceStatus` that is **not** the same as `bookingstatus`. Custom statuses must be mapped to a valid `FieldServiceStatus` value (e.g., `Scheduled = 690970000`).

**Fix:** open the booking status row in maker portal → confirm `Field Service Status` is set. If you imported via CMT and the source env had custom statuses, you may need to manually re-map after `pac data import`.

## Soft-deleted rows block re-creation

Symptom: `pac data import` or alt-key upsert returns `Channel <name> is reserved` or `Cannot create record with duplicate alternate key`.

**Cause:** Dataverse retains soft-deleted rows for 30 days. Alt-keys are protected during that window.

**Fix:** either (a) wait the 30-day window out, (b) change the run-config `reset.prefix` to a new prefix (`DEMO2-`), or (c) restore the soft-deleted row from the audit / recycle-bin and rename it.

> **No Graph or Web API endpoint can permanently delete a soft-deleted row before the 30-day window.**

## `pac` not found on Linux runner

Symptom: CI job fails with `pac: command not found` during the `config` track.

**Fix:** the `config` track only runs on `windows-latest` in `deploy-demo.yml`. If you have to run from a Linux dev box, use the Web API fallback:

```bash
python -m fsloader.orchestrate --run-config run-config.yaml --use-webapi-config
```

Drop your config rows into `config/webapi/*.yaml`. **Caveat:** Booking Status `FieldServiceStatus` mapping and Price List defaults still require a one-time Windows + `pac data import` run. The Linux fallback is best-effort, not a full replacement.

## Auth: `AADSTS700016` "application not found in the tenant"

The App Registration exists in your home tenant but the target Dataverse env is in a different tenant. App Registrations are tenant-scoped — register a new app in the target tenant, or use a multi-tenant App Reg with consent in the target.

## Auth: `AADSTS50034` "user not found"

The Application User wasn't created in **Dataverse** — only the App Registration. See [prerequisites.md §3](prerequisites.md#3-application-user-in-dataverse).

## "User does not have create privilege on bookableresource"

The Application User's role is missing `Field Service - Administrator`. `System Customizer` alone is not sufficient.

## Dates drift on re-run

By design. With `refresh_existing_dates: false`, existing WO `msdyn_timewindowstart` is **not** rewritten. New WOs (count above the existing rowset) are dated using `utcnow + offset`, so a re-run two weeks later only fills the gap.

To force a date refresh, set `refresh_existing_dates: true` in run-config — but be aware this rewrites every WO in the `DEMO-` namespace and can momentarily desync the schedule board.

## Streamlit UI shows blank logs

The `progress.stream_command` helper renders the **last 500 lines**. For very chatty operations the early lines roll off; check `~/.fsloader/last-run.log` (written by the orchestrator) for the full transcript.
