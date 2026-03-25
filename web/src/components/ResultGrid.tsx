import { Order, QueryExecutionResult } from "../lib/protocol";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import {
  VSCodeDataGrid,
  VSCodeDataGridCell,
  VSCodeDataGridRow,
  VSCodeProgressRing,
} from "@vscode/webview-ui-toolkit/react";

interface ResultGridProps {
  result?: QueryExecutionResult;
  emptyMessage: string;
  errorMessage?: string;
  pending?: boolean;
  onSort?: (columnName: string, direction?: Order) => void;
}

const sortCycle: Array<Order | undefined> = [
  undefined,
  Order.Ascending,
  Order.Descending,
];

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

export function ResultGrid({
  result,
  emptyMessage,
  errorMessage,
  onSort,
  pending,
}: ResultGridProps) {
  if (errorMessage) {
    return (
      <section className="overflow-hidden rounded-3xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_92%,transparent)]">
        <div className="px-4 py-6 text-center text-[var(--vscode-descriptionForeground)]">
          <strong>Unable to load data</strong>
          <div>{errorMessage}</div>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="overflow-hidden rounded-3xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_92%,transparent)]">
        <div className="px-4 py-6 text-center text-[var(--vscode-descriptionForeground)]">
          {emptyMessage}
        </div>
      </section>
    );
  }

  if (!result.columns.length && !result.rows.length) {
    return (
      <section className="overflow-hidden rounded-3xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_92%,transparent)]">
        <div className="px-4 py-6 text-center text-[var(--vscode-descriptionForeground)]">
          <strong>{result.message}</strong>
          <div>No row set was returned.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_92%,transparent)]">
      <div className="flex flex-wrap gap-3 border-b border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] px-4 py-4">
        <strong>{result.message}</strong>
        <span>{result.rowCount} row(s)</span>
        <span>{result.durationMs} ms</span>
      </div>

      <div
        className="w-full max-h-125 overflow-auto"
        style={{ minHeight: pending ? "400px" : "auto" }}
      >
        <VSCodeDataGrid
          gridTemplateColumns={`repeat(${result.columns.length}, minmax(140px, 1fr))`}
          className="w-full"
        >
          <VSCodeDataGridRow rowType="sticky-header">
            {result.columns.map((column, i) => (
              <VSCodeDataGridCell
                cellType="columnheader"
                gridColumn={(i + 1).toString()}
                key={column.name}
                className="sticky top-0 cursor-pointer border-b border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[color-mix(in_srgb,var(--vscode-sideBar-background)_94%,transparent)] px-3.5 py-3 text-left text-[11px] uppercase tracking-[0.08em] whitespace-nowrap"
                onClick={() => {
                  const index = sortCycle.findIndex((x) => x === column.sort);
                  const next =
                    index === -1 || index === sortCycle.length - 1
                      ? sortCycle[0]
                      : sortCycle[index + 1];
                  onSort?.(column.name, next);
                }}
              >
                <span className="block truncate">

                  {column.name}
                  {column.sort !== undefined &&
                    (column.sort === Order.Descending ? (
                      <FontAwesomeIcon icon={faChevronDown} />
                    ) : (
                      <FontAwesomeIcon icon={faChevronUp} />
                    ))}
                </span>
              </VSCodeDataGridCell>
            ))}
          </VSCodeDataGridRow>
          {pending ? (
            <div className="w-full flex justify-center py-6">
              <VSCodeProgressRing className="h-12 w-12" />
            </div>
          ) : (
            result.rows.map((row, rowIndex) => (
              <VSCodeDataGridRow key={rowIndex} rowIndex={rowIndex}>
                {result.columns.map((column, columnIndex) => {
                  const text = formatCellValue(row[column.name]);

                  return (
                    <VSCodeDataGridCell
                      key={column.name}
                      gridColumn={(columnIndex + 1).toString()}
                      className="border-b border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] px-3.5 py-3 align-top cursor-copy"
                      onClick={() => copyText(text)}
                      title="Click to copy"
                    >
                      <span
                        style={{ userSelect: "text", WebkitUserSelect: "text" }}
                      >
                        {text}
                      </span>
                    </VSCodeDataGridCell>
                  );
                })}
              </VSCodeDataGridRow>
            ))
          )}
        </VSCodeDataGrid>
      </div>
    </section>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}
