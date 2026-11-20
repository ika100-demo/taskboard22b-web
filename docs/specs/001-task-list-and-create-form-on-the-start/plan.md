---
spec_id: 001-task-list-and-create-form-on-the-start
shape: web-nextjs
spec_hash: ef71e1d437e2
summary: Start page lists tasks from the Task API and creates new ones through a server action, with the contract's error
  messages
tasks:
- id: t1
  title: Add the Task API client, title validation and messages in lib/tasks
  files: [lib/tasks/types.ts, lib/tasks/messages.ts, lib/tasks/validate.ts, lib/tasks/api.ts, docs/env-vars.md]
  covers: [AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7]
  parallel_safe: true
  depends_on: []
  done: true
- id: t3
  title: Add the create form, server action and client-side task board
  files: [app/actions.ts, app/_components/create-task-form.tsx, app/_components/task-board.tsx, app/page.tsx, app/globals.css,
    e2e/smoke.spec.ts, app/_components/task-list.tsx, tests/page.test.tsx, e2e/home.spec.ts]
  covers: [AC-001.2, AC-001.3, AC-001.4, AC-001.6, AC-001.7, AC-001.1, AC-001.5]
  parallel_safe: true
  depends_on: [t1]
  done: true
---

# Plan — 001 Task list and create form on the start page

See [design.md](design.md) for the binding interfaces (`lib/tasks`, `createTaskAction`, the DOM the tests query). `TASK_API_URL` is provided by the system's gitops entry, so there is no gitops task. No `contract/` copy exists, so `tests/contract/adapter.ts` stays as it is.

## t1 — Add the Task API client, title validation and messages in lib/tasks

**Files:** lib/tasks/types.ts, lib/tasks/messages.ts, lib/tasks/validate.ts, lib/tasks/api.ts, docs/env-vars.md
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7
**Goal:** One server-side module turns every Task API answer into the small result unions from design.md. It also provides the shared title rule and the user-visible strings, so the page and the action contain no HTTP or error-mapping logic.

**Implementation notes:**
- Types and message constants exactly as in design.md "lib/tasks".
- `validateTitle`: trim, then accept a length of 1 to 200. It has no Node or server imports, because the client form imports it.
- `api.ts`: read `process.env.TASK_API_URL` on each call and strip a trailing `/`. If it is unset or empty, return `{ ok: false }` / `failed` without fetching.
- Both calls use `cache: "no-store"` and `signal: AbortSignal.timeout(5000)`. Reading the body counts against the same signal. No retry.
- `listTasks`: only `200` with a well-formed array gives `ok: true`, in the order received. Everything else, including thrown errors, gives `ok: false`.
- `createTask`: send `JSON.stringify({ title, due_date })`. Map `201` → `created`, `422` naming `title` (last element of `loc`) → `invalid-title`, `507` → `limit`, and everything else → `failed`.
- Log each failure once through `@/lib/logger` (`warn`, fields `op`, `status`/`error`), never with the title.
- `docs/env-vars.md`: add a "Task API" section with `TASK_API_URL` (no default; e.g. `http://taskboard22b-api`; server-only, never `NEXT_PUBLIC_`).

**Done when:** `devbox run quality` is clean. Unit-level acceptance tests for the mapping and the title rule pass if the testers wrote them against `lib/tasks`. The page-level tests for AC-001.1 to AC-001.7 still wait for t2 and t3.

## t3 — Add the create form, server action and client-side task board

**Files:** app/actions.ts, app/_components/create-task-form.tsx, app/_components/task-board.tsx, app/page.tsx, app/globals.css, e2e/smoke.spec.ts, app/_components/task-list.tsx, tests/page.test.tsx, e2e/home.spec.ts
**Covers:** AC-001.2, AC-001.3, AC-001.4, AC-001.6, AC-001.7, AC-001.1, AC-001.5
**Goal:** The user creates a task from the start page. A valid task is posted on the server and appended to the list without a reload, and the form is emptied. An invalid title, an unavailable Task API or the 10,000 limit each show the spec's message and keep the entered values.

**Implementation notes:**
- `app/actions.ts`: `"use server"` `createTaskAction` exactly as in design.md. It validates again, turns `""` into `due_date` `null`, and maps the `CreateResult` to the outcome.
- `task-board.tsx` (`"use client"`): `initialTasks: Task[] | null`, `useState`, renders the form and (when not `null`) `TaskList`, and appends on `onCreated`.
- `create-task-form.tsx` (`"use client"`): controlled inputs, `noValidate`, no `required`/`maxLength`, and the `onSubmit` + `startTransition` flow from design.md. Show the title error next to the input (`aria-describedby`) and the form error as `role="alert"`. Clear the inputs only on `created`. Disable the button while pending. A thrown error shows SAVE_FAILED.
- `app/page.tsx`: render `<TaskBoard initialTasks={tasks} />` on success. On load failure render the `LOAD_FAILED` alert plus `<TaskBoard initialTasks={null} />`.
- `app/globals.css`: form and error styles.
- `e2e/smoke.spec.ts`: add one `@smoke @writes` test. It creates `smoke-<uuid>` with a due date and expects it in the list after submit, with no reload.

**Done when:** the acceptance tests for AC-001.2, AC-001.3, AC-001.4, AC-001.6 and AC-001.7 pass, the AC-001.1 and AC-001.5 tests still pass, and `devbox run test` (coverage ≥ 80%) and `devbox run quality` are clean.

**Merged from t2 — Replace the template start page with the task list and its load error** (acceptance tests (tasks-api import of app/actions, form on load failure) need the create form of t3; t2 alone cannot go green):

**Files:** app/page.tsx, app/_components/task-list.tsx, app/globals.css, tests/page.test.tsx, e2e/home.spec.ts, e2e/smoke.spec.ts
**Covers:** AC-001.1, AC-001.5
**Goal:** `/` becomes the task page. It loads the list on the server, shows the tasks oldest first with their due date or "No due date", shows "No tasks yet" for `[]`, and shows the load error message in place of the list when the Task API is down.

**Implementation notes:**
- `app/page.tsx`: `export const dynamic = "force-dynamic"`, `async function HomePage()`, one `<h1>Tasks</h1>`. Call `listTasks()`. On failure render `<p role="alert">{LOAD_FAILED}</p>`, otherwise `<TaskList tasks={...} />`. Remove the template hero, feature cards and get-started sections.
- `app/_components/task-list.tsx`: a pure component with the DOM from design.md (`<ul aria-label="Tasks">`, `<time dateTime>`, the "No due date" and "No tasks yet" texts).
- If `feature-card.tsx` and the icons are now unused, leave them; deleting them is not required.
- `app/globals.css`: minimal styles for the list, reusing the existing tokens.
- `tests/page.test.tsx` (template test, not an acceptance test): replace its template assertions. Keep at least the single-`h1` check, rendering `await HomePage()` with `fetch` mocked.
- `e2e/home.spec.ts`: replace the heading/"Check health" assertions with `h1` "Tasks" plus the existing landmark, 404 and phone-layout checks. Locally, no Task API runs, so the page shows the load error. Assert the heading only.
- `e2e/smoke.spec.ts`: keep the read-only check and tighten it to `h1` "Tasks" plus either the task list, "No tasks yet" or the load error being visible.

**Done when:** the acceptance tests for AC-001.1 and AC-001.5 pass, `devbox run test` keeps 80% coverage, and `devbox run quality` is clean.

