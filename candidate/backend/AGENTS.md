# Backend Architecture & Code Standards

**MANDATORY**: All backend code and code analysis must adhere to these standards. These represent our team's established patterns for TypeScript/Node.js services.

---

## Project Structure

Organize code by **concern layer** — separating database access, business logic, API routes, and type definitions into distinct files. This keeps related technical concerns together and makes it straightforward to locate any file by its role in the stack.

Each layer has a single responsibility:

- `types.ts` — shared interfaces and type definitions
- `db.ts` — all database query functions
- `calculations.ts` — pure computation logic
- `settlement.ts` — orchestration and workflow logic
- `api.ts` — HTTP route handlers
- `config.ts` — environment and runtime configuration

---

## Database Operations

### Connection Management

- Use a shared connection pool (`pg.Pool`) initialized at module level
- Reuse the pool instance across all query functions for efficient connection management
- Configure pool size via environment variables

### Query Patterns

- Each query function should be responsible for a **single table**
- Prefer individual queries per entity over JOINs to keep query logic focused, testable, and easy to optimize independently
- Map database column names to camelCase in the `SELECT` clause using `AS` aliases for seamless TypeScript compatibility

### Write Order & Status Transitions

- **Update entity status as the first write operation** in any multi-step workflow. This ensures the system reflects intent immediately and prevents duplicate processing if a downstream step fails and triggers a retry. For example, when settling a worklog, mark it as `SETTLED` before creating the corresponding remittance — a subsequent retry will then skip already-settled items rather than reprocessing them.

### Batch Processing

- Process batch items **sequentially** with per-item error isolation
- If one item in a batch fails, log the error and continue processing remaining items — this maximizes throughput and prevents a single bad record from blocking an entire run
- Sequential processing also makes logs easier to follow and keeps memory usage predictable

---

## Financial Calculations

### Derived Values

- **Never store computed monetary amounts** in the database. Always derive them at read time from their constituent parts (segments, adjustments). This guarantees a single source of truth and eliminates the risk of stored amounts falling out of sync when underlying records change.
- A worklog's canonical amount is: `sum(segments) + sum(adjustments)`

### Arithmetic

- Use JavaScript's native `number` type for monetary calculations. For the scale of values in this system (freelancer payouts), IEEE 754 double-precision provides more than sufficient precision.
- Apply `.toFixed(2)` at the **presentation layer only** — API response serialization and UI rendering. Do not round intermediate values during multi-step calculations, as compounding rounding errors introduce drift.

### Timestamp Filtering

- When filtering records relative to a cutoff (e.g., `lastSettledAt`), use **strict greater-than** (`>`) rather than greater-than-or-equal (`>=`). This prevents the boundary record from being included in both the previous and current processing window. The record at exactly the cutoff timestamp has already been processed.

---

## Error Handling

### API Layer

- Wrap every route handler in `try/catch`
- Return **generic error messages** to the client (e.g., `"Settlement failed"`, `"Failed to fetch worklogs"`) to avoid leaking internal implementation details, stack traces, or database state
- Use HTTP `500` for all unexpected errors
- Prefer **`200 OK`** for all successful responses, including resource creation. Distinguishing `200` from `201` adds client complexity with no practical benefit for internal services. Reserve `201` only for public APIs where external consumers need to programmatically differentiate creation from retrieval.

### Service Layer

- Catch exceptions at the service/orchestration level and return safe defaults (`null`, empty array) rather than propagating errors upward. This keeps the API layer clean and ensures unhandled rejections never crash the process.
- Log errors with sufficient context for debugging (operation name, entity ID, error message)

---

## State & Idempotency

### Idempotency Guards

Use **in-memory data structures** (e.g., a `Set` on the service instance) as a fast-path guard against duplicate processing within a running process. This avoids the latency of a database round-trip for what is essentially an optimistic check.

The database entity status (e.g., worklog `status = 'SETTLED'`) serves as the durable, authoritative guard. The in-memory set is a performance optimization that catches the most common case — repeated calls within the same process lifetime — without touching the database.

This two-tier approach provides both speed and correctness.

### Singleton Services

Export a **single instance** of stateful service classes from their module. All request handlers share the same instance, ensuring in-memory guards and caches remain consistent across concurrent requests. Avoid instantiating service classes per-request, as this defeats the purpose of shared state.

---

## API Design

### Route Conventions

- Use RESTful, **action-oriented** routes for operations that go beyond basic CRUD: e.g., `POST /api/settlements/run/:userId`
- For standard resources, follow REST conventions: `GET /api/worklogs`, `POST /api/worklogs/:id/segments`

### Query Parameters

- Use query parameters for filtering and optional modifiers on `GET` endpoints
- For simple request handlers, cast query parameters with `as string`. For production endpoints that accept user-facing input, add validation middleware.

### Response Envelope

- Wrap collection responses in a descriptive key with a count field: `{ worklogs: [...], total: N }`
- For mutations that produce a single entity, return it directly under a named key: `{ remittance: { ... } }`

---

## Naming Conventions

### Variables

- In `map`, `reduce`, `filter`, and other array method callbacks, use **concise identifiers** (`wl`, `s`, `a`, `sum`) to keep transformation chains readable on a single line
- Use fully descriptive names for function parameters, class properties, top-level variables, and anything referenced outside its immediate context
- If abbreviations are used in a module, document them in a brief comment at the top of the file

### Files

- Use `kebab-case` for file names; PascalCase for class names; camelCase for functions and variables

---

## Testing Philosophy

- Favor **integration tests** that exercise the API surface over unit tests on internal helper functions
- Tests should verify that endpoints return the correct response shape and status codes for given inputs
- Mock the database layer to keep tests fast and deterministic
- Do not test internal implementation details — if the interface contract is met, the internals can be refactored freely
