import { listTasks } from "@/lib/tasks/api";
import { LOAD_FAILED } from "@/lib/tasks/messages";

import { TaskBoard } from "./_components/task-board";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await listTasks();
  return (
    <section className="section">
      <h1 className="section-title">Tasks</h1>
      {!result.ok && <p role="alert">{LOAD_FAILED}</p>}
      <TaskBoard initialTasks={result.ok ? result.tasks : null} />
    </section>
  );
}
