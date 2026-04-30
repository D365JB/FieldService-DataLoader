# Demo script: Copilot summarization & assist

**Audience:** ops leaders evaluating Copilot in Field Service.
**Duration:** 5–7 minutes.
**Persona:** Pat, service manager who needs a fast read on yesterday's exceptions.
**Prerequisites:** loader applied; **Copilot in Field Service** is enabled in the env (Power Platform admin → environment → Copilot features). This is **environment-level** and not something the loader configures.

## Setup

- Sign in as a manager-role user.
- Confirm Copilot side panel is visible on Work Order forms.
- Confirm there are completed WOs (the past 30% bucket) with notes / service-task results.

## Beats

### 1. Work order recap (2 min)

> "Pat opens a completed WO from yesterday. Instead of scrolling timeline entries, asks Copilot."

- Open a completed WO (filter `Status = Completed`).
- Open Copilot pane → **Summarize this work order**.
- Show:
  - One-paragraph recap pulled from notes + service-task completions + product use.
  - Outstanding follow-ups (e.g., "Customer requested return visit in 30 days").

### 2. Customer history (2 min)

- Navigate to the related Account.
- Ask Copilot: *"What recurring issues has this customer reported in the past 6 months?"*
- Copilot pulls across the 30% past WO bucket → highlights repeat incident types from the preset.

### 3. Drafting customer comms (1 min)

- From the WO: *"Draft a follow-up email to the customer summarizing today's visit."*
- Show the generated draft. Edit and send (or copy-out for the demo).

### 4. Schedule advisor (optional, 2 min)

- On the schedule board, ask Copilot: *"Who is the best resource for this incident in Seattle this afternoon?"*
- Show the recommendation reasoning (skills, territory, availability).

### 5. Wrap (30 s)

- Compare time-to-insight: opening 5 timeline entries vs one Copilot prompt.

## What demo data backs each beat

| Beat | Data |
|---|---|
| Recap has substance | Past-bucket WOs (30%) have notes, service-task completions, product use seeded by the loader. |
| Customer history is non-trivial | 60 WOs spread across 20 accounts → ~3 WOs per account on average. |
| Skill match in Schedule advisor | Bookable resources carry the preset's 6 skills as `bookableresourcecharacteristic` rows. |
| Variety in incident types | Vertical preset ships 4 fully-described incident types; pick the depth-4 one for richest output. |

## What to *not* claim

- Copilot does **not** infer an asset's failure root cause from the demo data — the seeded notes are templated.
- Copilot's accuracy depends on tenant-level grounding settings; results may vary between demo runs even with identical data.
- Customer Voice integration (post-visit surveys feeding Copilot summaries) is **deferred to v2**.
