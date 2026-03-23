import { useEffect, useMemo, useRef, useState } from 'react';
import { NotificationStack } from '../../components/NotificationStack';
import { ResultGrid } from '../../components/ResultGrid';
import {
  ConnectionDraft,
  IncomingMessage,
  NotificationItem,
  WorkbenchOutgoingMessage,
  WorkbenchPersistenceState,
  WorkbenchState
} from '../../lib/protocol';
import { createEmptyDraft, cloneConnectionToDraft, getDefaultQuery, getEngineLabel } from '../../lib/workbenchDraft';
import { getVsCodeApi } from '../../lib/vscode';
import { ConnectionForm } from './ConnectionForm';
import { ConnectionList } from './ConnectionList';
import { QueryEditor } from './QueryEditor';

const defaultWorkbenchState: WorkbenchState = {
  connections: [],
  currentQuery: getDefaultQuery('postgres'),
  discoveredDatabases: []
};

export function WorkbenchApp() {
  const vscode = useMemo(() => getVsCodeApi<WorkbenchPersistenceState>(), []);
  const persisted = useMemo(() => vscode.getState(), [vscode]);
  const [state, setState] = useState<WorkbenchState>(defaultWorkbenchState);
  const [draft, setDraft] = useState<ConnectionDraft>(() => persisted?.draft ?? createEmptyDraft());
  const [queryText, setQueryText] = useState<string>(() => persisted?.queryText ?? getDefaultQuery('postgres'));
  const [pending, setPending] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const notificationIdRef = useRef(0);
  const draftSourceKeyRef = useRef(persisted?.draftSourceKey ?? 'new');
  const queryContextKeyRef = useRef(persisted?.queryContextKey ?? 'draft');

  const pushNotification = (level: NotificationItem['level'], message: string) => {
    const nextId = notificationIdRef.current + 1;
    notificationIdRef.current = nextId;
    setNotifications((current) => [{ id: nextId, level, message }, ...current].slice(0, 3));

    window.setTimeout(() => {
      setNotifications((current) => current.filter((notification) => notification.id !== nextId));
    }, 5000);
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent<IncomingMessage>) => {
      const message = event.data;
      if (message.type === 'workbenchState') {
        setState(message.state);
        setPending(false);
        return;
      }

      if (message.type === 'notification') {
        setPending(false);
        pushNotification(message.level, message.message);
      }
    };

    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' } satisfies WorkbenchOutgoingMessage);

    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [vscode]);

  useEffect(() => {
    const selected = state.connections.find((connection) => connection.id === state.selectedConnectionId);
    const nextDraftSourceKey = selected ? `${selected.id}:${selected.updatedAt}` : 'new';
    const nextQueryContextKey = state.selectedConnectionId ?? 'draft';

    if (draftSourceKeyRef.current !== nextDraftSourceKey) {
      draftSourceKeyRef.current = nextDraftSourceKey;
      setDraft(selected ? cloneConnectionToDraft(selected) : createEmptyDraft());
    }

    if (queryContextKeyRef.current !== nextQueryContextKey) {
      queryContextKeyRef.current = nextQueryContextKey;
      setQueryText(state.currentQuery || getDefaultQuery(selected?.engine ?? draft.engine));
    }
  }, [draft.engine, state]);

  useEffect(() => {
    vscode.setState({
      draft,
      draftSourceKey: draftSourceKeyRef.current,
      queryContextKey: queryContextKeyRef.current,
      queryText
    });
  }, [draft, queryText, vscode]);

  const selectedConnection = state.connections.find((connection) => connection.id === state.selectedConnectionId);
  const statusLabel = selectedConnection
    ? `${selectedConnection.name} (${getEngineLabel(selectedConnection.engine)})`
    : 'No connection selected';

  const send = (message: WorkbenchOutgoingMessage) => {
    setPending(true);
    vscode.postMessage(message);
  };

  const runQuery = () => {
    if (state.selectedConnectionId) {
      send({
        type: 'runQuery',
        connectionId: state.selectedConnectionId,
        sql: queryText
      });
      return;
    }

    send({
      type: 'runDraftQuery',
      draft,
      sql: queryText
    });
  };

  return (
    <div className="view-shell">
      <NotificationStack notifications={notifications} />
      <div className="app-shell">
        <ConnectionList
          connections={state.connections}
          selectedConnectionId={state.selectedConnectionId}
          pending={pending}
          onSelect={(connectionId) => send({ type: 'selectConnection', connectionId })}
          onNewConnection={() => {
            draftSourceKeyRef.current = 'new';
            queryContextKeyRef.current = 'draft';
            setDraft(createEmptyDraft());
            setQueryText(getDefaultQuery('postgres'));
            send({ type: 'newConnection' });
          }}
        />

        <main className="main-column">
          <section className="panel hero">
            <div className="eyebrow">Workspace</div>
            <h2 className="hero-title">{statusLabel}</h2>
            <p className="subtle">
              {selectedConnection
                ? 'Manage this connection, run ad hoc queries, and review the latest result set.'
                : 'Create a connection draft, test it, and save it when the values are correct.'}
            </p>
            <div className="chip-row">
              <span className="chip strong">{getEngineLabel(draft.engine)}</span>
              <span className="chip">{draft.authMode === 'awsSecret' ? 'AWS-backed password' : 'Stored password'}</span>
              <span className="chip">{draft.visibleSchemas.length} schema(s)</span>
            </div>
          </section>

          <ConnectionForm
            draft={draft}
            discoveredDatabases={state.discoveredDatabases}
            pending={pending}
            onDraftChange={setDraft}
            onDiscoverDatabases={() => send({ type: 'discoverDatabases', draft })}
            onTestConnection={() => send({ type: 'testConnection', draft })}
            onSaveConnection={() => send({ type: 'saveConnection', draft })}
            onDeleteConnection={() => draft.id && send({ type: 'deleteConnection', connectionId: draft.id })}
            onChooseSchemas={() => draft.id && send({ type: 'chooseSchemas', connectionId: draft.id })}
          />

          <QueryEditor queryText={queryText} pending={pending} onQueryChange={setQueryText} onRun={runQuery} />

          <ResultGrid
            result={state.lastResult}
            emptyMessage="Run a query to see rows, duration, and statement feedback."
          />
        </main>
      </div>
    </div>
  );
}
