# Q1: Design Choices — The Settlement Contract

Two design choices in this system work together. Read both before answering.

### Choice 1 — The Frontend Review Flow

In `SettlementReview.tsx`, the admin sees a table of worklogs and a preview total (`previewTotal`, computed in `use-settlement.ts` by summing `wl.amount` across all fetched worklogs). The admin reviews this information and clicks "Confirm Settlement."

When confirmed, `runSettlement(userId)` in `api-client.ts` fires a `POST /api/settlements/run/:userId`. The request body is empty — only the `userId` is sent as a path parameter.

The backend's `runSettlementForUser` in `settlement.ts` then independently fetches all open worklogs, recalculates every amount from scratch using `calculateWorkLogAmount`, and creates the Remittance.

### Choice 2 — The In-Memory Guard

In `settlement.ts`, the `SettlementEngine` is a singleton with a `settledWorkLogIds: Set<string>` that is checked before processing each worklog and is never cleared. The developer's comment states this "prevents double-payments even if the database status update is delayed."

### Questions

1. The review screen shows the admin a specific set of worklogs and amounts. The backend independently decides what to settle. Under what real-world conditions will the review screen's numbers and the backend's settlement numbers **diverge**? Enumerate at least three concrete scenarios, referencing the time gap between the `fetchWorklogs` call (in the `useEffect` of `use-settlement.ts`) and the eventual `POST` to the settlement API.

2. When the numbers do diverge, the success screen in `SettlementReview.tsx` shows `settlementResult.totalAmount` (from the backend response), NOT the `previewTotal` the admin reviewed. Trace the code to confirm this. What is the UX consequence — does the admin have any signal that what they approved is not what was executed?

3. The `POST` request carries no worklog IDs, no amounts, no idempotency key. What class of problems does this create if the admin's network is unreliable and the request is retried (e.g., browser retry, load balancer retry)? How does the `settledWorkLogIds` Set interact with this scenario — does it help, hurt, or do nothing?

4. Describe what a robust settlement contract would look like end-to-end. What should the frontend send? What should the backend validate before executing? How should retries be handled?
