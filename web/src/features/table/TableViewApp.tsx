import { useEffect, useMemo, useState } from 'react';
import { NotificationStack } from '../../components/NotificationStack';
import { ResultGrid } from '../../components/ResultGrid';
import {
  IncomingMessage,
  NotificationItem,
  Order,
  TableFilterDefinition,
  TableFilterOperator,
  TableOutgoingMessage,
  TableViewState
} from '../../lib/protocol';
import { getEngineLabel } from '../../lib/workbenchDraft';
import { getVsCodeApi } from '../../lib/vscode';
import { VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"

interface FilterDraft extends TableFilterDefinition {
  id: number;
}

const filterOperatorOptions: Array<{ value: TableFilterOperator; label: string; requiresValue: boolean }> = [
  { value: 'equals', label: 'Equals', requiresValue: true },
  { value: 'notEquals', label: 'Not equals', requiresValue: true },
  { value: 'contains', label: 'Contains', requiresValue: true },
  { value: 'startsWith', label: 'Starts with', requiresValue: true },
  { value: 'endsWith', label: 'Ends with', requiresValue: true },
  { value: 'greaterThan', label: 'Greater than', requiresValue: true },
  { value: 'greaterThanOrEqual', label: 'Greater than or equal', requiresValue: true },
  { value: 'lessThan', label: 'Less than', requiresValue: true },
  { value: 'lessThanOrEqual', label: 'Less than or equal', requiresValue: true },
  { value: 'isNull', label: 'Is null', requiresValue: false },
  { value: 'isNotNull', label: 'Is not null', requiresValue: false }
];

export function TableViewApp() {
  const vscode = useMemo(() => getVsCodeApi<never>(), []);
  const [state, setState] = useState<TableViewState | undefined>();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [pending, setPending] = useState(false);
  const [sqlText, setSqlText] = useState('');
  const [filters, setFilters] = useState<FilterDraft[]>([]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<IncomingMessage>) => {
      const message = event.data;
      if (message.type === 'tableState') {
        setState(message.state);
        setSqlText(message.state.currentSql);
        setFilters(message.state.filters.map((filter, index) => ({
          id: index + 1,
          ...filter
        })));
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

  const addFilter = () => {
    setFilters((current) => [
      ...current,
      {
        id: Date.now(),
        columnName: state?.columns[0]?.name ?? '',
        operator: 'equals',
        value: ''
      }
    ]);
  };

  const updateFilter = (id: number, next: Partial<FilterDraft>) => {
    setFilters((current) => current.map((filter) => (filter.id === id ? { ...filter, ...next } : filter)));
  };

  const removeFilter = (id: number) => {
    setFilters((current) => current.filter((filter) => filter.id !== id));
  };

  const applyFilters = () => {
    send({
      type: 'applyFilters',
      filters: filters.map(({ id, ...filter }) => filter)
    });
  };

  const onSort = (columnName: string, direction?: Order) => {
    send({
      type: 'applySort',
      columnName: columnName,
      direction: direction
    })
  }

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
            <button disabled={!state || pending} onClick={() => send({ type: 'resetSql' })}>
              Reset SQL
            </button>
            <button className="primary" disabled={!state || pending} onClick={() => send({ type: 'runQuery', sql: sqlText })}>
              Run Query
            </button>
            <button
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
              <div className="eyebrow">Filters</div>
              <h2 className="section-title">Quick filters</h2>
              <p className="subtle">Applying filters regenerates the base preview query for this table.</p>
            </div>
            <div className="button-row">
              <button disabled={!state || pending} onClick={addFilter}>
                Add Filter
              </button>
              <button className="primary" disabled={!state || pending || filters.length === 0} onClick={applyFilters}>
                Apply Filters
              </button>
            </div>
          </div>
          {filters.length === 0 ? (
            <div className="empty-state compact-empty">No filters yet. Add one to build a table query quickly.</div>
          ) : (
            <div className="filter-list">
              {filters.map((filter) => {
                const operatorConfig = filterOperatorOptions.find((option) => option.value === filter.operator) ?? filterOperatorOptions[0];
                return (
                  <div key={filter.id} className="filter-row">
                    <select
                      aria-label="Filter column"
                      value={filter.columnName}
                      onChange={(event) => updateFilter(filter.id, { columnName: event.target.value })}
                    >
                      {state?.columns.map((column) => (
                        <option key={column.name} value={column.name}>
                          {column.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter operator"
                      value={filter.operator}
                      onChange={(event) => updateFilter(filter.id, { operator: event.target.value as TableFilterOperator })}
                    >
                      {filterOperatorOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Filter value"
                      disabled={!operatorConfig.requiresValue}
                      placeholder={operatorConfig.requiresValue ? 'Value' : 'No value needed'}
                      value={filter.value ?? ''}
                      onChange={(event) => updateFilter(filter.id, { value: event.target.value })}
                    />
                    <button className="danger" disabled={pending} onClick={() => removeFilter(filter.id)}>
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel section">
          <div className="section-header">
            <div>
              <div className="eyebrow">SQL</div>
              <h2 className="section-title">Editable query</h2>
              <p className="subtle">Adjust the generated query directly, then run it again.</p>
            </div>
          </div>
          <textarea
            aria-label="Table SQL"
            className="query-textarea"
            spellCheck={false}
            value={sqlText}
            onChange={(event) => setSqlText(event.target.value)}
          />
          {state ? <pre className="sql-preview">Base query:{`\n`}{state.previewSql}</pre> : null}
        </section>

        <ResultGrid
          result={state?.result}
          errorMessage={state?.errorMessage}
          emptyMessage="The table preview is loading."
          onSort={onSort}
        />
      </div>
    </div>
  );
}
