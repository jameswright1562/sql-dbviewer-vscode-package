import { useEffect, useMemo, useState } from "react";
import {
  IncomingMessage,
  SidebarOutgoingMessage,
  SidebarState,
} from "../../lib/protocol";
import { getEngineLabel } from "../../lib/workbenchDraft";
import { getVsCodeApi } from "../../lib/vscode";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

const defaultSidebarState: SidebarState = {
  connections: [],
};

export function SidebarApp() {
  const vscode = useMemo(() => getVsCodeApi<never>(), []);
  const [state, setState] = useState<SidebarState>(defaultSidebarState);

  useEffect(() => {
    const onMessage = (event: MessageEvent<IncomingMessage>) => {
      if (event.data.type === "sidebarState") {
        setState(event.data.state);
      }
    };

    window.addEventListener("message", onMessage);
    vscode.postMessage({ type: "ready" } satisfies SidebarOutgoingMessage);

    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [vscode]);

  const send = (message: SidebarOutgoingMessage) => {
    vscode.postMessage(message);
  };

  return (
    <div className="p-3">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--vscode-sideBar-background)_88%,transparent)_0%,color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_96%,transparent)_100%)] shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur-[14px]">
        <div className="border-b border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] p-[18px]">
          <div className="mb-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--vscode-descriptionForeground)]">
            SQL Workbench
          </div>
          <h1 className="m-0">Quick Access</h1>
          <p className="text-[var(--vscode-descriptionForeground)]">
            Open the full workbench or jump into a saved connection.
          </p>
          <div className="flex flex-wrap gap-2">
            <VSCodeButton
              appearance="primary"
              onClick={() => send({ type: "addConnection" })}
            >
              New Connection
            </VSCodeButton>
            <VSCodeButton onClick={() => send({ type: "refresh" })}>
              Refresh
            </VSCodeButton>
          </div>
        </div>

        <div className="grid gap-3 p-4">
          {state.connections.length === 0 ? (
            <div className="px-4 py-6 text-center text-[var(--vscode-descriptionForeground)]">
              Add a connection to get started.
            </div>
          ) : (
            state.connections.map((connection) => (
              <VSCodeButton
                key={connection.id}
                className={`connection-card ${state.selectedConnectionId === connection.id ? "selected" : ""}`}
                onClick={() =>
                  send({ type: "openWorkbench", connectionId: connection.id })
                }
              >
                <div className="text-left">
                  <strong className="mb-2 block text-[15px]">
                    {connection.name}
                  </strong>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full border border-[var(--vscode-focusBorder,var(--vscode-textLink-foreground))] bg-[var(--vscode-badge-background,var(--vscode-button-secondaryBackground,var(--vscode-input-background)))] px-2.5 py-1 text-xs text-[var(--vscode-badge-foreground,var(--vscode-foreground))]">
                      {getEngineLabel(connection.engine)}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[var(--vscode-badge-background,var(--vscode-button-secondaryBackground,var(--vscode-input-background)))] px-2.5 py-1 text-xs text-[var(--vscode-badge-foreground,var(--vscode-foreground))]">
                      {connection.database}
                    </span>
                  </div>
                </div>
              </VSCodeButton>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
