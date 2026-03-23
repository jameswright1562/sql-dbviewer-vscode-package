import { useEffect, useMemo, useState } from 'react';
import { IncomingMessage, SidebarOutgoingMessage, SidebarState } from '../../lib/protocol';
import { getEngineLabel } from '../../lib/workbenchDraft';
import { getVsCodeApi } from '../../lib/vscode';

const defaultSidebarState: SidebarState = {
  connections: []
};

export function SidebarApp() {
  const vscode = useMemo(() => getVsCodeApi<never>(), []);
  const [state, setState] = useState<SidebarState>(defaultSidebarState);

  useEffect(() => {
    const onMessage = (event: MessageEvent<IncomingMessage>) => {
      if (event.data.type === 'sidebarState') {
        setState(event.data.state);
      }
    };

    window.addEventListener('message', onMessage);
    vscode.postMessage({ type: 'ready' } satisfies SidebarOutgoingMessage);

    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [vscode]);

  const send = (message: SidebarOutgoingMessage) => {
    vscode.postMessage(message);
  };

  return (
    <div className="sidebar-view">
      <section className="panel compact-panel">
        <div className="sidebar-header">
          <div className="eyebrow">SQL Workbench</div>
          <h1 className="sidebar-title">Quick Access</h1>
          <p className="subtle">Open the full workbench or jump into a saved connection.</p>
          <div className="button-row">
            <button className="primary" onClick={() => send({ type: 'addConnection' })}>
              New Connection
            </button>
            <button onClick={() => send({ type: 'refresh' })}>Refresh</button>
          </div>
        </div>

        <div className="connection-list">
          {state.connections.length === 0 ? (
            <div className="empty-state">Add a connection to get started.</div>
          ) : (
            state.connections.map((connection) => (
              <button
                key={connection.id}
                className={`connection-card ${state.selectedConnectionId === connection.id ? 'selected' : ''}`}
                onClick={() => send({ type: 'openWorkbench', connectionId: connection.id })}
              >
                <strong>{connection.name}</strong>
                <div className="chip-row">
                  <span className="chip strong">{getEngineLabel(connection.engine)}</span>
                  <span className="chip">{connection.database}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
