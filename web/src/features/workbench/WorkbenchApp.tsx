import { useEffect, useMemo, useRef, useState } from "react";
import { NotificationStack } from "../../components/NotificationStack";
import { ResultGrid } from "../../components/ResultGrid";
import {
  ConnectionDraft,
  IncomingMessage,
  NotificationItem,
  WorkbenchOutgoingMessage,
  WorkbenchPersistenceState,
  WorkbenchState,
} from "../../lib/protocol";
import {
  createEmptyDraft,
  cloneConnectionToDraft,
  getDefaultQuery,
  getEngineLabel,
} from "../../lib/workbenchDraft";
import { getVsCodeApi } from "../../lib/vscode";
import { ConnectionForm } from "./ConnectionForm";
import { ConnectionList } from "./ConnectionList";
import { QueryEditor } from "./QueryEditor";

const defaultWorkbenchState: WorkbenchState = {
  connections: [],
  currentQuery: getDefaultQuery("postgres"),
  discoveredDatabases: [],
};

export function WorkbenchApp() {
  const vscode = useMemo(() => getVsCodeApi<WorkbenchPersistenceState>(), []);
  const persisted = useMemo(() => vscode.getState(), [vscode]);
  const [state, setState] = useState<WorkbenchState>(defaultWorkbenchState);
  const [draft, setDraft] = useState<ConnectionDraft>(
    () => persisted?.draft ?? createEmptyDraft(),
  );
  const [queryText, setQueryText] = useState<string>(
    () => persisted?.queryText ?? getDefaultQuery("postgres"),
  );
  const [pending, setPending] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const notificationIdRef = useRef(0);
  const draftSourceKeyRef = useRef(persisted?.draftSourceKey ?? "new");
  const queryContextKeyRef = useRef(persisted?.queryContextKey ?? "draft");

  const pushNotification = (
    level: NotificationItem["level"],
    message: string,
  ) => {
    const nextId = notificationIdRef.current + 1;
    notificationIdRef.current = nextId;
    setNotifications((current) =>
      [{ id: nextId, level, message }, ...current].slice(0, 3),
    );

    window.setTimeout(() => {
      setNotifications((current) =>
        current.filter((notification) => notification.id !== nextId),
      );
    }, 5000);
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent<IncomingMessage>) => {
      const message = event.data;
      if (message.type === "workbenchState") {
        setState(message.state);
        setPending(false);
        return;
      }

      if (message.type === "notification") {
        setPending(false);
        pushNotification(message.level, message.message);
      }
    };

    window.addEventListener("message", onMessage);
    vscode.postMessage({ type: "ready" } satisfies WorkbenchOutgoingMessage);

    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [vscode]);

  useEffect(() => {
    const selected = state.connections.find(
      (connection) => connection.id === state.selectedConnectionId,
    );
    const nextDraftSourceKey = selected
      ? `${selected.id}:${selected.updatedAt}`
      : "new";
    const nextQueryContextKey = state.selectedConnectionId ?? "draft";

    if (draftSourceKeyRef.current !== nextDraftSourceKey) {
      draftSourceKeyRef.current = nextDraftSourceKey;
      setDraft(
        selected ? cloneConnectionToDraft(selected) : createEmptyDraft(),
      );
    }

    if (queryContextKeyRef.current !== nextQueryContextKey) {
      queryContextKeyRef.current = nextQueryContextKey;
      setQueryText(
        state.currentQuery || getDefaultQuery(selected?.engine ?? draft.engine),
      );
    }
  }, [draft.engine, state]);

  useEffect(() => {
    vscode.setState({
      draft,
      draftSourceKey: draftSourceKeyRef.current,
      queryContextKey: queryContextKeyRef.current,
      queryText,
    });
  }, [draft, queryText, vscode]);

  const selectedConnection = state.connections.find(
    (connection) => connection.id === state.selectedConnectionId,
  );
  const statusLabel = selectedConnection
    ? `${selectedConnection.name} (${getEngineLabel(selectedConnection.engine)})`
    : "No connection selected";

  const send = (message: WorkbenchOutgoingMessage) => {
    setPending(true);
    vscode.postMessage(message);
  };

  const runQuery = () => {
    if (state.selectedConnectionId) {
      send({
        type: "runQuery",
        connectionId: state.selectedConnectionId,
        sql: queryText,
      });
      return;
    }

    send({
      type: "runDraftQuery",
      draft,
      sql: queryText,
    });
  };

  return (
    <div className="min-h-screen p-4">
      <NotificationStack notifications={notifications} />
      <div className="grid gap-4 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <ConnectionList
          connections={state.connections}
          selectedConnectionId={state.selectedConnectionId}
          pending={pending}
          onSelect={(connectionId) =>
            send({ type: "selectConnection", connectionId })
          }
          onNewConnection={() => {
            draftSourceKeyRef.current = "new";
            queryContextKeyRef.current = "draft";
            setDraft(createEmptyDraft());
            setQueryText(getDefaultQuery("postgres"));
            send({ type: "newConnection" });
          }}
        />

        <main className="grid gap-4">
          <section className="relative overflow-hidden rounded-3xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--vscode-sideBar-background)_88%,transparent)_0%,color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_96%,transparent)_100%)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur-[14px]">
            <div className="mb-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--vscode-descriptionForeground)]">
              Workspace
            </div>
            <h2 className="m-0 text-[28px] leading-[1.1]">{statusLabel}</h2>
            <p className="text-[var(--vscode-descriptionForeground)]">
              {selectedConnection
                ? "Manage this connection, run ad hoc queries, and review the latest result set."
                : "Create a connection draft, test it, and save it when the values are correct."}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full border border-[var(--vscode-focusBorder,var(--vscode-textLink-foreground))] bg-[var(--vscode-badge-background,var(--vscode-button-secondaryBackground,var(--vscode-input-background)))] px-2.5 py-1 text-xs text-[var(--vscode-badge-foreground,var(--vscode-foreground))]">
                {getEngineLabel(draft.engine)}
              </span>
              <span className="inline-flex items-center rounded-full border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[var(--vscode-badge-background,var(--vscode-button-secondaryBackground,var(--vscode-input-background)))] px-2.5 py-1 text-xs text-[var(--vscode-badge-foreground,var(--vscode-foreground))]">
                {draft.authMode === "awsSecret"
                  ? "AWS-backed password"
                  : "Stored password"}
              </span>
              <span className="inline-flex items-center rounded-full border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[var(--vscode-badge-background,var(--vscode-button-secondaryBackground,var(--vscode-input-background)))] px-2.5 py-1 text-xs text-[var(--vscode-badge-foreground,var(--vscode-foreground))]">
                {draft.visibleSchemas.length} schema(s)
              </span>
            </div>
          </section>

          <ConnectionForm
            draft={draft}
            discoveredDatabases={state.discoveredDatabases}
            pending={pending}
            onDraftChange={setDraft}
            onDiscoverDatabases={() =>
              send({ type: "discoverDatabases", draft })
            }
            onTestConnection={() => send({ type: "testConnection", draft })}
            onSaveConnection={() => send({ type: "saveConnection", draft })}
            onDeleteConnection={() =>
              draft.id &&
              send({ type: "deleteConnection", connectionId: draft.id })
            }
            onChooseSchemas={() =>
              draft.id &&
              send({ type: "chooseSchemas", connectionId: draft.id })
            }
          />

          <QueryEditor
            queryText={queryText}
            pending={pending}
            onQueryChange={setQueryText}
            onRun={runQuery}
          />

          <ResultGrid
            result={state.lastResult}
            emptyMessage="Run a query to see rows, duration, and statement feedback."
          />
        </main>
      </div>
    </div>
  );
}
