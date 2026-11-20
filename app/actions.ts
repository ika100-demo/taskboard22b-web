"use server";

import { createTask } from "@/lib/tasks/api";
import { LIMIT_REACHED, SAVE_FAILED, TITLE_INVALID } from "@/lib/tasks/messages";
import type { Task } from "@/lib/tasks/types";
import { validateTitle } from "@/lib/tasks/validate";

export type CreateTaskOutcome =
  | { kind: "created"; task: Task }
  | { kind: "error"; field: "title"; message: string }
  | { kind: "error"; field: "form"; message: string };

export async function createTaskAction(input: {
  title: string;
  due_date: string;
}): Promise<CreateTaskOutcome> {
  const v = validateTitle(String(input?.title ?? ""));
  if (!v.ok) return { kind: "error", field: "title", message: v.message };
  const dueDate = typeof input.due_date === "string" && input.due_date !== "" ? input.due_date : null;
  const r = await createTask({ title: v.title, due_date: dueDate });
  switch (r.kind) {
    case "created":
      return { kind: "created", task: r.task };
    case "invalid-title":
      return { kind: "error", field: "title", message: TITLE_INVALID };
    case "limit":
      return { kind: "error", field: "form", message: LIMIT_REACHED };
    default:
      return { kind: "error", field: "form", message: SAVE_FAILED };
  }
}
