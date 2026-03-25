import { NotificationItem } from "../lib/protocol";

interface NotificationStackProps {
  notifications: NotificationItem[];
}

export function NotificationStack({ notifications }: NotificationStackProps) {
  if (!notifications.length) {
    return null;
  }

  return (
    <div className="fixed right-4 top-4 z-20 grid gap-2.5" aria-live="polite">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`max-w-[380px] min-w-[260px] rounded-2xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_96%,transparent)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.16)] ${notification.level === "error" ? "border-[var(--vscode-errorForeground)]" : ""}`}
        >
          <strong>{notification.level === "error" ? "Error" : "Info"}</strong>
          <div>{notification.message}</div>
        </div>
      ))}
    </div>
  );
}
