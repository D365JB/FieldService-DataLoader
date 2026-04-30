# Demo script: Dispatcher experience

**Audience:** Field Service operations / dispatch managers.
**Duration:** 8–10 minutes.
**Persona:** Alex, dispatcher at a regional HVAC service company.
**Prerequisites:** loader run completed, `verify` track passed, default scale (60 open WOs across 14-day window).

## Setup

- Sign in as the App User's delegated dispatcher (or a real user with `Field Service - Dispatcher` role).
- Open **Field Service → Schedule Board → All Resources**.
- Set the date range to the next 7 days.

## Beats

### 1. The morning view (1 min)

> "It's Monday morning. Alex opens the board and sees the week ahead at a glance."

Show:
- Color-coded bookings by status (Scheduled / Traveling / In Progress / Completed).
- Resource list grouped by territory (Seattle / Dallas / Atlanta).
- A handful of **unscheduled** WOs in the requirements panel — that's Alex's queue.

### 2. Schedule Assistant (2 min)

> "Here's a same-day request from a top-tier customer."

- Pick an unscheduled WO with **Priority = High**.
- Click **Find Availability** (Schedule Assistant).
- Show how it filters by:
  - Required **incident type** characteristics (e.g., HVAC certification).
  - **Territory** match.
  - Time window.
- Drag the suggested resource onto the board.

### 3. Drag-to-reschedule (1 min)

> "Traffic just got bad on I-5. Alex moves the afternoon job."

- Drag an existing booking to a later slot. Show the conflict warning.
- Discuss travel-time auto-calculation (mention RSO as the v2 step that automates this at scale).

### 4. Filtering at scale (2 min)

> "We have 60 open work orders. How does Alex find what matters?"

- Open the **Bookings** view; filter by:
  - Status = Scheduled, Travel Date = Today.
  - Account = (one of the seeded HVAC accounts).
- Pivot to **Work Orders** view filtered by `WO Type = Service Call` + `Priority = High`.

### 5. Communicate (1 min)

- Open one WO; show the timeline / notes pane.
- Mention Customer Voice survey trigger (deferred to v2).

### 6. Wrap (30 s)

- "In ten minutes Alex went from a queue of 60 unscheduled WOs to a clean board. Next, we'll see how the technician picks this up on mobile." → segue to `technician-mobile-demo.md`.

## What demo data backs each beat

| Beat | Data |
|---|---|
| Schedule board populated | `40-work-orders.template.yaml` × 60, distributed past/near/far. |
| Variety of statuses | 30% in past (Completed), 50% near (Scheduled / Traveling), 20% far (Unscheduled). |
| Multi-territory | `geography.metros` produces 3+ territories. |
| Skill-aware Schedule Assistant | Bookable resources have characteristics from the preset's 6 skills. |

## Things to *not* show in v1

- RSO optimization run.
- IoT-triggered WO creation.
- Customer Voice post-completion survey.
- Anything in the `solutions/` folder (intentionally not shipped in v1).
