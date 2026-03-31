# Q2: Trace the State

An admin opens `SettlementReview` for Bob (USR-002). The `useEffect` in `use-settlement.ts` fires `fetchWorklogs("USR-002", "OPEN")`, which hits `GET /api/worklogs?userId=USR-002&status=OPEN` in `api.ts`.

### Setup

Using the seed data, the GET handler returns Bob's two open worklogs with computed amounts:

- **WL-003** (Dashboard Redesign): segments (2 hrs × $50) + (3 hrs × $50) = $250, adjustment ADJ-002 = −$500 → **amount: −$250.00**
- **WL-004** (Performance Audit): segments (5 hrs × $60) = $300, no adjustments → **amount: $300.00**

The review screen displays both worklogs. `previewTotal` = **$50.00**. The "Confirm" button reads: **"Confirm Settlement — $50.00"**.

### The Scenario

The admin is surprised by the negative amount on WL-003. Before clicking Confirm, they switch to a different admin tool (in another browser tab) and add a corrective adjustment to WL-003:

```
INSERT INTO adjustments (id, work_log_id, amount, reason, created_at)
VALUES ('ADJ-004', 'WL-003', 300, 'Quality revision reversed', NOW())
```

The admin switches back to the Settlement Review tab and clicks **"Confirm Settlement — $50.00"**.

### Questions

1. The `useSettlement` hook has a 30-second poll interval. Assume the poll has **not** fired since the admin added ADJ-004. What data does the `SettlementReview` component still have in its local state? What total does the "Confirm" button still show?

2. The admin clicks Confirm. Trace the full request path: `confirmSettlement()` → `runSettlement("USR-002")` → `POST /api/settlements/run/USR-002` → `runSettlementForUser("USR-002")` in `settlement.ts`. The backend fetches fresh data. What does `calculateWorkLogAmount` produce for WL-003 now (with ADJ-002 AND ADJ-004)? What is the total Remittance amount?

3. The settlement succeeds. The `SettlementReview` component switches to the success screen and displays `settlementResult.totalAmount`. What number does the admin see? Compare it to the $50.00 they reviewed and approved. Where in the code — across both frontend and backend — could this discrepancy have been caught or prevented?

4. Is this purely a UX problem (admin sees wrong number then right number), or can it lead to financial harm? Construct a scenario where the divergence between preview and settlement causes an actual business problem — for example, one where the admin would have **not** clicked Confirm if they had seen the real number.
