# Demo script: Technician mobile experience

**Audience:** field technicians, frontline managers.
**Duration:** 6–8 minutes.
**Persona:** Sam, HVAC technician on the Seattle territory.
**Prerequisites:** loader applied, technician account assigned the Field Service - Resource role, `users:` in run-config includes the technician's UPN so a User-type Bookable Resource exists.

## Setup

- Sign in as the technician on a tablet (or use Edge mobile emulation).
- Open the **Field Service (Dynamics 365)** mobile app.
- Confirm at least 2 bookings appear for the day (drawn from the near-future 50% bucket).

## Beats

### 1. My day at a glance (1 min)

> "Sam taps the app. Today's bookings, sorted by start time."

- Show booking cards: customer name, address, time window, ETA.
- Tap one to drill in.

### 2. The work order detail (2 min)

- Show:
  - **Incident type** (e.g., *AC unit not cooling* — from the HVAC preset's 4 incident types).
  - **Service tasks** checklist (auto-populated by the incident type template).
  - **Required products / skills** list.
  - **Customer asset** linked to the WO (from the 3-level asset tree the loader generated).

### 3. En route (30 s)

- Tap **Travel** → status flips to Traveling. (Mention map / route integration; mock if device has no GPS.)

### 4. On site & doing the work (2 min)

- Tap **In Progress**.
- Tick off service tasks.
- Add a product use (one of the preset's 8 products).
- Capture a photo. *(Note: the loader auto-attached a sample photo to open WOs; show that too.)*
- Add a quick note.

### 5. Completion (1 min)

- Capture customer signature.
- Tap **Complete**. Status → Completed.
- Show how the dispatcher's board updates back on `dispatcher-demo.md`.

### 6. Offline scenario (optional, 1 min)

- Toggle airplane mode briefly; show that edits queue and sync when online. (No special demo data needed.)

## What demo data backs each beat

| Beat | Data |
|---|---|
| Technician has bookings | One Bookable Resource per `users:` entry; one Booking per WO in the near-future window. |
| WOs link to assets | `customer_assets.enabled: true` builds the 3-level tree per account. |
| Service-task checklists populate | CMT bundle's `msdyn_incidenttypeservicetask` rows. |
| Photo on WO | `attachments.attach_photo_to_open_wo: true`. |

## Watch out for

- If the technician sees zero bookings, check that their UPN is in `run-config.yaml → users:` and that `bookableresource.resourcetype = 3 (User)` after the load. The verifier asserts ≥20 future bookings exist but does **not** check per-user fan-out.
