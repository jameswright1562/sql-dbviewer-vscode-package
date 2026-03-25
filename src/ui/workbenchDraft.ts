import { ConnectionDraft, SavedConnection } from "../model/connection";
import { getDefaultQuery } from "../db/databaseAdapters";

export function normalizeDraft(draft: ConnectionDraft): ConnectionDraft {
  return {
    ...draft,
    name: draft.name ?? "",
    host: draft.host ?? "",
    port: Number(draft.port),
    database: draft.database ?? "",
    username: draft.username ?? "",
    sslMode: draft.sslMode ?? "disable",
    visibleSchemas: Array.isArray(draft.visibleSchemas)
      ? draft.visibleSchemas
      : [],
    awsSecret:
      draft.authMode === "awsSecret"
        ? {
            secretId: draft.awsSecret?.secretId ?? "",
            profile: draft.awsSecret?.profile ?? "",
            passwordKey: draft.awsSecret?.passwordKey ?? "",
            region: draft.awsSecret?.region ?? "",
          }
        : undefined,
    password: draft.password ?? "",
  };
}

export function materializeDraft(draft: ConnectionDraft): SavedConnection {
  return {
    id: draft.id ?? "draft-connection",
    name: draft.name.trim(),
    engine: draft.engine,
    host: draft.host.trim(),
    port: draft.port,
    database: draft.database.trim(),
    username: draft.username.trim(),
    sslMode: draft.sslMode,
    authMode: draft.authMode,
    visibleSchemas: draft.visibleSchemas,
    awsSecret:
      draft.authMode === "awsSecret"
        ? {
            secretId: draft.awsSecret!.secretId.trim(),
            profile: draft.awsSecret!.profile.trim(),
            passwordKey: draft.awsSecret!.passwordKey.trim(),
            region: draft.awsSecret?.region?.trim() || undefined,
          }
        : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function getDefaultWorkbenchQuery(connection: SavedConnection): string {
  return getDefaultQuery(connection.engine);
}
