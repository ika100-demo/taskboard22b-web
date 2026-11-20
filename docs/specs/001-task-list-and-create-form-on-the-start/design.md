# Design — 001 Task list and create form on the start page

## Decisions

- All Task API calls happen on the Next.js server: the list in the async server component `app/page.tsx`, the create in a server action. The browser never sees `TASK_API_URL` (system note for this repo); no CORS, no `NEXT_PUBLIC_*`.
- One typed client module `lib/tasks/api.ts` maps every Task API answer to a small result union. The page and the action only branch on that union, so the error table of the system contract lives in one place (AC-001.5, AC-001.6, AC-001.7).
- Each call has a 5-second budget via `AbortSignal.timeout(5000)` covering connect, headers and body. There is no retry, because a retried `POST` could create a task twice (system Timeouts).
- The create form calls the server action directly from its `onSubmit` handler inside `startTransition`. It does not use `<form action>`/`useActionState`: React resets a form after a form action, but the spec says entered values stay on every error (AC-001.4, AC-001.6, AC-001.7). Inputs are controlled, and the form clears them only on `created`.
- The title rule is checked in the browser before the action is called, so an invalid title sends no `POST /tasks` (AC-001.4). The action checks it again, so the server never sends an invalid title. Both use the same function, `lib/tasks/validate.ts`. The form sets `noValidate`, and the title input has no `required` or `maxLength`, so the browser's own validation never hides the spec's message and a 201+ character title can be entered.
- After `created` the new task is appended to client state (`TaskBoard`). There is no `router.refresh()` and no revalidation, so the list updates without a reload and without a second `GET /tasks` (AC-001.2, AC-001.3).
- `/api/ready` stays dependency-free. If the web turned unready while the Task API is down, Kubernetes would take the page out of the Service, and the user would never see "Tasks cannot be loaded right now…" (AC-001.5).
- No contract copy exists in `contract/` (the system plan has no shared rules), so `tests/contract.test.ts` checks nothing and `tests/contract/adapter.ts` stays unwired.
- No ADR: every choice here is local to this feature.

## Modules

| Module | Responsibility | New / changed |
|---|---|---|
| `lib/tasks/types.ts` | `Task`, `NewTask`, result unions | new |
| `lib/tasks/messages.ts` | the user-visible strings, exported as constants | new |
| `lib/tasks/validate.ts` | `validateTitle` (trim, 1 to 200) | new |
| `lib/tasks/api.ts` | `listTasks`, `createTask` against `TASK_API_URL` (server only) | new |
| `app/page.tsx` | async server component: loads the list, renders board or load error | changed (template content replaced) |
| `app/_components/task-list.tsx` | renders tasks / "No tasks yet" (no state) | new |
| `app/actions.ts` | `"use server"` `createTaskAction` | new |
| `app/_components/task-board.tsx` | `"use client"`: holds the task array, renders list + form | new |
| `app/_components/create-task-form.tsx` | `"use client"`: controlled form, client validation, calls action | new |
| `docs/env-vars.md` | documents `TASK_API_URL` | changed |

## Contract

### Upstream (Task API, consumed; binding from the system plan)

`GET ${TASK_API_URL}/tasks` and `POST ${TASK_API_URL}/tasks` exactly as in spec.md "Contract". `TASK_API_URL` is read from `process.env` on each call, not at module load, so tests can set it per test. A trailing `/` is stripped. If the variable is unset or empty, the call counts as unavailable: it is logged and nothing is fetched.

Request details the tests may assert:

- `GET`: `fetch(`${base}/tasks`, { method: "GET", cache: "no-store", headers: { accept: "application/json" }, signal })`.
- `POST`: `fetch(`${base}/tasks`, { method: "POST", cache: "no-store", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ title, due_date }), signal })`. `title` is trimmed. `due_date` is `"YYYY-MM-DD"`, or `null` when no date was picked (AC-001.2, AC-001.3). Always both keys, in that order.

### `lib/tasks` (internal interface)

```ts
// types.ts
export interface Task { id: string; title: string; due_date: string | null; created_at: string }
export interface NewTask { title: string; due_date: string | null }
export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateResult =
  | { kind: "created"; task: Task }
  | { kind: "invalid-title" }   // 422 whose detail[] has an item with loc's last element "title"
  | { kind: "limit" }           // 507
  | { kind: "failed" };         // everything else

// messages.ts
export const TITLE_INVALID = "Title must be 1 to 200 characters";
export const LOAD_FAILED   = "Tasks cannot be loaded right now. Please try again later.";
export const SAVE_FAILED   = "The task could not be saved. Please try again.";
export const LIMIT_REACHED = "The task limit of 10,000 is reached.";
export const NO_TASKS      = "No tasks yet";
export const NO_DUE_DATE   = "No due date";

// validate.ts  (no server-only imports: used by the client form too)
export function validateTitle(raw: string): { ok: true; title: string } | { ok: false; message: typeof TITLE_INVALID };
//   t = raw.trim(); ok iff 1 <= t.length <= 200 (UTF-16 length, as the API counts Python str length for BMP text)

// api.ts  (import "server-only" is not added: no new dependency; the module is only imported by app/page.tsx and app/actions.ts)
export async function listTasks(): Promise<ListResult>;
export async function createTask(input: NewTask): Promise<CreateResult>;
```

How answers are mapped (spec "Errors" table):

| Call | Answer | Result |
|---|---|---|
| `listTasks` | `200` with a JSON array whose items each have string `id`, string `title`, `due_date` string or null | `{ ok: true, tasks }` in the order received |
| `listTasks` | any other status, non-array or malformed body, JSON parse error, network error, timeout, unset `TASK_API_URL` | `{ ok: false }` |
| `createTask` | `201` with a task object | `created` |
| `createTask` | `422`, `detail` an array, some item with `Array.isArray(loc) && loc.at(-1) === "title"` | `invalid-title` |
| `createTask` | `507` | `limit` |
| `createTask` | anything else (incl. `503`, `422` naming another field, `201` with a malformed body, network error, timeout) | `failed` |

Every non-success result is logged once with `logger.warn("task api call failed", { op: "list"|"create", status?: number, error?: string })`. The title is never logged.

### Server action

```ts
// app/actions.ts
"use server";
export type CreateTaskOutcome =
  | { kind: "created"; task: Task }
  | { kind: "error"; field: "title"; message: string }   // TITLE_INVALID
  | { kind: "error"; field: "form"; message: string };   // SAVE_FAILED | LIMIT_REACHED
export async function createTaskAction(input: { title: string; due_date: string }): Promise<CreateTaskOutcome>;
//   v = validateTitle(input.title); if !v.ok -> {error, title, TITLE_INVALID} (no fetch)
//   r = await createTask({ title: v.title, due_date: input.due_date === "" ? null : input.due_date })
//   created -> created; invalid-title -> title error; limit -> form LIMIT_REACHED; failed -> form SAVE_FAILED
```

### Page and components (what the tests query)

- `app/page.tsx`: `export const dynamic = "force-dynamic"`, `export default async function HomePage()`. Tests render it with `render(await HomePage())` after mocking `global.fetch` and setting `process.env.TASK_API_URL`. It renders one `<h1>Tasks</h1>`. Below it:
  - when `listTasks` fails: `<p role="alert">{LOAD_FAILED}</p>` and no list (AC-001.5). The create form is still shown, so the AC-001.6 path stays reachable.
  - otherwise: `<TaskBoard initialTasks={tasks} />`.
- `TaskList({ tasks })`: with tasks, `<ul aria-label="Tasks">`, one `<li>` per task in the order given, containing the title and either `<time dateTime={due_date}>{due_date}</time>` or the text `No due date` (AC-001.1). With `[]`, `<p>No tasks yet</p>` and no `<ul>`.
- `TaskBoard({ initialTasks })`: `useState(initialTasks)`. Renders `<CreateTaskForm onCreated={(t) => setTasks((ts) => [...ts, t])} />` and `<TaskList tasks={tasks} />`. When the page load failed, it renders the form only (`TaskBoard` takes `initialTasks: Task[] | null`; `null` means render the form without a list, and a later `created` does not invent a list).
- `CreateTaskForm({ onCreated })`: `<form aria-label="New task" noValidate onSubmit>` containing:
  - `<label for="task-title">Title</label><input id="task-title" name="title" type="text">`. When there is a title error: `aria-invalid="true"`, `aria-describedby="task-title-error"`, and `<p id="task-title-error">{message}</p>` directly after the input.
  - `<label for="task-due-date">Due date</label><input id="task-due-date" name="due_date" type="date">`.
  - `<button type="submit">Add task</button>`, disabled while the action is pending.
  - form-level error: `<p role="alert">{message}</p>` inside the form.
  - On submit: `preventDefault`. Run `validateTitle`. If it fails, show TITLE_INVALID and do not call the action. Otherwise clear the errors and `startTransition(async () => { const o = await createTaskAction({ title, due_date }); ... })`. On `created`, call `onCreated(o.task)` and reset both inputs to `""`. On `error`, show the message at its field and keep the values. Any thrown error (for example, the action transport fails) shows SAVE_FAILED.

## Data

None in this repo. New env var `TASK_API_URL` (no default; the system's gitops entry sets `http://taskboard22b-api`).
