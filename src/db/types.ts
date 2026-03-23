import {
  DatabaseColumn,
  DatabaseRole,
  DatabaseTypeDefinition,
  DiscoveredDatabase,
  QueryExecutionResult,
  SavedConnection,
  SchemaTable
} from '../model/connection';

export interface ConnectionCredentials {
  password: string;
}

export interface TableReference {
  schema: string;
  table: string;
}

export interface DatabaseAdapter {
  readonly engine: SavedConnection['engine'];
  testConnection(connection: SavedConnection, credentials: ConnectionCredentials): Promise<void>;
  discoverDatabases(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DiscoveredDatabase[]>;
  getSchemas(connection: SavedConnection, credentials: ConnectionCredentials): Promise<string[]>;
  getRoles(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DatabaseRole[]>;
  getTypes(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DatabaseTypeDefinition[]>;
  getTables(connection: SavedConnection, credentials: ConnectionCredentials, schema: string): Promise<SchemaTable[]>;
  getColumns(connection: SavedConnection, credentials: ConnectionCredentials, table: TableReference): Promise<DatabaseColumn[]>;
  executeQuery(connection: SavedConnection, credentials: ConnectionCredentials, sql: string): Promise<QueryExecutionResult>;
}
