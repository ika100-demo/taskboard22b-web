# Verification — 001 Task list and create form on the start page

**Commit:** 1bee415 · **Base:** 82a6535 · **Trace:** 7/7 criteria named by tests

| Criterion | Verdict | Tests | Implementation | Notes |
|---|---|---|---|---|
| AC-001.1 | met | `tests/tasks-list.test.tsx::AC-001.1 lists every returned task in the returned order with title and due date or 'No due date'`, `::AC-001.1 shows 'No tasks yet' and no list for an empty array` | `lib/tasks/api.ts:34-57`, `app/_components/task-list.tsx:7-18`, `app/page.tsx:14` | the fixture is not alphabetical, so the test proves the API's order is kept; it checks the date text and "No due date" on each item and "No tasks yet" with no `<ul>` |
| AC-001.2 | met | `tests/tasks-create.test.tsx::AC-001.2 posts title and date, appends the created task at the end and empties the form`, `tests/tasks-api.test.ts::AC-001.2 posts the trimmed title and date and returns the created task` | `app/_components/create-task-form.tsx:29-35`, `app/_components/task-board.tsx:16`, `app/actions.ts:17-23`, `lib/tasks/api.ts:72-85` | checks the decoded body `{title:"Buy milk", due_date:"2026-12-24"}`, the URL built from `TASK_API_URL` (with its trailing `/` removed), the new item at index 1 after the existing one, both inputs `""`, and exactly one POST with no reload |
| AC-001.3 | met | `tests/tasks-create.test.tsx::AC-001.3 sends due_date null without a date and shows 'No due date' for the new task`, `tests/tasks-api.test.ts::AC-001.3 sends due_date null for an empty date` | `app/actions.ts:19`, `app/_components/task-list.tsx:15` | |
| AC-001.4 | met | `tests/tasks-create.test.tsx::AC-001.4 shows the title message, keeps values and sends nothing …` (empty, whitespace, 201, 201 after trimming), `::AC-001.4 sends a title of %s trimmed` (1, 200, 200 after trimming), `::AC-001.4 shows the title message next to the field when the API answers 422 naming title`, `tests/tasks-api.test.ts::AC-001.4 *` | `lib/tasks/validate.ts:6-10`, `app/_components/create-task-form.tsx:23-27,36-37,57-63`, `app/actions.ts:17-18,24-25`, `lib/tasks/api.ts:89-100` | "next to the field" is checked through `aria-describedby` (accessible description) and `aria-invalid`; no POST is checked with `posts()` length 0 |
| AC-001.5 | met | `tests/tasks-list.test.tsx::AC-001.5 shows the load error instead of the list when the API is %s` (unreachable, timeout, 503, 500, 404, non-array), `::AC-001.5 gives the GET a 5 second abort signal`, `::AC-001.5 shows the load error and no list when the GET only ends through its abort signal` | `lib/tasks/api.ts:4,41-61`, `app/page.tsx:13-14`, `app/_components/task-board.tsx:17` | the tests check that neither the list nor "No tasks yet" is shown |
| AC-001.6 | met | `tests/tasks-create.test.tsx::AC-001.6 shows the save error, keeps values and the list when the API is %s` (unreachable, timeout, 503, 500, 422 for another field), `::AC-001.6 gives the POST a 5 second abort signal …`, `::AC-001.6 can save from the form when the list could not be loaded`, `tests/tasks-api.test.ts::AC-001.6 *` | `lib/tasks/api.ts:71-78,102-109`, `app/actions.ts:28-29`, `app/_components/create-task-form.tsx:38-43,79-83` | checks the values are kept, the list still has 1 item, and exactly one POST (no retry) |
| AC-001.7 | met | `tests/tasks-create.test.tsx::AC-001.7 shows the limit message, keeps values and the list when the API answers 507`, `tests/tasks-api.test.ts::AC-001.7 maps 507 to the limit message` | `lib/tasks/api.ts:79-81`, `app/actions.ts:26-27`, `app/_components/create-task-form.tsx:38-39` | |

## Non-goals

The spec lists no non-goals. Template-owned layout is unchanged: `app/layout.tsx`, the header and the footer are not in the diff, and the `e2e/home.spec.ts` banner, main and contentinfo assertions are kept. The template's start-page content (hero, feature cards, "Check health" link) was replaced as the plan says (t2 notes). ✔

## Deviations from the plan

- `tests/tasks-api.test.ts`, `tests/tasks-create.test.tsx`, `tests/tasks-list.test.tsx` are in no task's `files`. They are the acceptance tests the tester wrote before the code (commit 691116c, reviewed in 9178b5a). Acceptable.
- `docs/backlog.md` is in no task's `files`. `cplat spec index` generated the row. Acceptable. The row shows the status `approved` while `spec.md` says `building`; the next index run fixes it.
- `app/_components/feature-card.tsx` and `app/_components/icons.tsx` were deleted. The t2 notes said to leave them ("deleting them is not required"). They were unused, and keeping them blocked the 80% function-coverage threshold. Acceptable.
- t2 was merged into t3 with a recorded reason (plan.md). Both remaining tasks have `done: true`. Acceptable.

## Contract

Matches `design.md`:
- The request shape is the same for GET and POST (`cache: "no-store"`, headers, `AbortSignal.timeout(5000)`, body `{title, due_date}`).
- The answer-to-result mapping follows the design table, including a 422 naming another field and a 201 with a malformed body → `failed`.
- The `CreateTaskOutcome` union and the DOM roles and labels match the design.
- `TASK_API_URL` is read on each call, and a trailing `/` is stripped.

No `contract/` copy exists, so the contract test has nothing to check. ✔

## Smoke

- `e2e/smoke.spec.ts` — the read-only check `the root page loads at the base URL @smoke` accepts any `getByRole("alert")`. That also matches alerts the feature does not render (for example Next.js's route announcer, `role="alert"`). With the `h1` alone it can pass without the list, "No tasks yet" or the load-error text. Narrow it to `getByText("Tasks cannot be loaded right now. Please try again later.")`. This test is outside the trace and has no effect on any verdict.

**Result:** pass

## Mutation check (report only)

Skipped: no mutation check for shape web-nextjs yet.
