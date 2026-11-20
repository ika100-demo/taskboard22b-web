import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

describe("HomePage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.TASK_API_URL = "http://task-api.test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a single level-1 heading named Tasks", async () => {
    fetchMock.mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    render(await HomePage());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Tasks" })).toBeInTheDocument();
  });

  it("keeps the single heading when the Task API is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    render(await HomePage());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
