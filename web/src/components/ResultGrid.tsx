import { Order, QueryExecutionResult } from '../lib/protocol';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";

interface ResultGridProps {
  result?: QueryExecutionResult;
  emptyMessage: string;
  errorMessage?: string;
  onSort?: (columnName: string, direction?: Order) => void
}

const sortCycle: Array<Order | undefined> = [
  undefined,
  Order.Ascending,
  Order.Descending,
];

export function ResultGrid({ result, emptyMessage, errorMessage, onSort }: ResultGridProps) {
  if (errorMessage) {
    return (
      <section className="result-panel">
        <div className="empty-state">
          <strong>Unable to load data</strong>
          <div>{errorMessage}</div>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="result-panel">
        <div className="empty-state">{emptyMessage}</div>
      </section>
    );
  }

  if (!result.columns.length && !result.rows.length) {
    return (
      <section className="result-panel">
        <div className="empty-state">
          <strong>{result.message}</strong>
          <div>No row set was returned.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="result-panel">
      <div className="result-meta">
        <strong>{result.message}</strong>
        <span>{result.rowCount} row(s)</span>
        <span>{result.durationMs} ms</span>
      </div>
      <div className="table-scroll">
        <table className="result-table">
          <thead>
            <tr>
              {result.columns.map((column) => (
                <th key={column.name} onClick={() => {
                  const index = sortCycle.findIndex((x) => x === column.sort);
                  const next =
                    index === -1 || index === sortCycle.length - 1
                      ? sortCycle[0]
                      : sortCycle[index + 1];

                  onSort?.(column.name, next);
                }}>{column.name}
                  {column.sort != undefined && (column.sort === Order.Descending
                    ? <FontAwesomeIcon icon={faChevronDown} />
                    : <FontAwesomeIcon icon={faChevronUp} />)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {result.columns.map((column) => (
                  <td key={column.name}>{formatCellValue(row[column.name])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}
