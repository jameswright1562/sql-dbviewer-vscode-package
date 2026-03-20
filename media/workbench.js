(function () {
  const vscode = acquireVsCodeApi();

  const defaultPorts = {
    postgres: 5432,
    mysql: 3306,
    sqlserver: 1433
  };

  let state = {
    connections: [],
    selectedConnectionId: undefined,
    currentQuery: '',
    lastResult: undefined,
    discoveredDatabases: []
  };

  let draft = createBlankDraft();
  let draftSourceKey = 'new';
  let queryContextKey = 'draft';
  let queryText = 'SELECT CURRENT_TIMESTAMP;';
  let pending = false;
  const notifications = [];

  const persisted = vscode.getState();
  if (persisted?.draft) {
    draft = persisted.draft;
  }
  if (persisted?.queryText) {
    queryText = persisted.queryText;
  }
  if (persisted?.queryContextKey) {
    queryContextKey = persisted.queryContextKey;
  }

  window.addEventListener('message', (event) => {
    const message = event.data;

    if (message.type === 'state') {
      state = message.state;
      syncDraftWithState();
      pending = false;
      render();
    }

    if (message.type === 'notification') {
      pending = false;
      pushNotification(message.level, message.message);
      render();
    }
  });

  function createBlankDraft(engine = 'postgres') {
    return {
      id: undefined,
      name: '',
      engine,
      host: '',
      port: defaultPorts[engine],
      database: '',
      username: '',
      sslMode: 'disable',
      authMode: 'storedPassword',
      visibleSchemas: [],
      awsSecret: {
        secretId: '',
        profile: '',
        passwordKey: 'password',
        region: ''
      },
      password: ''
    };
  }

  function cloneConnectionToDraft(connection) {
    return {
      id: connection.id,
      name: connection.name,
      engine: connection.engine,
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      sslMode: connection.sslMode,
      authMode: connection.authMode,
      visibleSchemas: [...connection.visibleSchemas],
      awsSecret: connection.awsSecret
        ? {
            secretId: connection.awsSecret.secretId,
            profile: connection.awsSecret.profile,
            passwordKey: connection.awsSecret.passwordKey,
            region: connection.awsSecret.region || ''
          }
        : {
            secretId: '',
            profile: '',
            passwordKey: 'password',
            region: ''
          },
      password: ''
    };
  }

  function syncDraftWithState() {
    const selected = state.connections.find((connection) => connection.id === state.selectedConnectionId);
    const nextKey = selected ? `${selected.id}:${selected.updatedAt}` : 'new';
    const nextQueryContextKey = state.selectedConnectionId || 'draft';

    if (draftSourceKey !== nextKey) {
      draft = selected ? cloneConnectionToDraft(selected) : createBlankDraft();
      draftSourceKey = nextKey;
    }

    if (queryContextKey !== nextQueryContextKey) {
      queryContextKey = nextQueryContextKey;
      queryText = state.currentQuery || defaultQueryForEngine(selected ? selected.engine : draft.engine);
    }

    persistState();
  }

  function setPending(value) {
    pending = value;
    render();
  }

  function send(message) {
    setPending(true);
    vscode.postMessage(message);
  }

  function render() {
    const app = document.getElementById('app');
    const selected = state.connections.find((connection) => connection.id === state.selectedConnectionId);
    const result = state.lastResult;
    const visibleSchemas = draft.visibleSchemas || [];
    const discoveredDatabases = state.discoveredDatabases || [];

    app.innerHTML = `
      <div class="toast-stack">
        ${notifications.map((notification) => `
          <div class="toast ${notification.level}">
            <strong>${notification.level === 'error' ? 'Error' : 'Info'}</strong>
            <div>${escapeHtml(notification.message)}</div>
          </div>
        `).join('')}
      </div>
      <div class="app-shell">
        <aside class="panel sidebar">
          <div class="sidebar-header">
            <div class="eyebrow">SQL Connection Workbench</div>
            <h1 class="sidebar-title">Connections</h1>
            <p class="subtle">Keep credentials secure, choose visible schemas, and move between databases without leaving the editor.</p>
            <div class="sidebar-actions">
              <button class="primary" data-action="newConnection" ${pending ? 'disabled' : ''}>New Connection</button>
              <button data-action="refresh" ${pending ? 'disabled' : ''}>Refresh</button>
            </div>
          </div>
          <div class="connection-list">
            ${state.connections.length
              ? state.connections.map((connection) => `
                <button class="connection-card ${connection.id === state.selectedConnectionId ? 'selected' : ''}" data-connection-id="${connection.id}">
                  <strong>${escapeHtml(connection.name)}</strong>
                  <div class="meta-row">
                    <span class="chip strong">${escapeHtml(engineLabel(connection.engine))}</span>
                    <span class="chip">${connection.authMode === 'awsSecret' ? 'AWS secret' : connection.hasStoredPassword ? 'Stored password' : 'Password missing'}</span>
                  </div>
                  <p>${escapeHtml(connection.host)}:${connection.port} / ${escapeHtml(connection.database)}</p>
                  <div class="chip-row">
                    ${connection.visibleSchemas.length
                      ? connection.visibleSchemas.slice(0, 3).map((schema) => `<span class="chip">${escapeHtml(schema)}</span>`).join('')
                      : '<span class="chip">No schemas selected</span>'}
                    ${connection.visibleSchemas.length > 3 ? `<span class="chip">+${connection.visibleSchemas.length - 3}</span>` : ''}
                  </div>
                </button>
              `).join('')
              : `<div class="empty-state">No saved connections yet. Start with a PostgreSQL, MySQL, or SQL Server endpoint, then decide whether the password is stored directly or pulled from AWS Secrets Manager.</div>`}
          </div>
        </aside>
        <main class="panel main-shell">
          ${pending ? '<div class="busy-mask">Working…</div>' : ''}
          <section class="hero">
            <div class="hero-grid">
              <div>
                <div class="eyebrow">Workspace</div>
                <h2 class="hero-title">${selected ? escapeHtml(selected.name) : 'Create a connection'}</h2>
                <p class="subtle">${selected
                  ? `Connected workflow for ${escapeHtml(engineLabel(selected.engine))} at ${escapeHtml(selected.host)}:${selected.port}.`
                  : 'Build the connection profile, validate it, and then run queries from the same surface.'}</p>
                <div class="chip-row">
                  <span class="chip strong">${escapeHtml(engineLabel(draft.engine))}</span>
                  <span class="chip">${draft.authMode === 'awsSecret' ? 'AWS-backed password' : 'Password in VS Code secret storage'}</span>
                  <span class="chip">${draft.sslMode === 'require' ? 'SSL required' : 'SSL disabled'}</span>
                </div>
              </div>
              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-label">Schemas</div>
                  <div class="stat-value">${visibleSchemas.length || 0}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Rows</div>
                  <div class="stat-value">${result ? result.rowCount : '0'}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Latency</div>
                  <div class="stat-value">${result ? `${result.durationMs}ms` : '—'}</div>
                </div>
              </div>
            </div>
          </section>
          <section class="section">
            <div class="section-header">
              <div>
                <h3 class="section-title">Connection Details</h3>
                <div class="subtle">Define the endpoint, authentication strategy, and explorer scope.</div>
              </div>
              <div class="form-actions">
                <button data-action="discoverDatabases" ${pending ? 'disabled' : ''}>Discover DBs</button>
                <button data-action="testConnection" ${pending ? 'disabled' : ''}>Test</button>
                <button class="primary" data-action="saveConnection" ${pending ? 'disabled' : ''}>Save Connection</button>
                <button class="danger" data-action="deleteConnection" ${!draft.id || pending ? 'disabled' : ''}>Delete</button>
              </div>
            </div>
            <div class="form-grid">
              <div class="field">
                <label for="name">Display name</label>
                <input id="name" value="${escapeAttribute(draft.name)}" placeholder="Production reporting" />
              </div>
              <div class="field">
                <label for="engine">Engine</label>
                <select id="engine">
                  ${renderOptions(['postgres', 'mysql', 'sqlserver'], draft.engine, {
                    postgres: 'PostgreSQL',
                    mysql: 'MySQL',
                    sqlserver: 'SQL Server'
                  })}
                </select>
              </div>
              <div class="field">
                <label for="host">Host</label>
                <input id="host" value="${escapeAttribute(draft.host)}" placeholder="db.example.internal" />
              </div>
              <div class="field">
                <label for="port">Port</label>
                <input id="port" type="number" value="${escapeAttribute(String(draft.port || ''))}" />
              </div>
              <div class="field">
                <label for="database">Database</label>
                <input id="database" value="${escapeAttribute(draft.database)}" placeholder="analytics" />
                <div class="hint">Leave this blank if you want the extension to discover accessible databases and schemas first.</div>
              </div>
              <div class="field">
                <label for="username">Username</label>
                <input id="username" value="${escapeAttribute(draft.username)}" placeholder="readonly_user" />
              </div>
              <div class="field">
                <label for="sslMode">SSL mode</label>
                <select id="sslMode">
                  ${renderOptions(['disable', 'require'], draft.sslMode)}
                </select>
              </div>
              <div class="field">
                <label for="authMode">Password source</label>
                <select id="authMode">
                  ${renderOptions(['storedPassword', 'awsSecret'], draft.authMode, {
                    storedPassword: 'Stored password',
                    awsSecret: 'AWS Secrets Manager'
                  })}
                </select>
              </div>
              <div class="field full auth-block">
                ${draft.authMode === 'storedPassword' ? `
                  <div class="field">
                    <label for="password">Password</label>
                    <input id="password" type="password" value="${escapeAttribute(draft.password || '')}" placeholder="${draft.id ? 'Leave blank to keep the existing password' : 'Enter password'}" />
                    <div class="hint">Stored in VS Code Secret Storage, never in extension settings.</div>
                  </div>
                ` : `
                  <div class="form-grid">
                    <div class="field">
                      <label for="secretId">Secret id or ARN</label>
                      <input id="secretId" value="${escapeAttribute(draft.awsSecret?.secretId || '')}" placeholder="arn:aws:secretsmanager:..." />
                    </div>
                    <div class="field">
                      <label for="profile">AWS profile</label>
                      <input id="profile" value="${escapeAttribute(draft.awsSecret?.profile || '')}" placeholder="engineering-prod" />
                    </div>
                    <div class="field">
                      <label for="passwordKey">Password key in secret</label>
                      <input id="passwordKey" value="${escapeAttribute(draft.awsSecret?.passwordKey || '')}" placeholder="password" />
                    </div>
                    <div class="field">
                      <label for="region">AWS region (optional)</label>
                      <input id="region" value="${escapeAttribute(draft.awsSecret?.region || '')}" placeholder="eu-west-2" />
                    </div>
                  </div>
                  <div class="hint">The extension refreshes AWS-backed passwords automatically and preloads them when the extension activates.</div>
                `}
              </div>
              <div class="field full">
                <label>Visible schemas</label>
                <div class="chip-row">
                  ${visibleSchemas.length
                    ? visibleSchemas.map((schema) => `<span class="chip strong">${escapeHtml(schema)}</span>`).join('')
                    : '<span class="chip">No schemas selected yet</span>'}
                </div>
                <div class="form-actions" style="margin-top: 12px;">
                  <button data-action="chooseSchemas" ${!draft.id || pending ? 'disabled' : ''}>Choose Schemas</button>
                </div>
              </div>
              ${discoveredDatabases.length ? `
                <div class="field full">
                  <label>Accessible databases</label>
                  <div class="hint">Discovered from the current host credentials. Pick one to populate the database field and visible schemas.</div>
                  <div class="discovery-grid">
                    ${discoveredDatabases.map((database) => `
                      <section class="discovery-card ${draft.database === database.name ? 'selected' : ''}">
                        <div class="discovery-head">
                          <strong>${escapeHtml(database.name)}</strong>
                          <button data-discovered-database="${escapeAttribute(database.name)}">${draft.database === database.name ? 'Selected' : 'Use Database'}</button>
                        </div>
                        <div class="chip-row">
                          ${(database.schemas || []).length
                            ? database.schemas.map((schema) => `<span class="chip strong">${escapeHtml(schema)}</span>`).join('')
                            : '<span class="chip">No schemas found</span>'}
                        </div>
                      </section>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          </section>
          <section class="section query-editor">
            <div class="section-header">
              <div>
                <h3 class="section-title">SQL Query</h3>
                <div class="subtle">Use Ctrl/Cmd + Enter to run the current statement against the selected saved connection or the connection draft you are editing.</div>
              </div>
              <div class="query-actions">
                <button class="primary" data-action="runQuery" ${pending ? 'disabled' : ''}>Run Query</button>
              </div>
            </div>
            <textarea id="query" spellcheck="false" placeholder="Write a SQL statement to test the connection or query saved data.">${escapeHtml(queryText || '')}</textarea>
          </section>
          <section class="result-wrap">
            ${renderResult(result)}
          </section>
        </main>
      </div>
    `;

    wireEvents();
  }

  function wireEvents() {
    const connectionButtons = document.querySelectorAll('[data-connection-id]');
    for (const button of connectionButtons) {
      button.addEventListener('click', () => {
        send({
          type: 'selectConnection',
          connectionId: button.getAttribute('data-connection-id')
        });
      });
    }

    bindValue('name', (value) => { draft.name = value; persistState(); });
    bindValue('host', (value) => { draft.host = value; persistState(); });
    bindValue('database', (value) => { draft.database = value; persistState(); });
    bindValue('username', (value) => { draft.username = value; persistState(); });
    bindValue('port', (value) => { draft.port = Number(value); persistState(); });
    bindValue('sslMode', (value) => { draft.sslMode = value; persistState(); });
    bindValue('authMode', (value) => {
      draft.authMode = value;
      if (value === 'awsSecret' && !draft.awsSecret) {
        draft.awsSecret = { secretId: '', profile: '', passwordKey: 'password', region: '' };
      }
      persistState();
      render();
    });
    bindValue('engine', (value) => {
      const previousPort = draft.port;
      const previousDefaultPort = defaultPorts[draft.engine];
      draft.engine = value;
      if (!previousPort || previousPort === previousDefaultPort) {
        draft.port = defaultPorts[value];
      }
      if (queryContextKey === 'draft' && !queryText.trim()) {
        queryText = defaultQueryForEngine(draft.engine);
      }
      persistState();
      render();
    });
    bindValue('password', (value) => { draft.password = value; persistState(); });
    bindValue('secretId', (value) => { draft.awsSecret.secretId = value; persistState(); });
    bindValue('profile', (value) => { draft.awsSecret.profile = value; persistState(); });
    bindValue('passwordKey', (value) => { draft.awsSecret.passwordKey = value; persistState(); });
    bindValue('region', (value) => { draft.awsSecret.region = value; persistState(); });

    const query = document.getElementById('query');
    if (query) {
      query.addEventListener('input', () => {
        queryText = query.value;
        persistState();
      });
      query.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          runQuery();
        }
      });
    }

    bindAction('newConnection', () => {
      draft = createBlankDraft();
      draftSourceKey = 'new';
      queryContextKey = 'draft';
      queryText = defaultQueryForEngine(draft.engine);
      persistState();
      send({ type: 'newConnection' });
    });

    bindAction('refresh', () => {
      send({ type: 'ready' });
    });

    bindAction('saveConnection', () => {
      send({ type: 'saveConnection', draft });
    });

    bindAction('testConnection', () => {
      send({ type: 'testConnection', draft });
    });

    bindAction('discoverDatabases', () => {
      send({ type: 'discoverDatabases', draft });
    });

    bindAction('deleteConnection', () => {
      if (!draft.id) {
        return;
      }

      send({ type: 'deleteConnection', connectionId: draft.id });
    });

    bindAction('chooseSchemas', () => {
      if (!draft.id) {
        return;
      }

      send({ type: 'chooseSchemas', connectionId: draft.id });
    });

    bindAction('runQuery', runQuery);

    const discoveredButtons = document.querySelectorAll('[data-discovered-database]');
    for (const button of discoveredButtons) {
      button.addEventListener('click', () => {
        const database = state.discoveredDatabases.find((entry) => entry.name === button.getAttribute('data-discovered-database'));
        if (!database) {
          return;
        }

        draft.database = database.name;
        draft.visibleSchemas = [...database.schemas];
        persistState();
        render();
      });
    }
  }

  function runQuery() {
    const query = document.getElementById('query');
    queryText = query ? query.value : '';
    persistState();

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
  }

  function persistState() {
    vscode.setState({ draft, queryText, queryContextKey });
  }

  function bindValue(id, onChange) {
    const element = document.getElementById(id);
    if (!element) {
      return;
    }

    element.addEventListener('input', () => {
      onChange(element.value);
    });
    element.addEventListener('change', () => {
      onChange(element.value);
    });
  }

  function bindAction(action, handler) {
    const element = document.querySelector(`[data-action="${action}"]`);
    if (!element) {
      return;
    }

    element.addEventListener('click', handler);
  }

  function pushNotification(level, message) {
    notifications.unshift({ level, message });
    notifications.splice(3);

    window.clearTimeout(pushNotification.timeoutId);
    pushNotification.timeoutId = window.setTimeout(() => {
      notifications.pop();
      render();
    }, 5000);
  }

  function renderOptions(values, selectedValue, labels = {}) {
    return values.map((value) => {
      const label = labels[value] || value;
      const selected = value === selectedValue ? 'selected' : '';
      return `<option value="${escapeAttribute(value)}" ${selected}>${escapeHtml(label)}</option>`;
    }).join('');
  }

  function engineLabel(engine) {
    return {
      postgres: 'PostgreSQL',
      mysql: 'MySQL',
      sqlserver: 'SQL Server'
    }[engine] || engine;
  }

  function defaultQueryForEngine(engine) {
    if (engine === 'mysql') {
      return 'SELECT NOW() AS current_timestamp;';
    }

    if (engine === 'sqlserver') {
      return 'SELECT SYSDATETIME() AS current_timestamp;';
    }

    return 'SELECT CURRENT_TIMESTAMP;';
  }

  function renderResult(result) {
    if (!result) {
      return `<div class="empty-state">Run a query to see tabular results, row counts, and execution timing.</div>`;
    }

    if (!result.columns.length && !result.rows.length) {
      return `
        <div class="empty-state">
          <strong>${escapeHtml(result.message)}</strong>
          <div class="subtle">No row set was returned.</div>
        </div>
      `;
    }

    return `
      <table class="result-table">
        <thead>
          <tr>${result.columns.map((column) => `<th>${escapeHtml(column.name)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${result.rows.map((row) => `
            <tr>
              ${result.columns.map((column) => `<td>${formatValue(row[column.name])}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function formatValue(value) {
    if (value === null || typeof value === 'undefined') {
      return '<span class="subtle">null</span>';
    }

    if (typeof value === 'object') {
      return `<code>${escapeHtml(JSON.stringify(value))}</code>`;
    }

    return escapeHtml(String(value));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value ?? '');
  }

  render();
  persistState();
  vscode.postMessage({ type: 'ready' });
})();
