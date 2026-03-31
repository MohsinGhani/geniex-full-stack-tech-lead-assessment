# Q3: Predict the Failure Mode

### Setup

An admin triggers a settlement for Bob (USR-002) by clicking Confirm in `SettlementReview`. The `POST /api/settlements/run/USR-002` request reaches `runSettlementForUser` in `settlement.ts`.

The settlement loop begins. It processes WL-003 and WL-004:

- Calls `calculateWorkLogAmount` for WL-003 → computes an amount
- Calls `db.updateWorkLogStatus("WL-003", "SETTLED", ...)` → **WL-003 is now SETTLED in the database**
- Adds `"WL-003"` to `settledWorkLogIds`
- Calls `calculateWorkLogAmount` for WL-004 → computes an amount
- Calls `db.updateWorkLogStatus("WL-004", "SETTLED", ...)` → **WL-004 is now SETTLED in the database**
- Adds `"WL-004"` to `settledWorkLogIds`

The loop ends. Then `db.createRemittance(userId, totalAmount)` is called — and it **throws** (database connection timeout).

### Questions

1. **Trace the database state.** What is the status of WL-003 and WL-004? Does a Remittance record exist for Bob? How much money has Bob been paid?

2. **Trace the frontend.** The `POST` returns a 500. In `use-settlement.ts`, the `catch` block sets `error: "Settlement failed. Please try again."` and `isSettling: false`. The worklogs are **not** cleared from local state (only the `try` block calls `setWorklogs([])`). What does the admin see? What do they do next?

3. **Trace the retry.** The admin clicks "Confirm Settlement" again. `runSettlementForUser("USR-002")` executes again. `db.getOpenWorkLogsByUser("USR-002")` queries for worklogs with `status = 'OPEN'`. What does it return? What does `runSettlementForUser` return to the API? What HTTP response does the frontend receive?

4. **Trace the UI after retry.** The API returns `{ message: "No open worklogs found for this user." }`. But the frontend's `runSettlement` in `api-client.ts` tries to parse `result.remittance.totalAmount`. The response has no `remittance` field. What happens? What does the admin see now?

5. **The compound state.** After the retry, describe the full picture:
   - Database: What is the status of WL-003 and WL-004? Is there a Remittance?
   - In-memory: What does `settledWorkLogIds` contain?
   - Frontend: What does the admin see?
   - If a new admin opens a fresh `SettlementReview` for Bob, what will they see?
   - Can Bob's worklogs ever be settled through normal operation? What would it take to recover?
