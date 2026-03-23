import { KeyboardEvent } from 'react';

interface QueryEditorProps {
  queryText: string;
  pending: boolean;
  onQueryChange(value: string): void;
  onRun(): void;
}

export function QueryEditor({ queryText, pending, onQueryChange, onRun }: QueryEditorProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      onRun();
    }
  };

  return (
    <section className="panel section">
      <div className="section-header">
        <div>
          <div className="eyebrow">Query</div>
          <h2 className="section-title">SQL Editor</h2>
          <p className="subtle">Run the current statement with Ctrl/Cmd + Enter.</p>
        </div>
        <div className="button-row">
          <button className="primary" disabled={pending} onClick={onRun}>
            Run Query
          </button>
        </div>
      </div>

      <textarea
        aria-label="SQL Query"
        className="query-textarea"
        spellCheck={false}
        value={queryText}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </section>
  );
}
