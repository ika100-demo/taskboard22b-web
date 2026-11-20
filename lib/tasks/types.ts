export interface Task {
  id: string;
  title: string;
  due_date: string | null;
  created_at: string;
}
export interface NewTask {
  title: string;
  due_date: string | null;
}
export type ListResult = { ok: true; tasks: Task[] } | { ok: false };
export type CreateResult =
  | { kind: "created"; task: Task }
  | { kind: "invalid-title" }
  | { kind: "limit" }
  | { kind: "failed" };
