import { useEffect, useMemo, useState } from 'react';
import { NotificationStack } from '../../components/NotificationStack';
import { ResultGrid } from '../../components/ResultGrid';
import { IncomingMessage, NotificationItem, TableOutgoingMessage, TableViewState } from '../../lib/protocol';
import { getEngineLabel } from '../../lib/workbenchDraft';
import { getVsCodeApi } from '../../lib/vscode';

export function TableViewApp() {
  const vscode = useMemo(() => getVsCodeApi<never>(), []);
  const [state, setState] = useState<TableViewState | undefined>();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent<IncomingMessage>) => {
      const message = event.data;
      if (message.type === 'tableState') {
        setState(message.state);
        setPending(false);
        return;
      }

      if (message.type === 'notification') {
        setPending(false);
        setNotifications((current) => [
          { id: current.length + Date.now(), level: message.level, message: message.message },
          ...current
        ].slice(0, 3));
      }
    };

    window.addEventListener('message', onMessage);
    setPending(true);
    vscode.postMessage({ type: 'ready' } satisfies TableOutgoingMessage);

    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [vscode]);

  const send = (message: TableOutgoingMessage) => {
    setPending(true);
    vscode.postMessage(message);
  };

  return (
    <div className="view-shell">
      <NotificationStack notifications={notifications} />
      <div className="table-view">
        <section className="panel hero">
          <div className="eyebrow">Table Preview</div>
          <h1 className="hero-title">{state ? `${state.schema}.${state.table}` : 'Loading table preview'}</h1>
          <p className="subtle">
            {state
              ? `${state.connectionName} · ${getEngineLabel(state.engine)} · ${state.database}`
              : 'Fetching rows from the selected table.'}
          </p>
          <div className="button-row">
            <button disabled={!state || pending} onClick={() => state && send({ type: 'refresh' })}>
              Refresh
            </button>
            <button
              className="primary"
              disabled={!state || pending}
              onClick={() => state && send({ type: 'openWorkbench', connectionId: state.connectionId })}
            >
              Open Workbench
            </button>
          </div>
        </section>

        <section className="panel section">
          <div className="section-header">
            <div>
              <div className="eyebrow">Preview SQL</div>
              <h2 className="section-title">Generated statement</h2>
            </div>
          </div>
          <pre className="sql-preview">{state?.previewSql ?? 'Waiting for preview SQL...'}</pre>
        </section>

        <ResultGrid
          result={state?.result}
          errorMessage={state?.errorMessage}
          emptyMessage="The table preview is loading."
        />
      </div>
    </div>
  );
}
