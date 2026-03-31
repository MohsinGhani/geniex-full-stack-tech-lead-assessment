# Q5: Fix Evaluation

The team discovers the overpayment from Q4 and proposes two fixes — one backend, one frontend. Evaluate both.

---

## Fix A — Backend: Use `filterNewSegments`

The developer notices that `calculations.ts` already has a `filterNewSegments` function that was never wired up. They propose this change in `settlement.ts`:

```typescript
// BEFORE
const segments = await db.getTimeSegments(worklog.id);
const adjustments = await db.getAdjustments(worklog.id);
const amount = calculateWorkLogAmount(segments, adjustments);

// AFTER
const segments = await db.getTimeSegments(worklog.id);
const adjustments = await db.getAdjustments(worklog.id);
const newSegments = filterNewSegments(segments, worklog.lastSettledAt);
const amount = calculateWorkLogAmount(newSegments, adjustments);
```

### Questions for Fix A

1. Apply this fix mentally to the WL-002 scenario from Q4. `worklog.lastSettledAt` is `"2025-01-31T18:00:00Z"`. The three segments are TS-003 (created Jan 12), TS-004 (created Jan 13), and the new segment (created in February). Which segments does `filterNewSegments` keep? Which does it discard?

2. Now look at what `adjustments` still contains: ADJ-001 (−$150, created Jan 30). It is **not** filtered — `filterNewSegments` only filters segments, not adjustments. What does `calculateWorkLogAmount(newSegments, adjustments)` return for WL-002? Show the arithmetic. Is Alice paid correctly?

3. `filterNewSegments` uses strict greater-than: `new Date(segment.createdAt) > new Date(lastSettledAt)`. Construct a scenario where a legitimate segment is excluded because its `createdAt` timestamp is equal to (not strictly after) `lastSettledAt`. How likely is this in practice, and what would the financial impact be?

---

## Fix B — Frontend: Pre-Flight Validation

A second developer proposes adding a pre-flight check in the frontend. Before confirming settlement, re-fetch the current amounts and compare them to what was displayed:

```typescript
const handleConfirm = async () => {
  // Re-fetch to check for staleness
  const freshWorklogs = await fetchWorklogs(userId, "OPEN");
  const freshTotal = freshWorklogs.reduce((sum, wl) => sum + wl.amount, 0);

  if (Math.abs(freshTotal - previewTotal) > 0.01) {
    setWarning(
      `Amounts have changed since you loaded this page. ` +
      `Expected $${previewTotal.toFixed(2)}, now $${freshTotal.toFixed(2)}. ` +
      `Please review and try again.`
    );
    setWorklogs(freshWorklogs); // Update to fresh data
    return;
  }

  // Amounts match — proceed with settlement
  const result = await runSettlement(userId);
  // ...
};
```

### Questions for Fix B

4. Does this fix prevent the stale-data problem from Q2 (where an adjustment was added between page load and confirmation)?

5. The pre-flight check passes (amounts match), and then `runSettlement(userId)` fires. Between the pre-flight `fetchWorklogs` and the backend's `runSettlementForUser` execution, can the data change again? What is the name for this class of consistency bug? Is the window small enough to ignore in a financial system?

6. The pre-flight check re-fetches via `GET /api/worklogs`. Trace the handler in `api.ts`: it calls `db.getOpenWorkLogsByUser` and computes amounts using `getTimeSegments` and `getAdjustments`. The settlement in `settlement.ts` does the same. Are they guaranteed to compute the same amounts for the same worklogs? Look carefully at whether they call the same functions or re-implement the logic.

---

## The Root Cause

7. Both Fix A and Fix B are treating symptoms. What is the **fundamental design flaw** that makes the overpayment possible in the first place? (Hint: it is not about filtering or freshness — it's about what the system fails to record.) Describe the structural change needed across the data model, the backend, and the frontend to guarantee that no segment or adjustment is ever double-counted in a settlement, regardless of timing.
