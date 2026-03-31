# Q4: What Happens With THIS Input?

### Setup

It is now February. Alice (USR-001) submits a new time segment to **WL-002** ("Bug Fix Sprint"):

```
POST /api/worklogs/WL-002/segments
{ "hours": 1.5, "ratePerHour": 75, "description": "Additional edge case fixes" }
```

**For context** (from `seed.ts`): WL-002 was settled on January 31 for **$450.00** in Remittance REM-001 (status: COMPLETED). That $450 was calculated from:
- TS-003: 6 hrs × $75 = $450
- TS-004: 2 hrs × $75 = $150
- ADJ-001: −$150
- Total: $600 − $150 = **$450**

**Assume the server has been restarted since the January settlement** — `settledWorkLogIds` is empty.

### Trace through all 10 files

**Step 1 — The POST.** Trace the handler in `api.ts` for `POST /api/worklogs/:workLogId/segments`. A new segment is inserted. Then `db.reopenWorkLog("WL-002")` is called. What is WL-002's status now?

**Step 2 — The review screen.** An admin opens `SettlementReview` for USR-001. The `useEffect` triggers `fetchWorklogs("USR-001", "OPEN")` → hits `GET /api/worklogs` in `api.ts`. The handler calls `db.getOpenWorkLogsByUser("USR-001")`, which queries for worklogs with `status = 'OPEN'`. Which worklogs are returned?

**Step 3 — Amount calculation in the GET handler.** For each returned worklog, `api.ts` calls `db.getTimeSegments(wl.id)` and `db.getAdjustments(wl.id)`. Compute the amounts:
- **WL-001**: What segments exist? What is the total?
- **WL-002**: What segments exist now (including the new one)? What adjustments exist? What is the total?

**Step 4 — The review screen renders.** `SettlementReview.tsx` displays the worklogs and `previewTotal`. What numbers does the admin see in the table? What does the "Confirm" button say?

**Step 5 — Settlement execution.** The admin clicks Confirm. `settlement.ts` → `runSettlementForUser("USR-001")` runs. It independently calls `getOpenWorkLogsByUser`, `getTimeSegments`, `getAdjustments`, and `calculateWorkLogAmount` for each worklog. Does it compute the same amounts as the GET handler in step 3? What is the Remittance total?

**Step 6 — The ledger.** After the February settlement:
- REM-001 (January): **$450.00** paid to Alice (COMPLETED)
- REM-002 (February): **$???** paid to Alice (PENDING)
- **Total paid**: $???
- **Correct total** (all segments at their rates, minus all adjustments): $???
- **Overpayment**: $???

Show your arithmetic.

**Step 7 — The silent agreement.** Both the frontend's preview total (step 4) and the backend's Remittance amount (step 5) show the same number. The admin reviewed and approved a number that matches what was executed. Explain why this is a **worse** outcome than if the preview and settlement had disagreed — what signal does the admin lose?
