export type DatabaseEngine = 'postgres' | 'mysql' | 'sqlserver';

export type AuthMode = 'storedPassword' | 'awsSecret';

export type SslMode = 'disable' | 'require';

export interface AwsSecretConfig {
  secretId: string;
  profile: string;
  passwordKey: string;
  region?: string;
}

export interface SavedConnection {
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
}

export interface ConnectionDraft extends Omit<SavedConnection, 'id' | 'updatedAt'> {
  id?: string;
  password?: string;
}

export interface QueryResultColumn {
  name: string;
}

export interface QueryExecutionResult {
  columns: QueryResultColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  message: string;
}

export interface DiscoveredDatabase {
  name: string;
  schemas: string[];
}

export interface SchemaTable {
  schema: string;
  name: string;
  type: string;
}

export interface DatabaseRole {
  name: string;
  type?: string;
}

export interface DatabaseTypeDefinition {
  schema?: string;
  name: string;
}

export interface ExplorerConnectionNode {
  kind: 'connection';
  connection: SavedConnection;
}

export interface ExplorerSchemaNode {
  kind: 'schema';
  connection: SavedConnection;
  database: string;
  schema: string;
}

export interface ExplorerDatabaseNode {
  kind: 'database';
  connection: SavedConnection;
  database: string;
}

export interface ExplorerCategoryNode {
  kind: 'category';
  connection: SavedConnection;
  database: string;
  category: 'schemas' | 'roles' | 'types';
}

export interface ExplorerTableNode {
  kind: 'table';
  connection: SavedConnection;
  database: string;
  schema: string;
  table: string;
  tableType: string;
}

export interface ExplorerRoleNode {
  kind: 'role';
  connection: SavedConnection;
  database: string;
  role: DatabaseRole;
}

export interface ExplorerTypeNode {
  kind: 'type';
  connection: SavedConnection;
  database: string;
  typeDefinition: DatabaseTypeDefinition;
}

export type ExplorerNode =
  | ExplorerConnectionNode
  | ExplorerDatabaseNode
  | ExplorerCategoryNode
  | ExplorerSchemaNode
  | ExplorerTableNode
  | ExplorerRoleNode
  | ExplorerTypeNode;

export interface WebviewConnection {
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
