import mysql, { Connection, ConnectionOptions, FieldPacket, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  DatabaseColumn,
  DatabaseRole,
  DatabaseTypeDefinition,
  DiscoveredDatabase,
  QueryExecutionResult,
  SavedConnection,
  SchemaTable
} from '../../model/connection';
import { ConnectionCredentials, DatabaseAdapter } from '../types';

export class MySqlAdapter implements DatabaseAdapter {
  public readonly engine = 'mysql' as const;

  public async testConnection(connection: SavedConnection, credentials: ConnectionCredentials): Promise<void> {
    await this.withConnection(connection, credentials.password, async (db) => {
      await db.query('select 1');
    });
  }

  public async discoverDatabases(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DiscoveredDatabase[]> {
    return this.withConnection(connection, credentials.password, async (db) => {
      const [rows] = await db.query<RowDataPacket[]>('show databases');

      return rows
        .map((row) => String(row.Database))
        .filter((database) => !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(database))
        .map((name) => ({
          name,
          schemas: [name]
        }));
    }, undefined);
  }

  public async getSchemas(connection: SavedConnection, credentials: ConnectionCredentials): Promise<string[]> {
    return this.withConnection(connection, credentials.password, async (db) => {
      const [rows] = await db.query<RowDataPacket[]>(`
        select schema_name
        from information_schema.schemata
        where schema_name not in ('information_schema', 'performance_schema', 'mysql', 'sys')
        order by schema_name
      `);

      return rows.map((row) => String(row.schema_name));
    });
  }

  public async getRoles(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DatabaseRole[]> {
    return this.withConnection(connection, credentials.password, async (db) => {
      const [rows] = await db.query<RowDataPacket[]>(`
        select distinct concat(from_user, '@', from_host) as role_name
        from mysql.role_edges
        order by role_name
      `);

      return rows.map((row) => ({
        name: String(row.role_name),
        type: 'role'
      }));
    });
  }

  public async getTypes(_connection: SavedConnection, _credentials: ConnectionCredentials): Promise<DatabaseTypeDefinition[]> {
    return [];
  }

  public async getTables(connection: SavedConnection, credentials: ConnectionCredentials, schema: string): Promise<SchemaTable[]> {
    return this.withConnection(connection, credentials.password, async (db) => {
      const [rows] = await db.query<RowDataPacket[]>(`
        select table_name, table_type
        from information_schema.tables
        where table_schema = ?
        order by table_name
      `, [schema]);

      return rows.map((row) => ({
        schema,
        name: String(row.table_name),
        type: String(row.table_type)
      }));
    });
  }

  public async getColumns(connection: SavedConnection, credentials: ConnectionCredentials, table: { schema: string; table: string }): Promise<DatabaseColumn[]> {
    return this.withConnection(connection, credentials.password, async (db) => {
      const [rows] = await db.query<RowDataPacket[]>(`
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = ?
          and table_name = ?
        order by ordinal_position
      `, [table.schema, table.table]);

      return rows.map((row) => ({
        name: String(row.column_name),
        dataType: String(row.data_type),
        isNullable: String(row.is_nullable).toUpperCase() === 'YES'
      }));
    });
  }

  public async executeQuery(connection: SavedConnection, credentials: ConnectionCredentials, sql: string): Promise<QueryExecutionResult> {
    return this.withConnection(connection, credentials.password, async (db) => {
      const startedAt = Date.now();
      const [rows, fields] = await db.query(sql);

      if (Array.isArray(rows)) {
        return {
          columns: this.mapColumns(fields ?? []),
          rows: rows.map((row) => Object.fromEntries(Object.entries(row))),
          rowCount: rows.length,
          durationMs: Date.now() - startedAt,
          message: `Query completed against ${connection.database}.`
        };
      }

      const result = rows as ResultSetHeader;
      return {
        columns: [],
        rows: [],
        rowCount: result.affectedRows ?? 0,
        durationMs: Date.now() - startedAt,
        message: `Statement completed. ${result.affectedRows ?? 0} row(s) affected.`
      };
    });
  }

  private async withConnection<T>(
    connection: SavedConnection,
    password: string,
    action: (db: Connection) => Promise<T>,
    databaseOverride?: string
  ): Promise<T> {
    const db = await mysql.createConnection(this.createOptions(connection, password, databaseOverride));

    try {
      return await action(db);
    } finally {
      await db.end();
    }
  }

  private createOptions(connection: SavedConnection, password: string, databaseOverride?: string): ConnectionOptions {
    return {
      host: connection.host,
      port: connection.port,
      database: (databaseOverride ?? connection.database) || undefined,
      user: connection.username,
      password,
      ssl: connection.sslMode === 'require' ? {} : undefined
    };
  }

  private mapColumns(fields: FieldPacket[]): Array<{ name: string }> {
    return fields.map((field) => ({ name: field.name }));
  }
}
