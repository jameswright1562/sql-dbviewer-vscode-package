import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseService } from "../services/databaseService";
import { DatabaseAdapter, ConnectionCredentials } from "../db/databaseAdapters";
import {
  DatabaseColumn,
  DatabaseRole,
  DatabaseTypeDefinition,
  DiscoveredDatabase,
  QueryExecutionResult,
  SavedConnection,
  SchemaTable,
} from "../model/connection";

class FakeAdapter implements DatabaseAdapter {
  public readonly engine = "postgres" as const;
  public lastDiscoveryCredentials?: ConnectionCredentials;
  public discoveryResult: DiscoveredDatabase[] = [];
  public roles: DatabaseRole[] = [];
  public types: DatabaseTypeDefinition[] = [];
  public columns: DatabaseColumn[] = [];

  public async testConnection(
    _connection: SavedConnection,
    _credentials: ConnectionCredentials,
  ): Promise<void> {}

  public async discoverDatabases(
    _connection: SavedConnection,
    credentials: ConnectionCredentials,
  ): Promise<DiscoveredDatabase[]> {
    this.lastDiscoveryCredentials = credentials;
    return this.discoveryResult;
  }

  public async getSchemas(
    _connection: SavedConnection,
    _credentials: ConnectionCredentials,
  ): Promise<string[]> {
    return [];
  }

  public async getRoles(
    _connection: SavedConnection,
    _credentials: ConnectionCredentials,
  ): Promise<DatabaseRole[]> {
    return this.roles;
  }

  public async getTypes(
    _connection: SavedConnection,
    _credentials: ConnectionCredentials,
  ): Promise<DatabaseTypeDefinition[]> {
    return this.types;
  }

  public async getTables(
    _connection: SavedConnection,
    _credentials: ConnectionCredentials,
    _schema: string,
  ): Promise<SchemaTable[]> {
    return [];
  }

  public async getColumns(
    _connection: SavedConnection,
    _credentials: ConnectionCredentials,
  ): Promise<DatabaseColumn[]> {
    return this.columns;
  }

  public async executeQuery(
    _connection: SavedConnection,
    _credentials: ConnectionCredentials,
    _sql: string,
  ): Promise<QueryExecutionResult> {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      durationMs: 0,
      message: "ok",
    };
  }
}

function createConnection(
  overrides: Partial<SavedConnection> = {},
): SavedConnection {
  return {
    id: "connection-1",
    name: "Test Connection",
    engine: "postgres",
    host: "localhost",
    port: 5432,
    database: "",
    username: "tester",
    sslMode: "disable",
    authMode: "storedPassword",
    visibleSchemas: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test("discoverDatabases uses password override for stored-password connections", async () => {
  const adapter = new FakeAdapter();
  adapter.discoveryResult = [
    { name: "analytics", schemas: ["public", "reporting"] },
  ];

  const service = new DatabaseService(
    {
      getPassword: async () => "stored-password",
    } as never,
    {
      getPassword: async () => "aws-password",
      invalidate: () => undefined,
    } as never,
    undefined,
    [adapter],
  );

  const result = await service.discoverDatabases(
    createConnection(),
    "override-password",
  );

  assert.deepEqual(result, [
    { name: "analytics", schemas: ["public", "reporting"] },
  ]);
  assert.equal(adapter.lastDiscoveryCredentials?.password, "override-password");
});

test("discoverDatabases resolves AWS-backed credentials through the AWS provider", async () => {
  const adapter = new FakeAdapter();
  adapter.discoveryResult = [{ name: "warehouse", schemas: ["dbo"] }];

  let awsRequests = 0;
  const service = new DatabaseService(
    {
      getPassword: async () => "stored-password",
    } as never,
    {
      getPassword: async () => {
        awsRequests += 1;
        return "rotating-secret";
      },
      invalidate: () => undefined,
    } as never,
    undefined,
    [adapter],
  );

  const result = await service.discoverDatabases(
    createConnection({
      authMode: "awsSecret",
      awsSecret: {
        secretId: "secret-id",
        profile: "default",
        passwordKey: "password",
      },
    }),
  );

  assert.deepEqual(result, [{ name: "warehouse", schemas: ["dbo"] }]);
  assert.equal(adapter.lastDiscoveryCredentials?.password, "rotating-secret");
  assert.equal(awsRequests, 1);
});

test("getRoles, getTypes, and getColumns delegate to the adapter", async () => {
  const adapter = new FakeAdapter();
  adapter.roles = [{ name: "app_reader", type: "role" }];
  adapter.types = [{ schema: "public", name: "status_enum" }];
  adapter.columns = [{ name: "order_id", dataType: "uuid", isNullable: false }];

  const service = new DatabaseService(
    {
      getPassword: async () => "stored-password",
    } as never,
    {
      getPassword: async () => "aws-password",
      invalidate: () => undefined,
    } as never,
    undefined,
    [adapter],
  );

  const connection = createConnection({ database: "analytics" });
  const roles = await service.getRoles(connection);
  const types = await service.getTypes(connection);
  const columns = await service.getColumns(connection, {
    schema: "public",
    table: "orders",
  });

  assert.deepEqual(roles, [{ name: "app_reader", type: "role" }]);
  assert.deepEqual(types, [{ schema: "public", name: "status_enum" }]);
  assert.deepEqual(columns, [
    { name: "order_id", dataType: "uuid", isNullable: false },
  ]);
});
