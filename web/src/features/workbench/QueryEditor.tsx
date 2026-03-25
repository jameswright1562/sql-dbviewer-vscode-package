import { KeyboardEvent } from "react";
import { VSCodeButton, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react";

interface QueryEditorProps {
  queryText: string;
  pending: boolean;
  onQueryChange(value: string): void;
  onRun(): void;
}

export function QueryEditor({
  queryText,
  pending,
  onQueryChange,
  onRun,
}: QueryEditorProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onRun();
    }
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--vscode-sideBar-background)_88%,transparent)_0%,color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_96%,transparent)_100%)] p-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur-[14px]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--vscode-descriptionForeground)]">
            Query
          </div>
          <h2 className="m-0 text-lg">SQL Editor</h2>
          <p className="text-[var(--vscode-descriptionForeground)]">
            Run the current statement with Ctrl/Cmd + Enter.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <VSCodeButton appearance="primary" disabled={pending} onClick={onRun}>
            Run Query
          </VSCodeButton>
        </div>
      </div>

      <VSCodeTextArea
        aria-label="SQL Query"
        className="w-full"
        spellCheck={false}
        value={queryText}
        onInput={(event) =>
          onQueryChange((event.target as HTMLTextAreaElement).value)
        }
        onKeyDown={handleKeyDown}
      />
    </section>
  );
}
