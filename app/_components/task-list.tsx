import type { Task } from "@/lib/tasks/types";
import { NO_DUE_DATE, NO_TASKS } from "@/lib/tasks/messages";

export type TaskListProps = { tasks: Task[] };

export function TaskList({ tasks }: TaskListProps) {
  if (tasks.length === 0) {
    return <p className="task-empty">{NO_TASKS}</p>;
  }
  return (
    <ul className="task-list" aria-label="Tasks">
      {tasks.map((task) => (
        <li key={task.id} className="task-item">
          <span className="task-title">{task.title}</span>
          {task.due_date ? <time dateTime={task.due_date}>{task.due_date}</time> : <span>{NO_DUE_DATE}</span>}
        </li>
      ))}
    </ul>
  );
}
