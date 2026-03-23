import { WorkbenchConnection } from '../../lib/protocol';
import { getEngineLabel } from '../../lib/workbenchDraft';

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
  onNewConnection
}: ConnectionListProps) {
  return (
    <aside className="panel sidebar">
      <div className="sidebar-header">
        <div className="eyebrow">SQL Connection Workbench</div>
        <h1 className="sidebar-title">Connections</h1>
        <p className="subtle">Pick a saved connection or start a new one without leaving the editor.</p>
        <div className="button-row">
          <button className="primary" disabled={pending} onClick={onNewConnection}>
            New Connection
          </button>
        </div>
      </div>

      <div className="connection-list">
        {connections.length === 0 ? (
          <div className="empty-state">No saved connections yet.</div>
        ) : (
          connections.map((connection) => (
            <button
              key={connection.id}
              className={`connection-card ${selectedConnectionId === connection.id ? 'selected' : ''}`}
              disabled={pending}
              onClick={() => onSelect(connection.id)}
            >
              <strong>{connection.name}</strong>
              <div className="chip-row">
                <span className="chip strong">{getEngineLabel(connection.engine)}</span>
                <span className="chip">
                  {connection.authMode === 'awsSecret'
                    ? 'AWS secret'
                    : connection.hasStoredPassword
                      ? 'Stored password'
                      : 'Password missing'}
                </span>
              </div>
              <p className="connection-meta">
                {connection.host}:{connection.port} / {connection.database || 'database not set'}
              </p>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
