import * as mysql from 'mysql2/promise';
import * as sql from 'mssql';
import { Client as PgClient } from 'pg';
import { DatabaseRole, DatabaseTypeDefinition, DiscoveredDatabase, QueryExecutionResult, SavedConnection, SchemaTable } from '../model/connection';

export interface ConnectionCredentials {
  password: string;
}

export interface DatabaseAdapter {
  readonly engine: SavedConnection['engine'];
  testConnection(connection: SavedConnection, credentials: ConnectionCredentials): Promise<void>;
  discoverDatabases(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DiscoveredDatabase[]>;
  getSchemas(connection: SavedConnection, credentials: ConnectionCredentials): Promise<string[]>;
  getRoles(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DatabaseRole[]>;
  getTypes(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DatabaseTypeDefinition[]>;
  getTables(connection: SavedConnection, credentials: ConnectionCredentials, schema: string): Promise<SchemaTable[]>;
  executeQuery(connection: SavedConnection, credentials: ConnectionCredentials, sql: string): Promise<QueryExecutionResult>;
}

export class PostgresAdapter implements DatabaseAdapter {
  public readonly engine = 'postgres' as const;

  public async testConnection(connection: SavedConnection, credentials: ConnectionCredentials): Promise<void> {
    const client = new PgClient(this.createOptions(connection, credentials.password));
    await client.connect();
    try {
      await client.query('select 1');
    } finally {
      await client.end();
    }
  }

  public async discoverDatabases(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DiscoveredDatabase[]> {
    const client = new PgClient(this.createOptions(connection, credentials.password, connection.database || 'postgres'));
    await client.connect();
    try {
      const result = await client.query<{ datname: string }>(`
        select datname
        from pg_database
        where datallowconn = true
          and datistemplate = false
          and has_database_privilege(datname, 'CONNECT')
        order by datname
      `);

      const discovered = await Promise.allSettled(
        result.rows.map(async (row) => ({
          name: row.datname,
          schemas: await this.getSchemasForDatabase(connection, credentials.password, row.datname)
        }))
      );

      return discovered
        .filter((entry): entry is PromiseFulfilledResult<DiscoveredDatabase> => entry.status === 'fulfilled')
        .map((entry) => entry.value);
    } finally {
      await client.end();
    }
  }

  public async getSchemas(connection: SavedConnection, credentials: ConnectionCredentials): Promise<string[]> {
    return this.getSchemasForDatabase(connection, credentials.password, connection.database);
  }

  public async getRoles(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DatabaseRole[]> {
    const client = new PgClient(this.createOptions(connection, credentials.password));
    await client.connect();
    try {
      const result = await client.query<{ rolname: string; role_type: string }>(`
        select
          rolname,
          case
            when rolsuper then 'superuser'
            when rolcreaterole then 'role admin'
            when rolcreatedb then 'db creator'
            else 'role'
          end as role_type
        from pg_roles
        order by rolname
      `);

      return result.rows.map((row) => ({
        name: row.rolname,
        type: row.role_type
      }));
    } finally {
      await client.end();
    }
  }

  public async getTypes(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DatabaseTypeDefinition[]> {
    const client = new PgClient(this.createOptions(connection, credentials.password));
    await client.connect();
    try {
      const result = await client.query<{ schema_name: string; type_name: string }>(`
        select
          n.nspname as schema_name,
          t.typname as type_name
        from pg_type t
        inner join pg_namespace n on n.oid = t.typnamespace
        where n.nspname not like 'pg_%'
          and n.nspname <> 'information_schema'
          and t.typtype in ('c', 'd', 'e', 'r')
        order by n.nspname, t.typname
      `);

      return result.rows.map((row) => ({
        schema: row.schema_name,
        name: row.type_name
      }));
    } finally {
      await client.end();
    }
  }

  public async getTables(connection: SavedConnection, credentials: ConnectionCredentials, schema: string): Promise<SchemaTable[]> {
    const client = new PgClient(this.createOptions(connection, credentials.password));
    await client.connect();
    try {
      const result = await client.query<{ table_name: string; table_type: string }>(`
        select table_name, table_type
        from information_schema.tables
        where table_schema = $1
        order by table_name
      `, [schema]);

      return result.rows.map((row) => ({
        schema,
        name: row.table_name,
        type: row.table_type
      }));
    } finally {
      await client.end();
    }
  }

  public async executeQuery(connection: SavedConnection, credentials: ConnectionCredentials, sql: string): Promise<QueryExecutionResult> {
    const startedAt = Date.now();
    const client = new PgClient(this.createOptions(connection, credentials.password));
    await client.connect();
    try {
      const result = await client.query(sql);
      return {
        columns: result.fields.map((field) => ({ name: field.name })),
        rows: result.rows as Record<string, unknown>[],
        rowCount: result.rowCount ?? result.rows.length,
        durationMs: Date.now() - startedAt,
        message: `Query completed against ${connection.database}.`
      };
    } finally {
      await client.end();
    }
  }

  private async getSchemasForDatabase(connection: SavedConnection, password: string, database?: string): Promise<string[]> {
    const client = new PgClient(this.createOptions(connection, password, database));
    await client.connect();
    try {
      const result = await client.query<{ schema_name: string }>(`
        select schema_name
        from information_schema.schemata
        where schema_name not like 'pg_%'
          and schema_name <> 'information_schema'
        order by schema_name
      `);
      return result.rows.map((row) => row.schema_name);
    } finally {
      await client.end();
    }
  }

  private createOptions(connection: SavedConnection, password: string, databaseOverride?: string) {
    return {
      host: connection.host,
      port: connection.port,
      database: databaseOverride || connection.database || 'postgres',
      user: connection.username,
      password,
      ssl: connection.sslMode === 'require' ? { rejectUnauthorized: false } : undefined
    };
  }
}

export class MySqlAdapter implements DatabaseAdapter {
  public readonly engine = 'mysql' as const;

  public async testConnection(connection: SavedConnection, credentials: ConnectionCredentials): Promise<void> {
    const db = await mysql.createConnection(this.createOptions(connection, credentials.password));
    try {
      await db.query('select 1');
    } finally {
      await db.end();
    }
  }

  public async discoverDatabases(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DiscoveredDatabase[]> {
    const db = await mysql.createConnection(this.createOptions(connection, credentials.password, undefined));
    try {
      const [rows] = await db.query<mysql.RowDataPacket[]>('show databases');
      return rows
        .map((row) => String(row.Database))
        .filter((database) => !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(database))
        .map((database) => ({
          name: database,
          schemas: [database]
        }));
    } finally {
      await db.end();
    }
  }

  public async getSchemas(connection: SavedConnection, credentials: ConnectionCredentials): Promise<string[]> {
    const db = await mysql.createConnection(this.createOptions(connection, credentials.password));
    try {
      const [rows] = await db.query<mysql.RowDataPacket[]>(`
        select schema_name
        from information_schema.schemata
        where schema_name not in ('information_schema', 'performance_schema', 'mysql', 'sys')
        order by schema_name
      `);

      return rows.map((row) => String(row.schema_name));
    } finally {
      await db.end();
    }
  }

  public async getRoles(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DatabaseRole[]> {
    const db = await mysql.createConnection(this.createOptions(connection, credentials.password));
    try {
      const [rows] = await db.query<mysql.RowDataPacket[]>(`
        select distinct concat(from_user, '@', from_host) as role_name
        from mysql.role_edges
        order by role_name
      `);

      return rows.map((row) => ({
        name: String(row.role_name),
        type: 'role'
      }));
    } finally {
      await db.end();
    }
  }

  public async getTypes(_connection: SavedConnection, _credentials: ConnectionCredentials): Promise<DatabaseTypeDefinition[]> {
    return [];
  }

  public async getTables(connection: SavedConnection, credentials: ConnectionCredentials, schema: string): Promise<SchemaTable[]> {
    const db = await mysql.createConnection(this.createOptions(connection, credentials.password));
    try {
      const [rows] = await db.query<mysql.RowDataPacket[]>(`
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
    } finally {
      await db.end();
    }
  }

  public async executeQuery(connection: SavedConnection, credentials: ConnectionCredentials, sql: string): Promise<QueryExecutionResult> {
    const startedAt = Date.now();
    const db = await mysql.createConnection(this.createOptions(connection, credentials.password));
    try {
      const [rows, fields] = await db.query(sql);

      if (Array.isArray(rows)) {
        const dataRows = rows as mysql.RowDataPacket[];
        return {
          columns: (fields ?? []).map((field) => ({ name: field.name })),
          rows: dataRows.map((row) => Object.fromEntries(Object.entries(row))),
          rowCount: dataRows.length,
          durationMs: Date.now() - startedAt,
          message: `Query completed against ${connection.database}.`
        };
      }

      const result = rows as mysql.ResultSetHeader;
      return {
        columns: [],
        rows: [],
        rowCount: result.affectedRows ?? 0,
        durationMs: Date.now() - startedAt,
        message: `Statement completed. ${result.affectedRows ?? 0} row(s) affected.`
      };
    } finally {
      await db.end();
    }
  }

  private createOptions(connection: SavedConnection, password: string, databaseOverride?: string): mysql.ConnectionOptions {
    return {
      host: connection.host,
      port: connection.port,
      database: (databaseOverride ?? connection.database) || undefined,
      user: connection.username,
      password,
      ssl: connection.sslMode === 'require' ? {} : undefined
    };
  }
}

export class SqlServerAdapter implements DatabaseAdapter {
  public readonly engine = 'sqlserver' as const;

  public async testConnection(connection: SavedConnection, credentials: ConnectionCredentials): Promise<void> {
    const pool = await this.createPool(connection, credentials.password);
    try {
      await pool.request().query('select 1 as ok');
    } finally {
      await pool.close();
    }
  }

  public async discoverDatabases(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DiscoveredDatabase[]> {
    const pool = await this.createPool(connection, credentials.password, connection.database || 'master');
    try {
      const result = await pool.request().query(`
        select name
        from sys.databases
        where state_desc = 'ONLINE'
          and HAS_DBACCESS(name) = 1
          and name not in ('master', 'model', 'msdb', 'tempdb')
        order by name
      `);

      const discovered: PromiseSettledResult<DiscoveredDatabase>[] = await Promise.allSettled(
        result.recordset.map(async ({ name } : {name: string} ) => ({
          name: String(name),
          schemas: await this.getSchemasForDatabase(connection, credentials.password, String(name))
        }))
      );

      return discovered
        .filter((entry): entry is PromiseFulfilledResult<DiscoveredDatabase> => entry.status === 'fulfilled')
        .map((entry) => entry.value);
    } finally {
      await pool.close();
    }
  }

  public async getSchemas(connection: SavedConnection, credentials: ConnectionCredentials): Promise<string[]> {
    return this.getSchemasForDatabase(connection, credentials.password, connection.database);
  }

  public async getRoles(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DatabaseRole[]> {
    const pool = await this.createPool(connection, credentials.password);
    try {
      const result = await pool.request().query(`
        select name, type_desc
        from sys.database_principals
        where type in ('R', 'A')
          and principal_id > 0
          and name not like '##%'
        order by name
      `);

      return result.recordset.map((row) => ({
        name: String(row.name),
        type: String(row.type_desc)
      }));
    } finally {
      await pool.close();
    }
  }

  public async getTypes(connection: SavedConnection, credentials: ConnectionCredentials): Promise<DatabaseTypeDefinition[]> {
    const pool = await this.createPool(connection, credentials.password);
    try {
      const result = await pool.request().query(`
        select s.name as schema_name, t.name as type_name
        from sys.types t
        inner join sys.schemas s on s.schema_id = t.schema_id
        where t.is_user_defined = 1
        order by s.name, t.name
      `);

      return result.recordset.map((row) => ({
        schema: String(row.schema_name),
        name: String(row.type_name)
      }));
    } finally {
      await pool.close();
    }
  }

  public async getTables(connection: SavedConnection, credentials: ConnectionCredentials, schema: string): Promise<SchemaTable[]> {
    const pool = await this.createPool(connection, credentials.password);
    try {
      const result = await pool.request()
        .input('schema', sql.NVarChar, schema)
        .query(`
          select table_name, table_type
          from information_schema.tables
          where table_schema = @schema
          order by table_name
        `);

      return result.recordset.map((row: { table_name: unknown; table_type: unknown }) => ({
        schema,
        name: String(row.table_name),
        type: String(row.table_type)
      }));
    } finally {
      await pool.close();
    }
  }

  public async executeQuery(connection: SavedConnection, credentials: ConnectionCredentials, sqlText: string): Promise<QueryExecutionResult> {
    const startedAt = Date.now();
    const pool = await this.createPool(connection, credentials.password);
    try {
      const result = await pool.request().query(sqlText);
      const rows = result.recordset ?? [];
      const firstRow = rows[0] as Record<string, unknown> | undefined;
      const columnNames = firstRow ? Object.keys(firstRow) : [];
      const affectedRows = Array.isArray(result.rowsAffected)
        ? result.rowsAffected.reduce((sum: number, count: number) => sum + count, 0)
        : 0;
      const hasRowSet = columnNames.length > 0 || rows.length > 0;

      return {
        columns: columnNames.map((name) => ({ name })),
        rows: rows as Record<string, unknown>[],
        rowCount: hasRowSet ? rows.length : affectedRows,
        durationMs: Date.now() - startedAt,
        message: hasRowSet
          ? `Query completed against ${connection.database}.`
          : `Statement completed. ${affectedRows} row(s) affected.`
      };
    } finally {
      await pool.close();
    }
  }

  private async getSchemasForDatabase(connection: SavedConnection, password: string, database?: string): Promise<string[]> {
    const pool = await this.createPool(connection, password, database);
    try {
      const result = await pool.request().query(`
        select s.name as schema_name
        from sys.schemas s
        where s.name not in ('guest', 'INFORMATION_SCHEMA', 'sys', 'db_owner', 'db_accessadmin', 'db_securityadmin', 'db_ddladmin', 'db_backupoperator', 'db_datareader', 'db_datawriter', 'db_denydatareader', 'db_denydatawriter')
        order by s.name
      `);

      return result.recordset.map((row: { schema_name: unknown }) => String(row.schema_name));
    } finally {
      await pool.close();
    }
  }

  private async createPool(connection: SavedConnection, password: string, databaseOverride?: string): Promise<sql.ConnectionPool> {
    const pool = new sql.ConnectionPool({
      server: connection.host,
      port: connection.port,
      database: databaseOverride || connection.database || 'master',
      user: connection.username,
      password,
      options: {
        encrypt: connection.sslMode === 'require',
        trustServerCertificate: connection.sslMode === 'require'
      }
    });

    return pool.connect();
  }
}
