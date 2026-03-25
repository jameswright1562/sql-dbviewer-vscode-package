import { ChangeEvent, ReactNode } from "react";
import {
  VSCodeButton,
  VSCodeDropdown,
  VSCodeOption,
  VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react";
import { ConnectionDraft, DiscoveredDatabase } from "../../lib/protocol";
import { defaultPorts, getEngineLabel } from "../../lib/workbenchDraft";

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
  onChooseSchemas,
}: ConnectionFormProps) {
  const updateDraft = <Key extends keyof ConnectionDraft>(
    key: Key,
    value: ConnectionDraft[Key],
  ) => {
    onDraftChange({
      ...draft,
      [key]: value,
    });
  };

  const updateAwsSecret = (
    key: "secretId" | "profile" | "passwordKey" | "region",
    value: string,
  ) => {
    onDraftChange({
      ...draft,
      awsSecret: {
        secretId: draft.awsSecret?.secretId ?? "",
        profile: draft.awsSecret?.profile ?? "",
        passwordKey: draft.awsSecret?.passwordKey ?? "password",
        region: draft.awsSecret?.region ?? "",
        [key]: value,
      },
    });
  };

  const handleEngineChange = (event: ChangeEvent<HTMLElement>) => {
    const nextEngine = (event.target as HTMLSelectElement)
      .value as ConnectionDraft["engine"];
    const nextPort =
      draft.port === defaultPorts[draft.engine]
        ? defaultPorts[nextEngine]
        : draft.port;
    onDraftChange({
      ...draft,
      engine: nextEngine,
      port: nextPort,
    });
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--vscode-sideBar-background)_88%,transparent)_0%,color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_96%,transparent)_100%)] p-[18px] shadow-[0_18px_40px_rgba(0,0,0,0.16)] backdrop-blur-[14px]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--vscode-descriptionForeground)]">
            Connection
          </div>
          <h2 className="m-0 text-lg">Connection Details</h2>
          <p className="text-[var(--vscode-descriptionForeground)]">
            Save a reusable endpoint, test it, and control the schemas that
            appear in the explorer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <VSCodeButton disabled={pending} onClick={onDiscoverDatabases}>
            Discover DBs
          </VSCodeButton>
          <VSCodeButton disabled={pending} onClick={onTestConnection}>
            Test
          </VSCodeButton>
          <VSCodeButton
            appearance="primary"
            disabled={pending}
            onClick={onSaveConnection}
          >
            Save
          </VSCodeButton>
          <VSCodeButton
            className="danger"
            disabled={!draft.id || pending}
            onClick={onDeleteConnection}
          >
            Delete
          </VSCodeButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <Field label="Display name">
          <VSCodeTextField
            aria-label="Display name"
            value={draft.name}
            onInput={(event) =>
              updateDraft("name", (event.target as HTMLInputElement).value)
            }
          />
        </Field>
        <Field label="Engine">
          <VSCodeDropdown
            aria-label="Engine"
            value={draft.engine}
            onChange={handleEngineChange}
          >
            <VSCodeOption value="postgres">
              {getEngineLabel("postgres")}
            </VSCodeOption>
            <VSCodeOption value="mysql">{getEngineLabel("mysql")}</VSCodeOption>
            <VSCodeOption value="sqlserver">
              {getEngineLabel("sqlserver")}
            </VSCodeOption>
          </VSCodeDropdown>
        </Field>
        <Field label="Host">
          <VSCodeTextField
            aria-label="Host"
            value={draft.host}
            onInput={(event) =>
              updateDraft("host", (event.target as HTMLInputElement).value)
            }
          />
        </Field>
        <Field label="Port">
          <VSCodeTextField
            aria-label="Port"
            type="number"
            value={String(draft.port)}
            onInput={(event) =>
              updateDraft(
                "port",
                Number((event.target as HTMLInputElement).value),
              )
            }
          />
        </Field>
        <Field label="Database">
          <VSCodeTextField
            aria-label="Database"
            value={draft.database}
            onInput={(event) =>
              updateDraft("database", (event.target as HTMLInputElement).value)
            }
          />
        </Field>
        <Field label="Username">
          <VSCodeTextField
            aria-label="Username"
            value={draft.username}
            onInput={(event) =>
              updateDraft("username", (event.target as HTMLInputElement).value)
            }
          />
        </Field>
        <Field label="SSL mode">
          <VSCodeDropdown
            aria-label="SSL mode"
            value={draft.sslMode}
            onChange={(event) =>
              updateDraft(
                "sslMode",
                (event.target as HTMLSelectElement)
                  .value as ConnectionDraft["sslMode"],
              )
            }
          >
            <VSCodeOption value="disable">disable</VSCodeOption>
            <VSCodeOption value="require">require</VSCodeOption>
          </VSCodeDropdown>
        </Field>
        <Field label="Password source">
          <VSCodeDropdown
            aria-label="Password source"
            value={draft.authMode}
            onChange={(event) =>
              updateDraft(
                "authMode",
                (event.target as HTMLSelectElement)
                  .value as ConnectionDraft["authMode"],
              )
            }
          >
            <VSCodeOption value="storedPassword">Stored password</VSCodeOption>
            <VSCodeOption value="awsSecret">AWS Secrets Manager</VSCodeOption>
          </VSCodeDropdown>
        </Field>

        <div className="grid gap-1.5 md:col-span-2">
          <label>Credentials</label>
          {draft.authMode === "storedPassword" ? (
            <div className="grid gap-3">
              <VSCodeTextField
                aria-label="Credentials"
                type="password"
                value={draft.password ?? ""}
                placeholder={
                  draft.id
                    ? "Leave blank to keep the existing password"
                    : "Enter password"
                }
                onInput={(event) =>
                  updateDraft(
                    "password",
                    (event.target as HTMLInputElement).value,
                  )
                }
              />
              <span className="text-[var(--vscode-descriptionForeground)]">
                Stored in VS Code Secret Storage.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <Field label="Secret id / ARN">
                <VSCodeTextField
                  aria-label="Secret id / ARN"
                  value={draft.awsSecret?.secretId ?? ""}
                  onInput={(event) =>
                    updateAwsSecret(
                      "secretId",
                      (event.target as HTMLInputElement).value,
                    )
                  }
                />
              </Field>
              <Field label="AWS profile">
                <VSCodeTextField
                  aria-label="AWS profile"
                  value={draft.awsSecret?.profile ?? ""}
                  onInput={(event) =>
                    updateAwsSecret(
                      "profile",
                      (event.target as HTMLInputElement).value,
                    )
                  }
                />
              </Field>
              <Field label="Password key">
                <VSCodeTextField
                  aria-label="Password key"
                  value={draft.awsSecret?.passwordKey ?? ""}
                  onInput={(event) =>
                    updateAwsSecret(
                      "passwordKey",
                      (event.target as HTMLInputElement).value,
                    )
                  }
                />
              </Field>
              <Field label="Region">
                <VSCodeTextField
                  aria-label="Region"
                  value={draft.awsSecret?.region ?? ""}
                  onInput={(event) =>
                    updateAwsSecret(
                      "region",
                      (event.target as HTMLInputElement).value,
                    )
                  }
                />
              </Field>
            </div>
          )}
        </div>

        <div className="grid gap-1.5 md:col-span-2">
          <label>Visible schemas</label>
          <div className="flex flex-wrap gap-2">
            {draft.visibleSchemas.length ? (
              draft.visibleSchemas.map((schema) => (
                <span
                  key={schema}
                  className="inline-flex items-center rounded-full border border-[var(--vscode-focusBorder,var(--vscode-textLink-foreground))] bg-[var(--vscode-badge-background,var(--vscode-button-secondaryBackground,var(--vscode-input-background)))] px-2.5 py-1 text-xs text-[var(--vscode-badge-foreground,var(--vscode-foreground))]"
                >
                  {schema}
                </span>
              ))
            ) : (
              <span className="inline-flex items-center rounded-full border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[var(--vscode-badge-background,var(--vscode-button-secondaryBackground,var(--vscode-input-background)))] px-2.5 py-1 text-xs text-[var(--vscode-badge-foreground,var(--vscode-foreground))]">
                No schemas selected yet
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <VSCodeButton
              disabled={!draft.id || pending}
              onClick={onChooseSchemas}
            >
              Choose Schemas
            </VSCodeButton>
          </div>
        </div>

        {discoveredDatabases.length > 0 ? (
          <div className="grid gap-1.5 md:col-span-2">
            <label>Accessible databases</label>
            <div className="grid gap-3">
              {discoveredDatabases.map((database) => (
                <section
                  key={database.name}
                  className={`rounded-2xl border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[color-mix(in_srgb,var(--vscode-editorWidget-background,var(--vscode-editor-background))_86%,transparent)] p-3.5 ${draft.database === database.name ? "border-[var(--vscode-focusBorder,var(--vscode-textLink-foreground))] bg-[color-mix(in_srgb,var(--vscode-list-activeSelectionBackground,var(--vscode-list-hoverBackground))_78%,transparent)]" : ""}`}
                >
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
                    <strong>{database.name}</strong>
                    <VSCodeButton
                      disabled={pending}
                      onClick={() =>
                        onDraftChange({
                          ...draft,
                          database: database.name,
                          visibleSchemas: [...database.schemas],
                        })
                      }
                    >
                      {draft.database === database.name
                        ? "Selected"
                        : "Use database"}
                    </VSCodeButton>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {database.schemas.length ? (
                      database.schemas.map((schema) => (
                        <span
                          key={schema}
                          className="inline-flex items-center rounded-full border border-[var(--vscode-focusBorder,var(--vscode-textLink-foreground))] bg-[var(--vscode-badge-background,var(--vscode-button-secondaryBackground,var(--vscode-input-background)))] px-2.5 py-1 text-xs text-[var(--vscode-badge-foreground,var(--vscode-foreground))]"
                        >
                          {schema}
                        </span>
                      ))
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-[var(--vscode-panel-border,var(--vscode-contrastBorder,transparent))] bg-[var(--vscode-badge-background,var(--vscode-button-secondaryBackground,var(--vscode-input-background)))] px-2.5 py-1 text-xs text-[var(--vscode-badge-foreground,var(--vscode-foreground))]">
                        No schemas found
                      </span>
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
    <div className="grid gap-1.5">
      <label className="text-xs font-semibold text-[color-mix(in_srgb,var(--vscode-foreground)_72%,var(--vscode-descriptionForeground)_28%)]">
        {label}
      </label>
      {children}
    </div>
  );
}
