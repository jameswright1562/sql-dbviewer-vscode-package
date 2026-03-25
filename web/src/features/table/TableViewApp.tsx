import { useEffect, useMemo, useState } from "react";
import { NotificationStack } from "../../components/NotificationStack";
import { ResultGrid } from "../../components/ResultGrid";
import {
  IncomingMessage,
  NotificationItem,
  Order,
  TableFilterDefinition,
  TableFilterOperator,
  TableOutgoingMessage,
  TableViewState,
} from "../../lib/protocol";
import { getEngineLabel } from "../../lib/workbenchDraft";
import { getVsCodeApi } from "../../lib/vscode";
import {
  VSCodeButton,
  VSCodeDropdown,
  VSCodeOption,
  VSCodeTextArea,
  VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react";

interface FilterDraft extends TableFilterDefinition {
  id: number;
}

const filterOperatorOptions: Array<{
  value: TableFilterOperator;
  label: string;
  requiresValue: boolean;
}> = [
  { value: "equals", label: "Equals", requiresValue: true },
  { value: "notEquals", label: "Not equals", requiresValue: true },
  { value: "contains", label: "Contains", requiresValue: true },
  { value: "startsWith", label: "Starts with", requiresValue: true },
  { value: "endsWith", label: "Ends with", requiresValue: true },
  { value: "greaterThan", label: "Greater than", requiresValue: true },
  {
    value: "greaterThanOrEqual",
    label: "Greater than or equal",
    requiresValue: true,
  },
  { value: "lessThan", label: "Less than", requiresValue: true },
  {
    value: "lessThanOrEqual",
    label: "Less than or equal",
    requiresValue: true,
  },
  { value: "isNull", label: "Is null", requiresValue: false },
  { value: "isNotNull", label: "Is not null", requiresValue: false },
];

export function TableViewApp() {
  const vscode = useMemo(() => getVsCodeApi<never>(), []);
  const [state, setState] = useState<TableViewState | undefined>();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [pending, setPending] = useState(false);
  const [sqlText, setSqlText] = useState("");
  const [filters, setFilters] = useState<FilterDraft[]>([]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<IncomingMessage>) => {
      const message = event.data;
      if (message.type === "tableState") {
        setState(message.state);
        setSqlText(message.state.currentSql);
        setFilters(
          message.state.filters.map((filter, index) => ({
            id: index + 1,
            ...filter,
          })),
        );
        setPending(false);
        return;
      }

      if (message.type === "notification") {
        setPending(false);
        setNotifications((current) =>
          [
            {
              id: current.length + Date.now(),
              level: message.level,
              message: message.message,
            },
            ...current,
          ].slice(0, 3),
        );
      }
    };

    window.addEventListener("message", onMessage);
    setPending(true);
    vscode.postMessage({ type: "ready" } satisfies TableOutgoingMessage);

    return () => {
      window.removeEventListener("message", onMessage);
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
        columnName: state?.columns[0]?.name ?? "",
        operator: "equals",
        value: "",
      },
    ]);
  };

  const updateFilter = (id: number, next: Partial<FilterDraft>) => {
    setFilters((current) =>
      current.map((filter) =>
        filter.id === id ? { ...filter, ...next } : filter,
      ),
    );
  };

  const removeFilter = (id: number) => {
    setFilters((current) => current.filter((filter) => filter.id !== id));
  };

  const applyFilters = () => {
    send({
      type: "applyFilters",
      filters: filters.map(({ id, ...filter }) => filter),
    });
  };

  const onSort = (columnName: string, direction?: Order) => {
    send({
      type: "applySort",
      columnName: columnName,
      direction: direction,
    });
  };

  return (
    <div className="min-h-screen p-4">
      <NotificationStack notifications={notifications} />
      <div className="grid gap-4">
        <section className="relative overflow-hidden rounded-3xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--vscode-sideBar-background)_88%,transparent)_0%,color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_96%,transparent)_100%)] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur-[14px]">
          <div className="mb-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--vscode-descriptionForeground)]">
            Table Preview
          </div>
          <h1 className="m-0 text-[28px] leading-[1.1]">
            {state ? `${state.schema}.${state.table}` : "Loading table preview"}
          </h1>
          <p className="text-[var(--vscode-descriptionForeground)]">
            {state
              ? `${state.connectionName} · ${getEngineLabel(state.engine)} · ${state.database}`
              : "Fetching rows from the selected table."}
          </p>
          <div className="flex flex-wrap gap-2">
            <VSCodeButton
              disabled={!state || pending}
              onClick={() => state && send({ type: "refresh" })}
            >
              Refresh
            </VSCodeButton>
            <VSCodeButton
              disabled={!state || pending}
              onClick={() => send({ type: "resetSql" })}
            >
              Reset SQL
            </VSCodeButton>
            <VSCodeButton
              appearance="primary"
              disabled={!state || pending}
              onClick={() => send({ type: "runQuery", sql: sqlText })}
            >
              Run Query
            </VSCodeButton>
            <VSCodeButton
              disabled={!state || pending}
              onClick={() =>
                state &&
                send({
                  type: "openWorkbench",
                  connectionId: state.connectionId,
                })
              }
            >
              Open Workbench
            </VSCodeButton>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--vscode-sideBar-background)_88%,transparent)_0%,color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_96%,transparent)_100%)] p-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur-[14px]">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--vscode-descriptionForeground)]">
                Filters
              </div>
              <h2 className="m-0 text-lg">Quick filters</h2>
              <p className="text-[var(--vscode-descriptionForeground)]">
                Applying filters regenerates the base preview query for this
                table.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <VSCodeButton disabled={!state || pending} onClick={addFilter}>
                Add Filter
              </VSCodeButton>
              <VSCodeButton
                appearance="primary"
                disabled={!state || pending || filters.length === 0}
                onClick={applyFilters}
              >
                Apply Filters
              </VSCodeButton>
            </div>
          </div>
          {filters.length === 0 ? (
            <div className="px-0 py-3 text-[var(--vscode-descriptionForeground)]">
              No filters yet. Add one to build a table query quickly.
            </div>
          ) : (
            <div className="grid gap-2.5">
              {filters.map((filter) => {
                const operatorConfig =
                  filterOperatorOptions.find(
                    (option) => option.value === filter.operator,
                  ) ?? filterOperatorOptions[0];
                return (
                  <div
                    key={filter.id}
                    className="grid items-center gap-2.5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]"
                  >
                    <VSCodeDropdown
                      aria-label="Filter column"
                      value={filter.columnName}
                      onChange={(event) =>
                        updateFilter(filter.id, {
                          columnName: (event.target as HTMLSelectElement).value,
                        })
                      }
                    >
                      {state?.columns.map((column) => (
                        <VSCodeOption key={column.name} value={column.name}>
                          {column.name}
                        </VSCodeOption>
                      ))}
                    </VSCodeDropdown>
                    <VSCodeDropdown
                      aria-label="Filter operator"
                      value={filter.operator}
                      onChange={(event) =>
                        updateFilter(filter.id, {
                          operator: (event.target as HTMLSelectElement)
                            .value as TableFilterOperator,
                        })
                      }
                    >
                      {filterOperatorOptions.map((option) => (
                        <VSCodeOption key={option.value} value={option.value}>
                          {option.label}
                        </VSCodeOption>
                      ))}
                    </VSCodeDropdown>
                    <VSCodeTextField
                      aria-label="Filter value"
                      disabled={!operatorConfig.requiresValue}
                      placeholder={
                        operatorConfig.requiresValue
                          ? "Value"
                          : "No value needed"
                      }
                      value={filter.value ?? ""}
                      onInput={(event) =>
                        updateFilter(filter.id, {
                          value: (event.target as HTMLInputElement).value,
                        })
                      }
                    />
                    <VSCodeButton
                      className="danger"
                      disabled={pending}
                      onClick={() => removeFilter(filter.id)}
                    >
                      Remove
                    </VSCodeButton>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--vscode-sideBar-background)_88%,transparent)_0%,color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_96%,transparent)_100%)] p-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur-[14px]">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--vscode-descriptionForeground)]">
                SQL
              </div>
              <h2 className="m-0 text-lg">Editable query</h2>
              <p className="text-[var(--vscode-descriptionForeground)]">
                Adjust the generated query directly, then run it again.
              </p>
            </div>
          </div>
          <VSCodeTextArea
            aria-label="Table SQL"
            className="w-full"
            spellCheck={false}
            value={sqlText}
            onInput={(event) =>
              setSqlText((event.target as HTMLTextAreaElement).value)
            }
          />
          {state ? (
            <pre className="m-0 mt-3 w-full whitespace-pre-wrap rounded-xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_88%,transparent)] p-3.5">
              Base query:{`\n`}
              {state.previewSql}
            </pre>
          ) : null}
        </section>

        <ResultGrid
          result={state?.result}
          pending={pending}
          errorMessage={state?.errorMessage}
          emptyMessage="The table preview is loading."
          onSort={onSort}
        />
      </div>
    </div>
  );
}
