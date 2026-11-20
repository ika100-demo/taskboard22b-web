import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

const TITLE_INVALID = "Title must be 1 to 200 characters";
const SAVE_FAILED = "The task could not be saved. Please try again.";
const LIMIT_REACHED = "The task limit of 10,000 is reached.";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const task = (id: string, title: string, due_date: string | null) => ({
  id,
  title,
  due_date,
  created_at: "2026-11-20T10:15:30.123456Z",
});

const fetchMock = vi.fn();

// Calls the mock made with POST, with the body decoded.
function posts(): { url: string; init: RequestInit; body: unknown }[] {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([url, init]) => ({ url: String(url), init, body: JSON.parse(String(init.body)) }));
}

// Opens the page with the given existing tasks; the next fetch answers `next`.
async function openPage(existing = [task("1", "Existing", null)]) {
  fetchMock.mockResolvedValueOnce(json(200, existing));
  render(await HomePage());
}

const titleInput = () => screen.getByLabelText("Title") as HTMLInputElement;
const dateInput = () => screen.getByLabelText("Due date") as HTMLInputElement;
const form = () => screen.getByRole("form", { name: "New task" });
const items = () => within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");

function fill(title: string, date = "") {
  fireEvent.change(titleInput(), { target: { value: title } });
  if (date) fireEvent.change(dateInput(), { target: { value: date } });
}
const submit = () => fireEvent.click(within(form()).getByRole("button", { name: "Add task" }));

describe("create task form", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.TASK_API_URL = "http://task-api.test/";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("AC-001.2 posts title and date, appends the created task at the end and empties the form", async () => {
    await openPage();
    fetchMock.mockResolvedValueOnce(json(201, task("2", "Buy milk", "2026-12-24")));
    fill("Buy milk", "2026-12-24");
    submit();

    await waitFor(() => expect(items()).toHaveLength(2));
    expect(items()[0]).toHaveTextContent("Existing");
    expect(items()[1]).toHaveTextContent("Buy milk");
    expect(items()[1]).toHaveTextContent("2026-12-24");
    expect(titleInput().value).toBe("");
    expect(dateInput().value).toBe("");

    const sent = posts();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("http://task-api.test/tasks");
    expect(sent[0].body).toEqual({ title: "Buy milk", due_date: "2026-12-24" });
    expect((sent[0].init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(sent[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("AC-001.3 sends due_date null without a date and shows 'No due date' for the new task", async () => {
    await openPage([]);
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(json(201, task("2", "Call Bob", null)));
    fill("Call Bob");
    submit();

    await waitFor(() => expect(items()).toHaveLength(1));
    expect(items()[0]).toHaveTextContent("Call Bob");
    expect(items()[0]).toHaveTextContent("No due date");
    expect(posts()[0].body).toEqual({ title: "Call Bob", due_date: null });
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   \t "],
    ["201 characters", "a".repeat(201)],
    ["201 characters after trimming", `  ${"b".repeat(201)}  `],
  ])("AC-001.4 shows the title message, keeps values and sends nothing for a title that is %s", async (_n, value) => {
    await openPage();
    fill(value, "2026-12-24");
    submit();

    const input = titleInput();
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(within(form()).getByText(TITLE_INVALID)).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription(TITLE_INVALID);
    expect(input.value).toBe(value);
    expect(dateInput().value).toBe("2026-12-24");
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(posts()).toHaveLength(0);
    expect(items()).toHaveLength(1);
  });

  it.each([
    ["1 character", "x", "x"],
    ["200 characters", "y".repeat(200), "y".repeat(200)],
    ["200 characters after trimming", `  ${"z".repeat(200)} \n`, "z".repeat(200)],
  ])("AC-001.4 sends a title of %s trimmed", async (_n, value, expected) => {
    await openPage();
    fetchMock.mockResolvedValueOnce(json(201, task("2", expected, null)));
    fill(value);
    submit();

    await waitFor(() => expect(items()).toHaveLength(2));
    expect(posts()[0].body).toEqual({ title: expected, due_date: null });
    expect(screen.queryByText(TITLE_INVALID)).not.toBeInTheDocument();
  });

  it("AC-001.4 shows the title message next to the field when the API answers 422 naming title", async () => {
    await openPage();
    fetchMock.mockResolvedValueOnce(
      json(422, { detail: [{ type: "string_too_short", loc: ["body", "title"], msg: "too short" }] }),
    );
    fill("Valid title", "2026-12-24");
    submit();

    await waitFor(() => expect(titleInput()).toHaveAttribute("aria-invalid", "true"));
    expect(titleInput()).toHaveAccessibleDescription(TITLE_INVALID);
    expect(titleInput().value).toBe("Valid title");
    expect(dateInput().value).toBe("2026-12-24");
    expect(items()).toHaveLength(1);
  });

  const saveFailures: [string, () => void][] = [
    ["unreachable", () => fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))],
    ["timeout", () => fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))],
    ["503", () => fetchMock.mockResolvedValueOnce(json(503, { detail: "Tasks are temporarily unavailable" }))],
    ["unlisted status 500", () => fetchMock.mockResolvedValueOnce(json(500, { detail: "boom" }))],
    [
      "422 naming another field",
      () => fetchMock.mockResolvedValueOnce(json(422, { detail: [{ type: "date_parsing", loc: ["body", "due_date"], msg: "bad" }] })),
    ],
  ];

  it.each(saveFailures)("AC-001.6 shows the save error, keeps values and the list when the API is %s", async (_n, arrange) => {
    await openPage();
    arrange();
    fill("Buy milk", "2026-12-24");
    submit();

    const alert = await within(form()).findByRole("alert");
    expect(alert).toHaveTextContent(SAVE_FAILED);
    expect(titleInput().value).toBe("Buy milk");
    expect(dateInput().value).toBe("2026-12-24");
    expect(items()).toHaveLength(1);
    expect(screen.queryByText(TITLE_INVALID)).not.toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  it("AC-001.6 gives the POST a 5 second abort signal and shows the save error when it only ends through that signal, without retry", async () => {
    await openPage();
    const controller = new AbortController();
    const spy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    try {
      fetchMock.mockImplementationOnce(
        (_url: unknown, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError")));
          }),
      );
      fill("Buy milk", "2026-12-24");
      submit();

      await waitFor(() => expect(posts()).toHaveLength(1));
      expect(spy).toHaveBeenCalledWith(5000);
      expect(posts()[0].init.signal).toBe(controller.signal);
      controller.abort();

      const alert = await within(form()).findByRole("alert");
      expect(alert).toHaveTextContent(SAVE_FAILED);
      expect(titleInput().value).toBe("Buy milk");
      expect(dateInput().value).toBe("2026-12-24");
      expect(items()).toHaveLength(1);
      await act(() => new Promise((r) => setTimeout(r, 0)));
      expect(posts()).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("AC-001.6 can save from the form when the list could not be loaded", async () => {
    fetchMock.mockResolvedValueOnce(json(503, { detail: "x" }));
    render(await HomePage());
    fetchMock.mockResolvedValueOnce(json(503, { detail: "x" }));
    fill("Buy milk");
    submit();

    await waitFor(() => expect(within(form()).getByRole("alert")).toHaveTextContent(SAVE_FAILED));
    expect(titleInput().value).toBe("Buy milk");
  });

  it("AC-001.7 shows the limit message, keeps values and the list when the API answers 507", async () => {
    await openPage();
    fetchMock.mockResolvedValueOnce(json(507, { detail: "Task limit of 10000 reached" }));
    fill("Buy milk", "2026-12-24");
    submit();

    const alert = await within(form()).findByRole("alert");
    expect(alert).toHaveTextContent(LIMIT_REACHED);
    expect(titleInput().value).toBe("Buy milk");
    expect(dateInput().value).toBe("2026-12-24");
    expect(items()).toHaveLength(1);
  });
});
