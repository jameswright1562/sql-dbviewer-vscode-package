import { ConnectionDraft, DiscoveredDatabase, QueryExecutionResult, WebviewConnection } from './model/connection';

export interface WorkbenchState {
  connections: WebviewConnection[];
  selectedConnectionId?: string;
  currentQuery: string;
  lastResult?: QueryExecutionResult;
  discoveredDatabases: DiscoveredDatabase[];
}

export type WorkbenchMessage =
  | { type: 'ready' }
  | { type: 'selectConnection'; connectionId?: string }
  | { type: 'saveConnection'; draft: ConnectionDraft }
  | { type: 'deleteConnection'; connectionId: string }
  | { type: 'testConnection'; draft: ConnectionDraft }
  | { type: 'discoverDatabases'; draft: ConnectionDraft }
  | { type: 'runQuery'; connectionId: string; sql: string }
  | { type: 'chooseSchemas'; connectionId: string }
  | { type: 'newConnection' };

export type ExtensionToWebviewMessage =
  | { type: 'state'; state: WorkbenchState }
  | { type: 'notification'; level: 'info' | 'error'; message: string };
