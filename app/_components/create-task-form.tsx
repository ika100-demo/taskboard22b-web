"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";

import { createTaskAction } from "@/app/actions";
import { SAVE_FAILED } from "@/lib/tasks/messages";
import type { Task } from "@/lib/tasks/types";
import { validateTitle } from "@/lib/tasks/validate";

export type CreateTaskFormProps = { onCreated: (task: Task) => void };

export function CreateTaskForm({ onCreated }: CreateTaskFormProps) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const v = validateTitle(title);
    if (!v.ok) {
      setTitleError(v.message);
      return;
    }
    setTitleError(null);
    startTransition(async () => {
      try {
        const o = await createTaskAction({ title, due_date: dueDate });
        if (o.kind === "created") {
          onCreated(o.task);
          setTitle("");
          setDueDate("");
        } else if (o.field === "title") {
          setTitleError(o.message);
        } else {
          setFormError(o.message);
        }
      } catch {
        setFormError(SAVE_FAILED);
      }
    });
  }

  return (
    <form aria-label="New task" noValidate onSubmit={handleSubmit} className="task-form">
      <div className="field">
        <label htmlFor="task-title">Title</label>
        <input
          id="task-title"
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={titleError ? "true" : undefined}
          aria-describedby={titleError ? "task-title-error" : undefined}
        />
        {titleError && (
          <p id="task-title-error" className="field-error">
            {titleError}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="task-due-date">Due date</label>
        <input
          id="task-due-date"
          name="due_date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        Add task
      </button>
      {formError && (
        <p role="alert" className="field-error">
          {formError}
        </p>
      )}
    </form>
  );
}
