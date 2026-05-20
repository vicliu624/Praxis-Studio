import type { RuntimeChatMessage } from "../runtimeClient";

interface CodingTaskCardProps {
  message: RuntimeChatMessage;
}

export function CodingTaskCard({ message }: CodingTaskCardProps) {
  const task = message.task;
  if (!task) return null;
  return (
    <article className="coding-task-card">
      <div className="chat-message-meta">
        <strong>{task.id}</strong>
        <span>Controlled task</span>
      </div>
      <h3>{task.title}</h3>
      <p>{message.content}</p>
      <div className="permission-grid">
        <div>
          <strong>Allowed</strong>
          {task.scope.allowedPaths.slice(0, 5).map((path) => (
            <span key={path}>{path}</span>
          ))}
        </div>
        <div>
          <strong>Forbidden</strong>
          {task.scope.forbiddenPaths.slice(0, 5).map((path) => (
            <span key={path}>{path}</span>
          ))}
        </div>
      </div>
    </article>
  );
}
