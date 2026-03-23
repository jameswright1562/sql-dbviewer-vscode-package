export type DatabaseEngine = 'postgres' | 'mysql' | 'sqlserver';
export type AuthMode = 'storedPassword' | 'awsSecret';
export type SslMode = 'disable' | 'require';

export interface AwsSecretConfig {
  secretId: string;
  profile: string;
  passwordKey: string;
  region?: string;
}

export interface WorkbenchConnection {
  id: string;
  name: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  database: string;
  username: string;
  sslMode: SslMode;
  authMode: AuthMode;
  visibleSchemas: string[];
  awsSecret?: AwsSecretConfig;
  updatedAt: string;
  hasStoredPassword: boolean;
}

export interface ConnectionDraft extends Omit<WorkbenchConnection, 'id' | 'updatedAt' | 'hasStoredPassword'> {
  id?: string;
  password?: string;
}

export interface QueryExecutionResult {
  columns: Array<{ name: string }>;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  durationMs: number;
  message: string;
}

export interface DiscoveredDatabase {
  name: string;
  schemas: string[];
}

export interface WorkbenchState {
  connections: WorkbenchConnection[];
  selectedConnectionId?: string;
  currentQuery: string;
  lastResult?: QueryExecutionResult;
  discoveredDatabases: DiscoveredDatabase[];
}

export interface SidebarState {
  connections: WorkbenchConnection[];
  selectedConnectionId?: string;
}

export interface TableViewState {
  connectionId: string;
  connectionName: string;
  engine: DatabaseEngine;
  database: string;
  schema: string;
  table: string;
  previewSql: string;
  result?: QueryExecutionResult;
  errorMessage?: string;
}

export type NotificationMessage = {
  type: 'notification';
  level: 'info' | 'error';
  message: string;
};

export type IncomingMessage =
  | { type: 'workbenchState'; state: WorkbenchState }
  | { type: 'sidebarState'; state: SidebarState }
  | { type: 'tableState'; state: TableViewState }
  | NotificationMessage;

export type WorkbenchOutgoingMessage =
  | { type: 'ready' }
  | { type: 'selectConnection'; connectionId?: string }
  | { type: 'saveConnection'; draft: ConnectionDraft }
  | { type: 'deleteConnection'; connectionId: string }
  | { type: 'testConnection'; draft: ConnectionDraft }
  | { type: 'discoverDatabases'; draft: ConnectionDraft }
  | { type: 'runDraftQuery'; draft: ConnectionDraft; sql: string }
  | { type: 'runQuery'; connectionId: string; sql: string }
  | { type: 'chooseSchemas'; connectionId: string }
  | { type: 'newConnection' };

export type SidebarOutgoingMessage =
  | { type: 'ready' }
  | { type: 'addConnection' }
  | { type: 'refresh' }
  | { type: 'openWorkbench'; connectionId?: string };

export type TableOutgoingMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'openWorkbench'; connectionId: string };

export type WebviewKind = 'workbench' | 'sidebar' | 'table';

export interface WorkbenchPersistenceState {
  draft: ConnectionDraft;
  draftSourceKey: string;
  queryContextKey: string;
  queryText: string;
}

export interface NotificationItem {
  id: number;
  level: 'info' | 'error';
  message: string;
}
