import { logger } from "@/lib/logger";
import type { CreateResult, ListResult, NewTask, Task } from "./types";

const TIMEOUT_MS = 5000;

function baseUrl(): string | null {
  const raw = process.env.TASK_API_URL;
  if (!raw) return null;
  const base = raw.replace(/\/+$/, "");
  return base === "" ? null : base;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isTask(v: unknown): v is Task {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    (v.due_date === null || typeof v.due_date === "string")
  );
}

function fail(op: "list" | "create", status?: number, error?: string): void {
  logger.warn("task api call failed", { op, status, error });
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function listTasks(): Promise<ListResult> {
  const base = baseUrl();
  if (!base) {
    fail("list", undefined, "TASK_API_URL is not set");
    return { ok: false };
  }
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const res = await fetch(`${base}/tasks`, {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal,
    });
    if (res.status !== 200) {
      fail("list", res.status);
      return { ok: false };
    }
    const body: unknown = await res.json();
    if (!Array.isArray(body) || !body.every(isTask)) {
      fail("list", res.status, "malformed body");
      return { ok: false };
    }
    return { ok: true, tasks: body };
  } catch (e) {
    fail("list", undefined, errMsg(e));
    return { ok: false };
  }
}

export async function createTask(input: NewTask): Promise<CreateResult> {
  const base = baseUrl();
  if (!base) {
    fail("create", undefined, "TASK_API_URL is not set");
    return { kind: "failed" };
  }
  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    const res = await fetch(`${base}/tasks`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ title: input.title, due_date: input.due_date }),
      signal,
    });
    if (res.status === 507) {
      fail("create", 507);
      return { kind: "limit" };
    }
    if (res.status === 201) {
      const body: unknown = await res.json();
      if (isTask(body)) return { kind: "created", task: body };
      fail("create", 201, "malformed body");
      return { kind: "failed" };
    }
    if (res.status === 422) {
      const body: unknown = await res.json();
      const detail = isRecord(body) ? body.detail : undefined;
      if (
        Array.isArray(detail) &&
        detail.some(
          (item: unknown) =>
            isRecord(item) && Array.isArray(item.loc) && item.loc.at(-1) === "title",
        )
      ) {
        fail("create", 422);
        return { kind: "invalid-title" };
      }
      fail("create", 422);
      return { kind: "failed" };
    }
    fail("create", res.status);
    return { kind: "failed" };
  } catch (e) {
    fail("create", undefined, errMsg(e));
    return { kind: "failed" };
  }
}
