# Solution

---

## Q1: Design Choices — The Settlement Contract

### 1. Scenarios where preview and settlement numbers diverge

There is a time gap between when `fetchWorklogs` is called (in the `useEffect` of `use-settlement.ts`) and when the admin clicks Confirm, which triggers `POST /api/settlements/run/:userId`. During this gap, the underlying data can change. At least three concrete scenarios:

**Scenario A: New time segment added.** A freelancer (or another admin using a different tool) adds a new `TimeSegment` to one of the open worklogs via `POST /api/worklogs/:workLogId/segments`. The backend's `runSettlementForUser` calls `db.getTimeSegments(wl.id)` at settlement time and picks up this new segment, increasing the worklog's amount. The preview total shown in the UI does not reflect this addition because the poll hasn't fired.

**Scenario B: Adjustment added or modified.** An adjustment is inserted directly into the `adjustments` table (e.g., an admin adds a penalty or bonus through a separate admin tool, as shown in the Q2 scenario with ADJ-004). The backend's settlement fetches adjustments fresh via `db.getAdjustments(wl.id)`, computing a different amount than what the frontend displayed.

**Scenario C: A new OPEN worklog appears for the user.** Between the frontend's fetch and the settlement execution, a new worklog is created (or a previously SETTLED worklog is reopened via `db.reopenWorkLog`). The backend's `db.getOpenWorkLogsByUser(userId)` picks up this additional worklog, adding its amount to the remittance total. The frontend never displayed this worklog at all.

**Scenario D: Another admin triggers settlement concurrently.** If two admins are both viewing the review screen for the same user and one clicks Confirm first, the second admin's preview still shows the worklogs, but the backend has already marked them as SETTLED. The second settlement would return null (no open worklogs), and the frontend would error trying to access `result.remittance.totalAmount`.

### 2. UX consequence of showing backend result vs. preview

Confirmed by tracing the code:

- In `use-settlement.ts`, `confirmSettlement` stores the backend response:
  ```typescript
  setSettlementResult({
    remittanceId: result.remittance.id,
    totalAmount: result.remittance.totalAmount,
  });
  ```
- In `SettlementReview.tsx`, the success screen renders `settlementResult.totalAmount`:
  ```tsx
  <strong>${settlementResult.totalAmount.toFixed(2)}</strong>
  ```
- This is the **server-confirmed amount**, NOT `previewTotal`.

**UX consequence:** The admin sees the correct final number, the amount that was actually settled. However, there is **no comparison or notification** that the amount differs from what they reviewed. The admin approved "$50.00" but might see "$350.00" on the success screen. If they remember the preview number, they'd notice the discrepancy, but there is no programmatic signal no warning, no diff, no audit trail. The admin has no way to know *why* it changed or *what* changed without investigating separately.

### 3. Problems with no worklog IDs, no amounts, no idempotency key

This creates problems in at least two categories:

**Duplicate settlements:** If the first request succeeds but the response is lost (network timeout, load balancer timeout), the admin has no indication of success. They (or the browser/load balancer) may retry. On retry:
- If the in-memory `settledWorkLogIds` Set still has the worklog IDs AND the process hasn't restarted, the Set would cause the loop to skip those worklogs. `getOpenWorkLogsByUser` returns empty (worklogs are now SETTLED in DB), so `runSettlementForUser` returns `null`, and the API returns `{ message: "No open worklogs found" }`. The frontend then errors trying to read `result.remittance.totalAmount` on `undefined`, displaying "Settlement failed." The admin thinks it failed when it actually succeeded.
- If the server restarted between attempts, the Set is empty, but the worklogs are already SETTLED in DB, so the same outcome occurs.

**No intent verification:** Because the request carries no worklog IDs or amounts, the backend cannot verify that the admin's intent matches what is about to be executed. The backend settles whatever it finds at execution time. If new worklogs appeared or amounts changed, the admin has unknowingly approved something different from what they reviewed.

**The `settledWorkLogIds` Set interaction:** The Set provides marginal value. In the retry scenario, the DB status (`SETTLED`) is the authoritative guard `getOpenWorkLogsByUser` only returns OPEN worklogs, so already-settled worklogs are naturally excluded. The Set helps only in one narrow case: concurrent in-flight requests within the same process where the DB write hasn't committed yet. But it has serious limitations it is volatile (lost on restart), per-process (useless with multiple server instances), and never cleared (grows unboundedly, though this is more of a memory concern than a correctness issue).

### 4. A robust settlement contract

**Frontend sends:**
```json
{
  "userId": "USR-002",
  "worklogIds": ["WL-003", "WL-004"],
  "expectedTotal": 50.00,
  "idempotencyKey": "uuid-v4-generated-by-client"
}
```

**Backend validates before executing:**
1. Check the idempotency key against a durable store (e.g., a DB table). If already processed, return the cached response.
2. Fetch current open worklogs for the user. Verify that the submitted `worklogIds` match exactly no missing, no extra.
3. Recalculate amounts for each worklog. Compare the computed total to `expectedTotal`. If they diverge beyond a threshold, reject with a 409 Conflict and return the fresh data so the frontend can update.
4. Execute the settlement within a **database transaction**: mark worklogs as SETTLED, create the remittance and line items atomically. If any step fails, the entire transaction rolls back no orphaned state.
5. Record the idempotency key with the result.

**Retry handling:**
- The idempotency key ensures retries are safe: the backend returns the same response for the same key.
- The frontend stores the idempotency key locally and reuses it on retry, guaranteeing at-most-once semantics.
- If the response is lost, the admin can retry and get the original result.

---

## Q2: Trace the State

### 1. Local state after ADJ-004 is added (poll not fired)

The `useSettlement` hook's `worklogs` state still contains the data from the initial fetch. The poll interval is 30 seconds and has not fired. Local state is unchanged:

- WL-003: amount = $250 − $500 = **−$250.00** (only ADJ-002 is reflected)
- WL-004: amount = **$300.00**
- `previewTotal` = −$250 + $300 = **$50.00**

The "Confirm" button still reads: **"Confirm Settlement $50.00"**

### 2. Backend recalculation with ADJ-002 and ADJ-004

When the admin clicks Confirm, the flow is:
1. `confirmSettlement()` calls `runSettlement("USR-002")` → `POST /api/settlements/run/USR-002`
2. `runSettlementForUser("USR-002")` fetches fresh data from the database

**WL-003 recalculated:**
- Segments: TS-005 (2 × $50 = $100) + TS-006 (3 × $50 = $150) = **$250**
- Adjustments: ADJ-002 (−$500) + ADJ-004 (+$300) = **−$200**
- `calculateWorkLogAmount` = $250 + (−$200) = **$50.00**

**WL-004:**
- Segments: TS-007 (5 × $60 = $300)
- No adjustments
- `calculateWorkLogAmount` = **$300.00**

**Remittance total:** $50 + $300 = **$350.00**

### 3. What the admin sees on the success screen

The success screen in `SettlementReview.tsx` displays `settlementResult.totalAmount` = **$350.00**.

The admin reviewed and approved **$50.00** but sees **$350.00** on the success screen. That's a **$300 increase** they did not explicitly review.

**Where could this have been caught or prevented:**
- **Frontend (use-settlement.ts):** Before calling `runSettlement`, the hook could re-fetch worklogs and compare the new total to `previewTotal`, warning the admin if they diverge.
- **Backend (settlement.ts):** If the frontend sent the expected total and worklog IDs, `runSettlementForUser` could compare its computed total against the expected total and reject if they differ.
- **Frontend (SettlementReview.tsx):** The success screen could display both the previewed amount and the settled amount side-by-side so the admin has a clear visual comparison.
- **Backend (api.ts):** The settlement endpoint could return a breakdown of amounts per worklog, allowing the frontend to highlight which worklogs changed.

### 4. Financial harm scenario

This is not purely a UX problem it can cause financial harm:

**Scenario:** Bob has one worklog WL-003 with a preview total of **−$250.00** (segments $250, adjustment −$500). The admin sees this negative amount and decides to proceed because WL-004 at +$300 makes the net total +$50, which is a small, reasonable payout. Between preview and confirmation, another admin adds a corrective adjustment of +$10,000 (mistakenly they meant $100). The backend settles for $10,050, creating a remittance and marking the worklogs as SETTLED. The admin sees "$10,050.00" on the success screen but the money has already been committed.

If the admin had seen the real total of $10,050 before clicking Confirm, they would have **stopped and investigated** the anomalous amount. The lack of pre-execution validation means the system cannot catch erroneous data entry before funds are committed. In a financial system, the preview-and-confirm pattern only has value if the confirmation is binding  i.e., the system executes what was previewed, nothing more and nothing less.

---

## Q3: Predict the Failure Mode

### 1. Database state after createRemittance throws

- **WL-003**: status = `SETTLED`, `lastSettledAt` = current timestamp
- **WL-004**: status = `SETTLED`, `lastSettledAt` = current timestamp
- **Remittance**: **Does not exist.** `db.createRemittance` threw before inserting.
- **Remittance line items**: **Do not exist.** They are created after the remittance.
- **Money paid to Bob**: **$0.** No remittance was created, so no payment was initiated.

Both worklogs are marked as SETTLED in the database, but there is no corresponding payment record. This is an **inconsistent state** the system thinks these worklogs have been settled, but no money was actually allocated.

### 2. What the admin sees

The `POST` returns HTTP 500 (`{ error: "Settlement failed" }`). In `use-settlement.ts`:

- The `catch` block executes: `setError("Settlement failed. Please try again.")` and `setIsSettling(false)`
- `setWorklogs([])` is in the `try` block and was **not reached**, so worklogs remain in local state
- The admin sees: WL-003 and WL-004 still listed in the table, the error banner "Settlement failed. Please try again.", and the Confirm button is re-enabled

The natural next action: the admin clicks "Confirm Settlement" again.

### 3. The retry

1. `runSettlementForUser("USR-002")` executes again
2. `db.getOpenWorkLogsByUser("USR-002")` queries `WHERE status = 'OPEN'`
3. Both WL-003 and WL-004 are now `SETTLED` in the database → **returns empty array**
4. `worklogs.length === 0` → `return null`
5. In the API handler (`api.ts`), `remittance` is `null`, so it responds: `res.json({ message: "No open worklogs found for this user." })` with **HTTP 200**

### 4. Frontend after retry

The response is HTTP 200, so `runSettlement` in `api-client.ts` does not throw (the `if (!res.ok)` check passes). It returns the parsed JSON: `{ message: "No open worklogs found for this user." }`.

Back in `use-settlement.ts`, `confirmSettlement` tries:
```typescript
const result = await runSettlement(userId);
setSettlementResult({
  remittanceId: result.remittance.id,        // result.remittance is undefined
  totalAmount: result.remittance.totalAmount, // TypeError!
});
```

`result.remittance` is `undefined`. Accessing `.id` on `undefined` throws a **TypeError**: "Cannot read properties of undefined (reading 'id')".

This error is caught by the `catch` block, which sets `error: "Settlement failed. Please try again."`. The admin sees the error banner again. The worklogs still appear in the UI (local state was not cleared). The admin is stuck in an error loop every retry produces the same TypeError.

### 5. The compound state

| Layer | State |
|-------|-------|
| **Database** | WL-003 = SETTLED, WL-004 = SETTLED. No remittance exists. No line items exist. Bob has been paid $0. |
| **In-memory** | `settledWorkLogIds` contains `"WL-003"` and `"WL-004"` |
| **Frontend (current admin)** | Sees WL-003 and WL-004 in the table (stale local state) with error banner "Settlement failed. Please try again." Every retry fails. |
| **Frontend (new admin)** | Opens fresh `SettlementReview` for Bob → `fetchWorklogs("USR-002", "OPEN")` → `getOpenWorkLogsByUser` returns [] → sees "No open worklogs to settle." |

**Can Bob's worklogs be settled through normal operation?** No. They are stuck:

1. The worklogs are SETTLED in the DB, so `getOpenWorkLogsByUser` never returns them.
2. Even if someone manually set them back to OPEN in the DB, the in-memory `settledWorkLogIds` Set would skip them in the settlement loop.
3. Even if the Set check were bypassed (e.g., via server restart clearing the Set), and the worklogs were manually reopened in the DB, then settlement could proceed but this requires **two manual interventions**: a DB update (`UPDATE work_logs SET status = 'OPEN' WHERE id IN ('WL-003', 'WL-004')`) and a server restart (to clear the in-memory Set).

**Recovery requires:** Manual database intervention to set WL-003 and WL-004 back to `OPEN` status, plus a server restart to clear the in-memory `settledWorkLogIds` Set. Alternatively, the DBA could manually create the missing remittance and line items to bring the database into a consistent state without re-running settlement.

---

## Q4: What Happens With THIS Input?

### Step 1: The POST

The handler in `api.ts` for `POST /api/worklogs/:workLogId/segments`:
1. Inserts a new time segment for WL-002 (1.5 hrs × $75)
2. Calls `db.reopenWorkLog("WL-002")` → executes `UPDATE work_logs SET status = 'OPEN' WHERE id = 'WL-002'`

**WL-002's status is now `OPEN`.** Its `lastSettledAt` remains `"2025-01-31T18:00:00Z"` (only `status` is updated by `reopenWorkLog`).

### Step 2: The review screen

`fetchWorklogs("USR-001", "OPEN")` → `getOpenWorkLogsByUser("USR-001")` queries `WHERE user_id = 'USR-001' AND status = 'OPEN'`.

Two worklogs are now OPEN for Alice:
- **WL-001** (API Integration) — was always OPEN
- **WL-002** (Bug Fix Sprint) — just reopened

Both are returned.

### Step 3: Amount calculation in the GET handler

The `api.ts` GET handler computes amounts inline:

**WL-001:**
- Segments: TS-001 (4 × $75 = $300) + TS-002 (3.5 × $75 = $262.50)
- Adjustments: none
- **Amount: $562.50**

**WL-002:**
- Segments: TS-003 (6 × $75 = $450) + TS-004 (2 × $75 = $150) + new segment (1.5 × $75 = $112.50) = **$712.50**
- Adjustments: ADJ-001 (−$150)
- **Amount: $712.50 − $150 = $562.50**

Note: `getTimeSegments` and `getAdjustments` fetch **ALL** segments and adjustments for the worklog — they have no time-based filtering. The previously settled segments TS-003 and TS-004 are included.

### Step 4: The review screen renders

The admin sees:

| WorkLog ID | Task | Amount |
|-----------|------|--------|
| WL-001 | API Integration | $562.50 |
| WL-002 | Bug Fix Sprint | $562.50 |

`previewTotal` = $562.50 + $562.50 = **$1,125.00**

The Confirm button reads: **"Confirm Settlement — $1,125.00"**

### Step 5: Settlement execution

`runSettlementForUser("USR-001")` independently fetches segments and adjustments and calls `calculateWorkLogAmount`:

- **WL-001:** same data → `calculateWorkLogAmount` = **$562.50**
- **WL-002:** same data → `calculateWorkLogAmount` = **$562.50**

Both the GET handler and `calculateWorkLogAmount` use the same logic (`sum(hours × rate) + sum(adjustments)`), just implemented in different places. They produce the **same amounts**.

**Remittance total: $1,125.00** — matches the preview.

### Step 6: The ledger

| Remittance | Amount | Status |
|-----------|--------|--------|
| REM-001 (January) | $450.00 | COMPLETED |
| REM-002 (February) | $1,125.00 | PENDING |
| **Total paid** | **$1,575.00** | |

**Correct total** (all of Alice's work, each segment counted once):
- TS-001: 4 × $75 = $300.00
- TS-002: 3.5 × $75 = $262.50
- TS-003: 6 × $75 = $450.00
- TS-004: 2 × $75 = $150.00
- New segment: 1.5 × $75 = $112.50
- ADJ-001: −$150.00
- **Correct total: $1,125.00**

**Overpayment: $1,575.00 − $1,125.00 = $450.00**

Alice is overpaid by exactly **$450.00** — the amount that was already settled in January. The previously-settled segments TS-003 ($450) and TS-004 ($150) and ADJ-001 (−$150) were counted again: $450 + $150 − $150 = $450 overpaid.

### Step 7: The silent agreement

The preview total ($1,125.00) and the settlement total ($1,125.00) **match exactly**. This is **worse** than a discrepancy because:

1. **A discrepancy would have been a signal.** If the preview showed $1,125 but the settlement produced $675 (or vice versa), the admin would notice something is wrong. The mismatch would prompt investigation.

2. **Agreement breeds false confidence.** The admin sees the number they reviewed is exactly the number that was executed. The entire review-and-confirm flow appears to be working correctly. The admin has no reason to suspect an overpayment.

3. **The overpayment is structurally invisible.** Both the frontend (GET handler) and the backend (settlement engine) use the same flawed approach: fetch ALL segments and adjustments without regard for what was previously settled. They agree on the wrong number because they share the same blind spot. The bug is in the data model — there is no record of which segments/adjustments were already included in REM-001 — and both code paths inherit this flaw equally.

4. **The admin loses the only feedback mechanism.** The review-confirm-verify flow is the system's sole safeguard against incorrect payouts. When the preview and settlement agree, the admin has verified the system against itself. The cross-check is meaningless because both sides compute from the same incomplete data.

---

## Q5: Fix Evaluation

### Fix A — Backend: Use `filterNewSegments`

#### 1. Which segments are kept/discarded for WL-002?

`worklog.lastSettledAt` = `"2025-01-31T18:00:00Z"`. `filterNewSegments` uses strict greater-than: `new Date(segment.createdAt) > new Date(lastSettledAt)`.

- **TS-003** (created `2025-01-12T18:00:00Z`): Jan 12 < Jan 31 → **DISCARDED** ✓
- **TS-004** (created `2025-01-13T12:00:00Z`): Jan 13 < Jan 31 → **DISCARDED** ✓
- **New segment** (created in February 2025): Feb > Jan 31 → **KEPT** ✓

Only the new segment is kept. This is correct for segments.

#### 2. Amount with unfiltered adjustments

`adjustments` still contains ADJ-001 (−$150, created Jan 30). `filterNewSegments` only filters segments, not adjustments.

```
calculateWorkLogAmount(newSegments, adjustments)
= sum(newSegments) + sum(adjustments)
= (1.5 × $75) + (−$150)
= $112.50 + (−$150.00)
= −$37.50
```

**Alice would be paid −$37.50 for WL-002.** This is incorrect. The $150 penalty was already accounted for in the January settlement (REM-001). Applying it again effectively double-counts the penalty, underpaying Alice by $150 relative to the correct amount.

The correct February settlement for WL-002 should be just the new segment: **$112.50**. Fix A is incomplete because it filters segments by `lastSettledAt` but applies **all** adjustments regardless of when they were created or whether they were already settled.

#### 3. Strict greater-than edge case

**Scenario:** A segment is created at the exact same timestamp as `lastSettledAt`. For example, during the January settlement, `updateWorkLogStatus` sets `lastSettledAt = new Date().toISOString()`. If a segment happens to be inserted at the exact same millisecond (or the timestamps are truncated to the same second), its `createdAt` equals `lastSettledAt`.

`filterNewSegments` uses strict `>`, so a segment where `createdAt === lastSettledAt` would be **excluded**. If this segment was NOT included in the previous settlement (it was created after the settlement loop read the segments but before the status was updated), it would be a legitimate new segment that is silently dropped.

**Likelihood:** Low in practice it requires exact millisecond collision between a segment insert and the settlement timestamp write. However, if timestamps are truncated to seconds (as some databases do), the window widens. **Financial impact:** The freelancer loses the payment for that segment entirely, with no error or notification. In a financial system, even low-probability data loss is unacceptable.

### Fix B — Frontend: Pre-Flight Validation

#### 4. Does it prevent the Q2 stale-data problem?

**Partially.** If ADJ-004 was added between the initial page load and the confirmation click, the pre-flight re-fetch would detect the total change ($50.00 → $350.00). The admin would see the warning message and have the opportunity to review the updated data before proceeding.

However, it only catches staleness it does not prevent the admin from confirming the stale data intentionally (after reviewing the updated amounts, they click Confirm again, which re-runs the same pre-flight check, which now passes).

#### 5. TOCTOU race condition

**Yes, the data can change again.** Between the pre-flight `fetchWorklogs` and the backend's `runSettlementForUser` execution, another adjustment, segment, or worklog could be added or modified. This is a **Time-of-Check-to-Time-of-Use (TOCTOU)** race condition.

The window is small (milliseconds to seconds), but it is **not small enough to ignore in a financial system**. Financial systems require transactional guarantees — "check and act" must be atomic. A pre-flight validation on the client side can never provide this guarantee because the check and the action are separate HTTP requests with no shared transaction boundary. Any amount of money lost or overpaid due to a race condition is a correctness failure.

#### 6. Do they compute the same amounts?

The GET handler in `api.ts` computes amounts **inline**:
```typescript
const amount = segments.reduce((sum, s) => sum + s.hours * s.ratePerHour, 0)
  + adjustments.reduce((sum, a) => sum + a.amount, 0);
```

The settlement in `settlement.ts` calls `calculateWorkLogAmount` from `calculations.ts`:
```typescript
const segmentTotal = segments.reduce(
  (sum, segment) => sum + calculateSegmentAmount(segment), 0
);
```
where `calculateSegmentAmount` = `segment.hours * segment.ratePerHour`.

Both compute `sum(hours × ratePerHour) + sum(adjustment.amount)` — mathematically identical. They **are** guaranteed to produce the same amounts for the same data, but the logic is **duplicated** in two places. If one is updated (e.g., to use `filterNewSegments`) and the other is not, they would silently diverge. The GET handler should call `calculateWorkLogAmount` instead of re-implementing the formula.

### 7. The Root Cause

The **fundamental design flaw** is that the system **does not record which specific segments and adjustments were included in each settlement**. When a worklog is reopened, the system re-fetches and re-calculates ALL segments and adjustments, including those that were already paid for in a previous remittance. There is no "settlement ledger" linking individual segments/adjustments to remittance line items.

**Structural change needed:**

**Data model:**
- Add a `settled_in_remittance_id` (or `settlement_id`) column to both the `time_segments` and `adjustments` tables (nullable, foreign key to `remittances`).
- Alternatively, create a junction table `settlement_items` that records every (remittance_id, segment_id) and (remittance_id, adjustment_id) pair.

**Backend (`db.ts`, `settlement.ts`):**
- When fetching segments/adjustments for settlement, query only those where `settled_in_remittance_id IS NULL` — i.e., unsettled items.
- When creating remittance line items, update the settled segments and adjustments to reference the new remittance ID.
- Wrap the entire settlement in a **database transaction** so marking items as settled and creating the remittance are atomic.

**Frontend (`api.ts` GET handler):**
- When computing the preview amount for a reopened worklog, fetch only unsettled segments/adjustments (where `settled_in_remittance_id IS NULL`) to show the admin the correct incremental amount.

**Result:** Each segment and adjustment can only be settled once. Reopening a worklog and adding a new segment correctly results in only the new segment being included in the next settlement. The system structurally prevents double-counting regardless of timing, filtering logic, or operator error.
