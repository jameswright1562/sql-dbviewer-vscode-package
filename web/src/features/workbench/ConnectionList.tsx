import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { WorkbenchConnection } from "../../lib/protocol";
import { getEngineLabel } from "../../lib/workbenchDraft";

interface ConnectionListProps {
  connections: WorkbenchConnection[];
  selectedConnectionId?: string;
  pending: boolean;
  onSelect(connectionId?: string): void;
  onNewConnection(): void;
}

export function ConnectionList({
  connections,
  selectedConnectionId,
  pending,
  onSelect,
  onNewConnection,
}: ConnectionListProps) {
  return (
    <aside className="relative flex min-h-[calc(100vh-32px)] flex-col overflow-hidden rounded-3xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--vscode-sideBar-background)_88%,transparent)_0%,color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_96%,transparent)_100%)] shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur-[14px] max-xl:min-h-0">
      <div className="border-b border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] p-[18px]">
        <div className="mb-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--vscode-descriptionForeground)]">
          SQL Connection Workbench
        </div>
        <h1 className="m-0">Connections</h1>
        <p className="text-[var(--vscode-descriptionForeground)]">
          Pick a saved connection or start a new one without leaving the editor.
        </p>
        <div className="flex flex-wrap gap-2">
          <VSCodeButton
            appearance="primary"
            disabled={pending}
            onClick={onNewConnection}
          >
            New Connection
          </VSCodeButton>
        </div>
      </div>

      <div className="grid gap-3 p-4">
        {connections.length === 0 ? (
          <div className="px-4 py-6 text-center text-[var(--vscode-descriptionForeground)]">
            No saved connections yet.
          </div>
        ) : (
          connections.map((connection) => (
            <VSCodeButton
              key={connection.id}
              className={`connection-card ${selectedConnectionId === connection.id ? "selected" : ""}`}
              appearance="secondary"
              disabled={pending}
              onClick={() => onSelect(connection.id)}
            >
              <div className="text-left">
                <strong className="mb-2 block text-[15px]">
                  {connection.name}
                </strong>
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-[var(--vscode-focusBorder,var(--vscode-textLink-foreground))] bg-[var(--vscode-badge-background,var(--vscode-button-secondaryBackground,var(--vscode-input-background)))] px-2.5 py-1 text-xs text-[var(--vscode-badge-foreground,var(--vscode-foreground))]">
                    {getEngineLabel(connection.engine)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[var(--vscode-badge-background,var(--vscode-button-secondaryBackground,var(--vscode-input-background)))] px-2.5 py-1 text-xs text-[var(--vscode-badge-foreground,var(--vscode-foreground))]">
                    {connection.authMode === "awsSecret"
                      ? "AWS secret"
                      : connection.hasStoredPassword
                        ? "Stored password"
                        : "Password missing"}
                  </span>
                </div>
                <p className="m-0 text-[var(--vscode-descriptionForeground)]">
                  {connection.host}:{connection.port} /{" "}
                  {connection.database || "database not set"}
                </p>
              </div>
            </VSCodeButton>
          ))
        )}
      </div>
    </aside>
  );
}
