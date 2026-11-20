import { listTasks } from "@/lib/tasks/api";
import { LOAD_FAILED } from "@/lib/tasks/messages";

import { TaskList } from "./_components/task-list";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await listTasks();
  return (
    <section className="section">
      <h1 className="section-title">Tasks</h1>
      {result.ok ? <TaskList tasks={result.tasks} /> : <p role="alert">{LOAD_FAILED}</p>}
    </section>
  );
}
