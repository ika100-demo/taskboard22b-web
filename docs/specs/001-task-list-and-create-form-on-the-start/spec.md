---
spec_id: 001-task-list-and-create-form-on-the-start
title: Task list and create form on the start page
status: approved
priority: P1
shape: web-nextjs
parent: ika100-demo/taskboard22b-gitops:001-persistent-tasks-in-postgres-with-a-web
---

# 001 — Task list and create form on the start page

## Problem

The Task API of taskboard22b holds tasks in memory only: every restart or redeploy empties the list, and a second instance would show a different list. People can only reach tasks by calling the API directly, because the web UI has no task features yet. So the taskboard cannot be used for real work today. Keeping tasks in a Postgres database and offering a page to see and create them makes the system usable end to end.

## System context

Slice of the system plan `001-persistent-tasks-in-postgres-with-a-web` in `ika100-demo/taskboard22b-gitops` for `taskboard22b-web` (web-nextjs). The system criteria and the contract below are binding: every criterion of this spec implements one of them and names it: `(system AC-<NNN>.<n>)`.

### System criteria

- **AC-001.3** Given tasks exist, when a user opens the web UI's start page `/`, then the page lists every task returned by `GET /tasks`, oldest first, each showing its title and its due date as `YYYY-MM-DD` or the text "No due date" when it has none; given no tasks exist, the page shows the text "No tasks yet".
- **AC-001.4** Given the start page is open, when the user enters the title "Buy milk", picks the due date 2026-12-24 and submits the create form, then the task "Buy milk" with due date `2026-12-24` appears in the page's list without the user reloading, the form is emptied, and `GET /tasks` on the Task API contains that task.
- **AC-001.5** Given the start page is open, when the user submits the create form with an empty title, a title of only whitespace, or a title longer than 200 characters after trimming, then the page shows the message "Title must be 1 to 200 characters" next to the title field, keeps the entered values, and no task is created.
- **AC-001.7** Given the Task API is unreachable or answers `503`, when a user opens the start page, then the page shows the message "Tasks cannot be loaded right now. Please try again later." instead of the list; and when the user submits the create form, the page shows "The task could not be saved. Please try again." and keeps the entered values.
- **AC-001.8** Given 10,000 tasks exist, when the user submits a valid task in the web UI, then the page shows "The task limit of 10,000 is reached." and keeps the entered values, and the Task API answers the underlying `POST /tasks` with `507` as before.

### Contract

The Task API contract of `taskboard22b-api` spec 001 (its `design.md`) stays as it is (A1); this plan adds the `503` answers and the `/ready` behaviour. Base URL for the web UI: the env var `TASK_API_URL` (`http://taskboard22b-api` in the cluster). No authentication on any endpoint (A10).

**Task object**

```json
{"id": "3f2b8c1e-…", "title": "Buy milk", "due_date": "2026-12-24", "created_at": "2026-11-20T10:15:30.123456Z"}
```

| Field | Type | Rule |
|---|---|---|
| `id` | string | server-assigned UUID, opaque; stays the same across restarts |
| `title` | string | stored trimmed, 1 to 200 characters after trimming |
| `due_date` | string `YYYY-MM-DD` or `null` | calendar date, past dates allowed |
| `created_at` | string | ISO 8601 UTC with `Z`, set by the server at creation, unchanged across restarts |

**`GET /tasks`** — no query parameters.

| Status | When | Body |
|---|---|---|
| `200` | database reachable | JSON array of task objects, oldest first, unpaged; `[]` when none |
| `503` | database unreachable or the query did not finish in time | `{"detail": "Tasks are temporarily unavailable"}` |

**`POST /tasks`** — body `application/json` `{"title": string, "due_date"?: string | null}`; unknown fields ignored. The web UI always sends both fields, `title` trimmed, `due_date` `null` when none was picked.

| Status | When | Body |
|---|---|---|
| `201` | valid input, fewer than 10,000 tasks stored | the task object |
| `422` | invalid `title` or `due_date` (unchanged) | FastAPI standard validation body, see Errors |
| `503` | database unreachable or the statement did not finish in time; nothing stored | `{"detail": "Tasks are temporarily unavailable"}` |
| `507` | 10,000 tasks already stored; nothing stored | `{"detail": "Task limit of 10000 reached"}` |

**`GET /ready`** — `200` `{"status": "ready"}` when a `SELECT 1` on the database succeeds; `503` `{"status": "not ready"}` otherwise. **`GET /health`** stays `200` regardless of the database, so the database being down never restarts the pod.

No events.

### Rules

No shared rules: the one shared input rule (title 1 to 200 characters after trimming, A5) cannot be checked by the rule engine, which needs a rejection body carrying the rule id, while the spec keeps the Task API's FastAPI `422` body unchanged (A1, non-goals); both repos test the rule through their own criteria instead.

The rule in words, identical in both repos: `title` is required, is trimmed of leading and trailing whitespace, and must then be 1 to 200 characters long (200 accepted, 201 rejected, empty and whitespace-only rejected). `due_date` is a real calendar date `YYYY-MM-DD` or `null`; the web UI enforces it by its date field.

### Errors

```yaml
errors:
  status: 422
  body:
    list: detail
    field: loc
    rule: type
    message: msg
  unlisted:
    message: "The task could not be saved. Please try again."
```

The `422` body is FastAPI's: `{"detail": [{"type": str, "loc": ["body", "<field>"], "msg": str, ...}]}`; the field is the last element of `loc` (`title` or `due_date`). `503` and `507` carry a single `{"detail": "<text>"}` object. How the web UI treats each answer:

| Call | Answer | Page shows |
|---|---|---|
| `GET /tasks` | `200` | the list, or "No tasks yet" for `[]` |
| `GET /tasks` | `503`, any other status, a body that is not an array, connection error, timeout | "Tasks cannot be loaded right now. Please try again later." instead of the list |
| `POST /tasks` | `201` | the returned task appended to the list, form emptied |
| `POST /tasks` | `422` naming `title` | "Title must be 1 to 200 characters" next to the title field, values kept |
| `POST /tasks` | `507` | "The task limit of 10,000 is reached.", values kept |
| `POST /tasks` | `503`, `422` naming anything else, any other status, connection error, timeout | "The task could not be saved. Please try again.", values kept |

### Timeouts

- **Web UI → Task API**, `GET /tasks` and `POST /tasks`: 5 seconds per call (connect plus response), from the Next.js server. No automatic retry (a retried `POST` could create a task twice); the user retries by reloading or submitting again. Down or slow: treated as unavailable, see Errors.
- **Task API → Postgres**: connect timeout 2 seconds, statement timeout 3 seconds, so the Task API answers `503` within 6 seconds when the database is down or slow, before the web UI's 5-second timeout in the usual case of a refused connection. The connection pool drops broken connections and reconnects on the next request, so the Task API recovers with no restart (A7).
- **`GET /ready`**: the database check gives up after 1 second and answers `503`; Kubernetes then removes the instance from the Service until the check succeeds again, and `/health` keeps the pod alive.

### Provided by the system

The gitops part of this plan wires these for this repo; rely on them, do not ask for them again:

- env `TASK_API_URL=http://taskboard22b-api`

### Notes for this repo

The Task API is called from the Next.js server (server component for the list, a server action or route handler for create), never from the browser, so TASK_API_URL can stay cluster-internal and no CORS is needed.
The page text is English; the start page `/` is the task page.

## Stories

<!-- As a <persona>, I want <goal>, so that <benefit>. -->

## Acceptance criteria

- **AC-001.1** Given the Task API's `GET /tasks` returns tasks, when a user opens the start page `/`, then the page lists every returned task in the order the Task API returned it (oldest first), each showing its `title` and its `due_date` as `YYYY-MM-DD`, or the text "No due date" when `due_date` is `null`; given `GET /tasks` returns `[]`, the page shows the text "No tasks yet" (system AC-001.3)
- **AC-001.2** Given the start page is open, when the user enters the title "Buy milk", picks the due date 2026-12-24 in the date field and submits the create form, then the web sends `POST /tasks` with `{"title": "Buy milk", "due_date": "2026-12-24"}` to the Task API at `TASK_API_URL`, and on `201` the returned task appears at the end of the list without a page reload and the form is emptied (system AC-001.4)
- **AC-001.3** Given the start page is open, when the user submits a valid title without picking a due date, then the web sends `due_date` `null` and on `201` the new task appears in the list with the text "No due date" (system AC-001.4, AC-001.3)
- **AC-001.4** Given the start page is open, when the user submits the create form with an empty title, a title of only whitespace, or a title longer than 200 characters after trimming, then the page shows "Title must be 1 to 200 characters" next to the title field, keeps the entered values and sends no `POST /tasks`; a title of 1 or 200 characters after trimming is sent trimmed, and a `422` from the Task API naming `title` shows the same message (system AC-001.5)
- **AC-001.5** Given the Task API is unreachable, does not answer `GET /tasks` within 5 seconds, or answers `503` or any status the contract does not list, when a user opens the start page, then the page shows "Tasks cannot be loaded right now. Please try again later." instead of the list (system AC-001.7)
- **AC-001.6** Given the start page is open, when the user submits a valid task and the Task API is unreachable, does not answer within 5 seconds, or answers `503` or any status the contract does not list, then the page shows "The task could not be saved. Please try again.", keeps the entered values and leaves the list unchanged (system AC-001.7)
- **AC-001.7** Given the start page is open, when the user submits a valid task and the Task API answers `POST /tasks` with `507`, then the page shows "The task limit of 10,000 is reached.", keeps the entered values and leaves the list unchanged (system AC-001.8)

## Non-goals

## Assumptions

<!-- Spec 149: decisions taken by default, approved with the spec. One bullet each: - **A1** <the decision> (other option: <…>; affects AC-…). A revised one is struck through (~~…~~), never deleted. -->

## Open questions

<!-- Only what may not be decided by default (spec 149): security or access, money, destroying or migrating data, or a request too ambiguous to build. Approval is refused while any is open. Strike answered ones (~~…~~) and fold the answer into the criteria. -->

<!-- Priority levels (spec 196) for the product-manager's PRIORITY line: P0 an outage, data loss, a security problem, or something that blocks all other work; P1 a normal bug or feature; the fallback when nothing signals urgency; P2 cosmetic, a convenience, or something with an easy workaround. A reason is "P<n>: <phrase>", one of: P0: outage, data loss, security problem, blocks all other work; P1: normal bug or feature; P2: cosmetic, convenience, easy workaround. -->

## Changelog

- 2026-11-20 created from the system plan, with its criteria (spec 147)
- 2026-11-20 approved
