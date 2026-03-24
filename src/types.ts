import { OrderByDirection } from 'kysely';
import {
  ConnectionDraft,
  DatabaseColumn,
  DatabaseEngine,
  DiscoveredDatabase,
  QueryExecutionResult,
  TableFilterDefinition,
  WebviewConnection
} from './model/connection';

export interface WorkbenchState {
  connections: WebviewConnection[];
  selectedConnectionId?: string;
  currentQuery: string;
  lastResult?: QueryExecutionResult;
  discoveredDatabases: DiscoveredDatabase[];
}

export interface SidebarState {
  connections: WebviewConnection[];
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
  currentSql: string;
  columns: DatabaseColumn[];
  filters: TableFilterDefinition[];
  result?: QueryExecutionResult;
  errorMessage?: string;
}

export type WorkbenchMessage =
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

export type SidebarMessage =
  | { type: 'ready' }
  | { type: 'addConnection' }
  | { type: 'refresh' }
  | { type: 'openWorkbench'; connectionId?: string };

export type TableViewMessage =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'runQuery'; sql: string }
  | { type: 'applyFilters'; filters: TableFilterDefinition[] }
  | { type: 'resetSql' }
  | { type: 'openWorkbench'; connectionId: string }
  | {type: 'applySort', columnName: string, direction?: OrderByDirection};

export type ExtensionToWebviewMessage =
  | { type: 'workbenchState'; state: WorkbenchState }
  | { type: 'sidebarState'; state: SidebarState }
  | { type: 'tableState'; state: TableViewState }
  | { type: 'notification'; level: 'info' | 'error'; message: string };
