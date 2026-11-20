import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

const LOAD_FAILED = "Tasks cannot be loaded right now. Please try again later.";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const task = (id: string, title: string, due_date: string | null) => ({
  id,
  title,
  due_date,
  created_at: "2026-11-20T10:15:30.123456Z",
});

describe("start page task list", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.TASK_API_URL = "http://task-api.test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("AC-001.1 lists every returned task in the returned order with title and due date or 'No due date'", async () => {
    fetchMock.mockResolvedValue(
      json(200, [task("1", "Zebra first", "2026-12-24"), task("2", "Apple second", null), task("3", "Middle third", "2027-01-05")]),
    );
    render(await HomePage());

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const list = screen.getByRole("list", { name: "Tasks" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Zebra first");
    expect(items[0]).toHaveTextContent("2026-12-24");
    expect(items[1]).toHaveTextContent("Apple second");
    expect(items[1]).toHaveTextContent("No due date");
    expect(items[2]).toHaveTextContent("Middle third");
    expect(items[2]).toHaveTextContent("2027-01-05");
    expect(items[0]).not.toHaveTextContent("No due date");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://task-api.test/tasks");
    expect(init.method).toBe("GET");
  });

  it("AC-001.1 shows 'No tasks yet' and no list for an empty array", async () => {
    fetchMock.mockResolvedValue(json(200, []));
    render(await HomePage());
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
  });

  const failures: [string, () => void][] = [
    ["unreachable", () => fetchMock.mockRejectedValue(new TypeError("fetch failed"))],
    ["timeout", () => fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"))],
    ["503", () => fetchMock.mockResolvedValue(json(503, { detail: "Tasks are temporarily unavailable" }))],
    ["unlisted status 500", () => fetchMock.mockResolvedValue(json(500, { detail: "boom" }))],
    ["unlisted status 404", () => fetchMock.mockResolvedValue(json(404, { detail: "nope" }))],
    ["a body that is not an array", () => fetchMock.mockResolvedValue(json(200, { tasks: [] }))],
  ];

  it.each(failures)("AC-001.5 shows the load error instead of the list when the API is %s", async (_name, arrange) => {
    arrange();
    render(await HomePage());
    expect(screen.getByRole("alert")).toHaveTextContent(LOAD_FAILED);
    expect(screen.queryByRole("list", { name: "Tasks" })).not.toBeInTheDocument();
    expect(screen.queryByText("No tasks yet")).not.toBeInTheDocument();
  });

  it("AC-001.5 gives the GET a 5 second abort signal", async () => {
    fetchMock.mockResolvedValue(json(200, []));
    render(await HomePage());
    const init = fetchMock.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("AC-001.5 still shows the create form when the list cannot be loaded", async () => {
    fetchMock.mockResolvedValue(json(503, { detail: "x" }));
    render(await HomePage());
    expect(screen.getByRole("form", { name: "New task" })).toBeInTheDocument();
  });
});
