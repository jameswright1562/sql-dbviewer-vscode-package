import { ChangeEvent, ReactNode } from 'react';
import { ConnectionDraft, DiscoveredDatabase } from '../../lib/protocol';
import { defaultPorts, getEngineLabel } from '../../lib/workbenchDraft';

interface ConnectionFormProps {
  draft: ConnectionDraft;
  discoveredDatabases: DiscoveredDatabase[];
  pending: boolean;
  onDraftChange(nextDraft: ConnectionDraft): void;
  onDiscoverDatabases(): void;
  onTestConnection(): void;
  onSaveConnection(): void;
  onDeleteConnection(): void;
  onChooseSchemas(): void;
}

export function ConnectionForm({
  draft,
  discoveredDatabases,
  pending,
  onDraftChange,
  onDiscoverDatabases,
  onTestConnection,
  onSaveConnection,
  onDeleteConnection,
  onChooseSchemas
}: ConnectionFormProps) {
  const updateDraft = <Key extends keyof ConnectionDraft>(key: Key, value: ConnectionDraft[Key]) => {
    onDraftChange({
      ...draft,
      [key]: value
    });
  };

  const updateAwsSecret = (key: 'secretId' | 'profile' | 'passwordKey' | 'region', value: string) => {
    onDraftChange({
      ...draft,
      awsSecret: {
        secretId: draft.awsSecret?.secretId ?? '',
        profile: draft.awsSecret?.profile ?? '',
        passwordKey: draft.awsSecret?.passwordKey ?? 'password',
        region: draft.awsSecret?.region ?? '',
        [key]: value
      }
    });
  };

  const handleEngineChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextEngine = event.target.value as ConnectionDraft['engine'];
    const nextPort = draft.port === defaultPorts[draft.engine] ? defaultPorts[nextEngine] : draft.port;
    onDraftChange({
      ...draft,
      engine: nextEngine,
      port: nextPort
    });
  };

  return (
    <section className="panel section">
      <div className="section-header">
        <div>
          <div className="eyebrow">Connection</div>
          <h2 className="section-title">Connection Details</h2>
          <p className="subtle">Save a reusable endpoint, test it, and control the schemas that appear in the explorer.</p>
        </div>
        <div className="button-row">
          <button disabled={pending} onClick={onDiscoverDatabases}>
            Discover DBs
          </button>
          <button disabled={pending} onClick={onTestConnection}>
            Test
          </button>
          <button className="primary" disabled={pending} onClick={onSaveConnection}>
            Save
          </button>
          <button className="danger" disabled={!draft.id || pending} onClick={onDeleteConnection}>
            Delete
          </button>
        </div>
      </div>

      <div className="form-grid">
        <Field label="Display name">
          <input aria-label="Display name" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} />
        </Field>
        <Field label="Engine">
          <select aria-label="Engine" value={draft.engine} onChange={handleEngineChange}>
            <option value="postgres">{getEngineLabel('postgres')}</option>
            <option value="mysql">{getEngineLabel('mysql')}</option>
            <option value="sqlserver">{getEngineLabel('sqlserver')}</option>
          </select>
        </Field>
        <Field label="Host">
          <input aria-label="Host" value={draft.host} onChange={(event) => updateDraft('host', event.target.value)} />
        </Field>
        <Field label="Port">
          <input
            aria-label="Port"
            type="number"
            value={draft.port}
            onChange={(event) => updateDraft('port', Number(event.target.value))}
          />
        </Field>
        <Field label="Database">
          <input aria-label="Database" value={draft.database} onChange={(event) => updateDraft('database', event.target.value)} />
        </Field>
        <Field label="Username">
          <input aria-label="Username" value={draft.username} onChange={(event) => updateDraft('username', event.target.value)} />
        </Field>
        <Field label="SSL mode">
          <select
            aria-label="SSL mode"
            value={draft.sslMode}
            onChange={(event) => updateDraft('sslMode', event.target.value as ConnectionDraft['sslMode'])}
          >
            <option value="disable">disable</option>
            <option value="require">require</option>
          </select>
        </Field>
        <Field label="Password source">
          <select
            aria-label="Password source"
            value={draft.authMode}
            onChange={(event) => updateDraft('authMode', event.target.value as ConnectionDraft['authMode'])}
          >
            <option value="storedPassword">Stored password</option>
            <option value="awsSecret">AWS Secrets Manager</option>
          </select>
        </Field>

        <div className="field field-full">
          <label>Credentials</label>
          {draft.authMode === 'storedPassword' ? (
            <div className="stack">
              <input
                aria-label="Credentials"
                type="password"
                value={draft.password ?? ''}
                placeholder={draft.id ? 'Leave blank to keep the existing password' : 'Enter password'}
                onChange={(event) => updateDraft('password', event.target.value)}
              />
              <span className="hint">Stored in VS Code Secret Storage.</span>
            </div>
          ) : (
            <div className="form-grid nested-grid">
              <Field label="Secret id / ARN">
                <input
                  aria-label="Secret id / ARN"
                  value={draft.awsSecret?.secretId ?? ''}
                  onChange={(event) => updateAwsSecret('secretId', event.target.value)}
                />
              </Field>
              <Field label="AWS profile">
                <input
                  aria-label="AWS profile"
                  value={draft.awsSecret?.profile ?? ''}
                  onChange={(event) => updateAwsSecret('profile', event.target.value)}
                />
              </Field>
              <Field label="Password key">
                <input
                  aria-label="Password key"
                  value={draft.awsSecret?.passwordKey ?? ''}
                  onChange={(event) => updateAwsSecret('passwordKey', event.target.value)}
                />
              </Field>
              <Field label="Region">
                <input
                  aria-label="Region"
                  value={draft.awsSecret?.region ?? ''}
                  onChange={(event) => updateAwsSecret('region', event.target.value)}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="field field-full">
          <label>Visible schemas</label>
          <div className="chip-row">
            {draft.visibleSchemas.length ? (
              draft.visibleSchemas.map((schema) => (
                <span key={schema} className="chip strong">
                  {schema}
                </span>
              ))
            ) : (
              <span className="chip">No schemas selected yet</span>
            )}
          </div>
          <div className="button-row">
            <button disabled={!draft.id || pending} onClick={onChooseSchemas}>
              Choose Schemas
            </button>
          </div>
        </div>

        {discoveredDatabases.length > 0 ? (
          <div className="field field-full">
            <label>Accessible databases</label>
            <div className="discovery-grid">
              {discoveredDatabases.map((database) => (
                <section key={database.name} className={`discovery-card ${draft.database === database.name ? 'selected' : ''}`}>
                  <div className="discovery-head">
                    <strong>{database.name}</strong>
                    <button
                      disabled={pending}
                      onClick={() =>
                        onDraftChange({
                          ...draft,
                          database: database.name,
                          visibleSchemas: [...database.schemas]
                        })
                      }
                    >
                      {draft.database === database.name ? 'Selected' : 'Use database'}
                    </button>
                  </div>
                  <div className="chip-row">
                    {database.schemas.length ? (
                      database.schemas.map((schema) => (
                        <span key={schema} className="chip strong">
                          {schema}
                        </span>
                      ))
                    ) : (
                      <span className="chip">No schemas found</span>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

interface FieldProps {
  label: string;
  children: ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
