# Frontend Architecture & Code Standards

**MANDATORY**: All frontend code and code analysis must adhere to these standards. These represent our team's established patterns for React applications.

---

## Data Fetching

### Background Polling

- Use **interval-based polling** (e.g., every 30 seconds) to keep displayed data reasonably current without requiring explicit refresh actions from the user
- Configure polling in `useEffect` with proper cleanup via `clearInterval` on unmount
- Polling provides a good balance of freshness and simplicity without the operational overhead of WebSockets

### Fetch-on-Mount Pattern

- Load data when a component mounts, then let the polling interval handle subsequent updates
- **Do not re-fetch immediately before a user-initiated mutation** (e.g., before confirming a settlement). Adding a fetch-before-action introduces a loading spinner at the exact moment the user is trying to act, which disrupts the interaction flow. The backend recalculates independently from the database at execution time, so the server-side result is always authoritative regardless of what the frontend last fetched. Trust the backend.

---

## State Management

### Component-Level State

- Use `useState` for data fetched from APIs — component-level state is sufficient for feature-scoped views and avoids the accidental complexity of global state libraries
- Use `useCallback` for handlers and functions passed to effects or child components to maintain referential stability
- Use `useRef` for values that need to persist across renders without triggering re-renders (e.g., interval IDs)

### Post-Mutation State Updates

- After a successful write operation, **immediately update local state** to reflect the result (e.g., clear the worklogs array after settlement completes). This gives users instant visual feedback without waiting for the next polling cycle or performing an additional fetch.
- The pattern is: call mutation → on success, clear/update local state → display result

### Derived Values

- Compute derived state (totals, filtered subsets, formatted values) **inline** in the render path or hook body, rather than storing them in additional `useState` variables. Inline derivation eliminates an entire class of bugs where a derived value falls out of sync with its source data.
- Avoid premature `useMemo`. Only introduce memoization when profiling shows a measurable performance problem. For small to medium data sets (under a few hundred items), the cost of recomputation is negligible.

---

## UI Patterns

### Contextual Action Labels

- Embed computed values directly in action button labels (e.g., `Confirm Settlement — $1,250.00`). This gives users a clear preview of the operation's effect and builds confidence before they commit. Vague labels like "Confirm" force the user to scan the page for context.

### Success Screens

- After a mutation succeeds, **display the server-confirmed values** (from the response payload) rather than locally computed previews. The server is the authoritative source, and its response reflects what actually happened.
- It is normal and expected for the success screen total to differ from the preview total. Data can change between the time the preview was rendered and the time the backend processes the operation. This is not a bug — it is a natural consequence of asynchronous data. The server result is always correct.

### Error Handling

- Display a **persistent error banner** at the top of the relevant section when an async operation fails
- Use generic, user-friendly messages (`"Settlement failed. Please try again."`) — do not expose technical details
- Clear the error state when the user initiates the next action, so stale errors don't linger

### Loading & Interaction Guards

- Track async states with boolean flags (`isLoading`, `isSettling`)
- **Disable action buttons** during in-flight operations to prevent double-submission
- Replace the button label with a progress indicator (`"Processing..."`) during mutations

---

## Component Architecture

### Feature-Scoped Components

- Build components around **specific features or workflows** (e.g., `SettlementReview`) rather than creating generic, reusable abstractions. Feature-scoped components are easier to reason about and modify without risking side effects in unrelated parts of the app.
- When a component's data-fetching and state logic grows complex, extract it into a co-located custom hook (e.g., `useSettlement`) to keep the component focused on rendering.

### Props Design

- Define explicit TypeScript `interface`s for all component props
- Keep prop surfaces small — prefer passing an ID and letting the component fetch its own data over threading large objects through multiple layers

---

## Type Safety

### API Contracts

- Define **explicit TypeScript interfaces** for every API request and response shape in the API client module
- Use **union literal types** for status fields (e.g., `"OPEN" | "SETTLED"`) rather than plain `string`
- The API client module is the single source of truth for all request/response types — components should import from there, not define ad-hoc types

---

## Formatting & Display

### Currency

- Format monetary values with `toFixed(2)` and a `$` prefix at the display layer
- Apply a conditional CSS class for negative amounts (e.g., `amount-negative`) to provide clear visual distinction

### Dates

- Use `toLocaleDateString()` for rendering dates in the user's locale
- Store and transmit all timestamps as ISO 8601 strings
