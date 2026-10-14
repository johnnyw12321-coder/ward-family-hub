# Household assistant — design (not implemented)

No AI service is integrated and no household data is sent anywhere. This
document records how an assistant should be added later so it respects the
security model.

## Principles

1. **The assistant never gets database access.** It calls a small set of typed,
   read-only *tools* implemented as Server-side functions that use the same
   `HouseholdContext` and RLS as the rest of the app.
2. **Aggregates, not rows.** Tools return totals, counts and short lists of
   names/amounts needed for the answer — never account numbers, notes,
   documents, medical or children's details.
3. **Explicit opt-in per household**, a clear indicator when the assistant is
   used, and a log of questions (not answers) in `audit_logs`.
4. **No writes** in the first version. Later write tools (e.g. "add a task")
   must go through the existing Server Actions and require confirmation.
5. Model calls are made from the server; the API key lives in a server-only
   environment variable.

## Tools mapped to the example questions

| Question | Tool | Backed by |
| --- | --- | --- |
| How much did we spend on groceries last month? | `spendingByCategory(from, to, categoryName?)` | `report_category_totals` |
| Which expenses increased compared with last year? | `categoryComparison(period)` | `loadReport` |
| How much can we safely spend before payday? | `safeToSpend(untilDate)` | available cash − bills due before the next expected income (`recurring_items`) − remaining budget commitments |
| Are we on track for the emergency fund? | `goalStatus(name)` | `goalProgress` + `goalProjection` |
| What major payments are due next month? | `upcomingBills(from, to, minAmount?)` | `expandBills` |
| How much did our vehicle cost this year? | `assetCosts(assetName, period)` | asset-linked transactions (Phase 5) |

## Shape

```ts
// src/features/assistant/tools.ts (future)
type Tool<I, O> = { name: string; description: string; input: z.ZodType<I>; run: (ctx: HouseholdContext, input: I) => Promise<O> };
```

Each tool validates input with Zod, runs as the user, and returns a compact
JSON object. The chat route assembles tool definitions, calls the model with
tool use, executes requested tools server-side, and streams the answer.
