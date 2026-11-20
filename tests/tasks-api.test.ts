import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskAction } from "@/app/actions";
import { LIMIT_REACHED, SAVE_FAILED, TITLE_INVALID } from "@/lib/tasks/messages";
import { validateTitle } from "@/lib/tasks/validate";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const created = { id: "9", title: "Buy milk", due_date: "2026-12-24", created_at: "2026-11-20T10:15:30.123456Z" };

describe("title validation", () => {
  it("AC-001.4 accepts 1 to 200 characters after trimming and returns the trimmed title", () => {
    expect(validateTitle("  Buy milk ")).toEqual({ ok: true, title: "Buy milk" });
    expect(validateTitle("a")).toEqual({ ok: true, title: "a" });
    expect(validateTitle("a".repeat(200))).toEqual({ ok: true, title: "a".repeat(200) });
  });

  it("AC-001.4 rejects empty, whitespace-only and 201 character titles", () => {
    expect(validateTitle("")).toEqual({ ok: false, message: TITLE_INVALID });
    expect(validateTitle("  \n\t ")).toEqual({ ok: false, message: TITLE_INVALID });
    expect(validateTitle("a".repeat(201))).toEqual({ ok: false, message: TITLE_INVALID });
    expect(TITLE_INVALID).toBe("Title must be 1 to 200 characters");
  });
});

describe("createTaskAction", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.TASK_API_URL = "http://task-api.test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("AC-001.2 posts the trimmed title and date and returns the created task", async () => {
    fetchMock.mockResolvedValue(json(201, created));
    const outcome = await createTaskAction({ title: " Buy milk ", due_date: "2026-12-24" });
    expect(outcome).toEqual({ kind: "created", task: created });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://task-api.test/tasks");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ title: "Buy milk", due_date: "2026-12-24" });
  });

  it("AC-001.3 sends due_date null for an empty date", async () => {
    fetchMock.mockResolvedValue(json(201, { ...created, due_date: null }));
    await createTaskAction({ title: "Buy milk", due_date: "" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "Buy milk", due_date: null });
  });

  it("AC-001.4 returns a title error without calling the API for an invalid title", async () => {
    expect(await createTaskAction({ title: "   ", due_date: "" })).toEqual({ kind: "error", field: "title", message: TITLE_INVALID });
    expect(await createTaskAction({ title: "a".repeat(201), due_date: "" })).toEqual({
      kind: "error",
      field: "title",
      message: TITLE_INVALID,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-001.4 maps a 422 naming title to the title error", async () => {
    fetchMock.mockResolvedValue(json(422, { detail: [{ type: "x", loc: ["body", "title"], msg: "m" }] }));
    expect(await createTaskAction({ title: "ok", due_date: "" })).toEqual({ kind: "error", field: "title", message: TITLE_INVALID });
  });

  it.each([
    ["503", () => fetchMock.mockResolvedValue(json(503, { detail: "x" }))],
    ["500", () => fetchMock.mockResolvedValue(json(500, { detail: "x" }))],
    ["422 for another field", () => fetchMock.mockResolvedValue(json(422, { detail: [{ type: "x", loc: ["body", "due_date"], msg: "m" }] }))],
    ["422 with a malformed body", () => fetchMock.mockResolvedValue(new Response("not json", { status: 422 }))],
    ["201 with a malformed body", () => fetchMock.mockResolvedValue(json(201, { nope: true }))],
    ["network error", () => fetchMock.mockRejectedValue(new TypeError("fetch failed"))],
  ])("AC-001.6 maps %s to the save error", async (_n, arrange) => {
    arrange();
    expect(await createTaskAction({ title: "ok", due_date: "" })).toEqual({ kind: "error", field: "form", message: SAVE_FAILED });
  });

  it("AC-001.6 maps a timeout to the save error, with a 5 second signal that reaches fetch", async () => {
    const controller = new AbortController();
    const spy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    try {
      fetchMock.mockImplementation(
        (_url: unknown, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError")));
          }),
      );
      const pending = createTaskAction({ title: "ok", due_date: "" });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(spy).toHaveBeenCalledWith(5000);
      expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
      controller.abort();
      expect(await pending).toEqual({ kind: "error", field: "form", message: SAVE_FAILED });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("AC-001.6 treats an unset TASK_API_URL as unavailable without fetching", async () => {
    delete process.env.TASK_API_URL;
    expect(await createTaskAction({ title: "ok", due_date: "" })).toEqual({ kind: "error", field: "form", message: SAVE_FAILED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-001.7 maps 507 to the limit message", async () => {
    fetchMock.mockResolvedValue(json(507, { detail: "Task limit of 10000 reached" }));
    expect(await createTaskAction({ title: "ok", due_date: "" })).toEqual({ kind: "error", field: "form", message: LIMIT_REACHED });
    expect(LIMIT_REACHED).toBe("The task limit of 10,000 is reached.");
  });
});
