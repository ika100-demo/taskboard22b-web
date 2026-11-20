"use client";

import { useState } from "react";

import type { Task } from "@/lib/tasks/types";

import { CreateTaskForm } from "./create-task-form";
import { TaskList } from "./task-list";

export type TaskBoardProps = { initialTasks: Task[] | null };

export function TaskBoard({ initialTasks }: TaskBoardProps) {
  const [tasks, setTasks] = useState<Task[] | null>(initialTasks);
  return (
    <>
      <CreateTaskForm onCreated={(t) => setTasks((ts) => (ts === null ? null : [...ts, t]))} />
      {tasks !== null && <TaskList tasks={tasks} />}
    </>
  );
}
