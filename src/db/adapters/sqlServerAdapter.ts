import sql, { ConnectionPool, config as SqlServerConfig } from "mssql";
import {
  DatabaseColumn,
  DatabaseRole,
  DatabaseTypeDefinition,
  DiscoveredDatabase,
  QueryExecutionResult,
  SavedConnection,
  SchemaTable,
} from "../../model/connection";
import { ConnectionCredentials, DatabaseAdapter } from "../types";

interface DatabaseNameRow {
  name: string;
}

interface SchemaNameRow {
  schema_name: string;
}

interface RoleRow {
  name: string;
  type_desc: string;
}

interface TypeRow {
  schema_name: string;
  type_name: string;
}

interface TableRow {
  table_name: string;
  table_type: string;
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
}

type SqlServerRow = Record<string, unknown>;

export class SqlServerAdapter implements DatabaseAdapter {
  public readonly engine = "sqlserver" as const;

  public async testConnection(
    connection: SavedConnection,
    credentials: ConnectionCredentials,
  ): Promise<void> {
    await this.withPool(connection, credentials.password, async (pool) => {
      await pool.request().query("select 1 as ok");
    });
  }

  public async discoverDatabases(
    connection: SavedConnection,
    credentials: ConnectionCredentials,
  ): Promise<DiscoveredDatabase[]> {
    return this.withPool(
      connection,
      credentials.password,
      async (pool) => {
        const result = await pool.request().query<DatabaseNameRow>(`
        select name
        from sys.databases
        where state_desc = 'ONLINE'
          and HAS_DBACCESS(name) = 1
          and name not in ('master', 'model', 'msdb', 'tempdb')
        order by name
      `);

        const discovered = await Promise.allSettled(
          result.recordset.map(async ({ name }) => ({
            name,
            schemas: await this.getSchemasForDatabase(
              connection,
              credentials.password,
              name,
            ),
          })),
        );

        return discovered
          .filter(
            (entry): entry is PromiseFulfilledResult<DiscoveredDatabase> =>
              entry.status === "fulfilled",
          )
          .map((entry) => entry.value);
      },
      connection.database || "master",
    );
  }

  public async getSchemas(
    connection: SavedConnection,
    credentials: ConnectionCredentials,
  ): Promise<string[]> {
    return this.getSchemasForDatabase(
      connection,
      credentials.password,
      connection.database,
    );
  }

  public async getRoles(
    connection: SavedConnection,
    credentials: ConnectionCredentials,
  ): Promise<DatabaseRole[]> {
    return this.withPool(connection, credentials.password, async (pool) => {
      const result = await pool.request().query<RoleRow>(`
        select name, type_desc
        from sys.database_principals
        where type in ('R', 'A')
          and principal_id > 0
          and name not like '##%'
        order by name
      `);

      return result.recordset.map(({ name, type_desc }) => ({
        name,
        type: type_desc,
      }));
    });
  }

  public async getTypes(
    connection: SavedConnection,
    credentials: ConnectionCredentials,
  ): Promise<DatabaseTypeDefinition[]> {
    return this.withPool(connection, credentials.password, async (pool) => {
      const result = await pool.request().query<TypeRow>(`
        select s.name as schema_name, t.name as type_name
        from sys.types t
        inner join sys.schemas s on s.schema_id = t.schema_id
        where t.is_user_defined = 1
        order by s.name, t.name
      `);

      return result.recordset.map(({ schema_name, type_name }) => ({
        schema: schema_name,
        name: type_name,
      }));
    });
  }

  public async getTables(
    connection: SavedConnection,
    credentials: ConnectionCredentials,
    schema: string,
  ): Promise<SchemaTable[]> {
    return this.withPool(connection, credentials.password, async (pool) => {
      const result = await pool.request().input("schema", sql.NVarChar, schema)
        .query<TableRow>(`
          select table_name, table_type
          from information_schema.tables
          where table_schema = @schema
          order by table_name
        `);

      return result.recordset.map(({ table_name, table_type }) => ({
        schema,
        name: table_name,
        type: table_type,
      }));
    });
  }

  public async getColumns(
    connection: SavedConnection,
    credentials: ConnectionCredentials,
    table: { schema: string; table: string },
  ): Promise<DatabaseColumn[]> {
    return this.withPool(connection, credentials.password, async (pool) => {
      const result = await pool
        .request()
        .input("schema", sql.NVarChar, table.schema)
        .input("table", sql.NVarChar, table.table).query<ColumnRow>(`
          select column_name, data_type, is_nullable
          from information_schema.columns
          where table_schema = @schema
            and table_name = @table
          order by ordinal_position
        `);

      return result.recordset.map(
        ({ column_name, data_type, is_nullable }) => ({
          name: column_name,
          dataType: data_type,
          isNullable: is_nullable === "YES",
        }),
      );
    });
  }

  public async executeQuery(
    connection: SavedConnection,
    credentials: ConnectionCredentials,
    sqlText: string,
  ): Promise<QueryExecutionResult> {
    return this.withPool(connection, credentials.password, async (pool) => {
      const startedAt = Date.now();
      const result = await pool.request().query<SqlServerRow>(sqlText);
      const rows = result.recordset;
      const firstRow = rows[0];
      const columnNames = firstRow ? Object.keys(firstRow) : [];
      const affectedRows = result.rowsAffected.reduce(
        (sum, count) => sum + count,
        0,
      );
      const hasRowSet = columnNames.length > 0 || rows.length > 0;

      return {
        columns: columnNames.map((name) => ({ name })),
        rows,
        rowCount: hasRowSet ? rows.length : affectedRows,
        durationMs: Date.now() - startedAt,
        message: hasRowSet
          ? `Query completed against ${connection.database}.`
          : `Statement completed. ${affectedRows} row(s) affected.`,
      };
    });
  }

  private async getSchemasForDatabase(
    connection: SavedConnection,
    password: string,
    database?: string,
  ): Promise<string[]> {
    return this.withPool(
      connection,
      password,
      async (pool) => {
        const result = await pool.request().query<SchemaNameRow>(`
        select s.name as schema_name
        from sys.schemas s
        where s.name not in (
          'guest',
          'INFORMATION_SCHEMA',
          'sys',
          'db_owner',
          'db_accessadmin',
          'db_securityadmin',
          'db_ddladmin',
          'db_backupoperator',
          'db_datareader',
          'db_datawriter',
          'db_denydatareader',
          'db_denydatawriter'
        )
        order by s.name
      `);

        return result.recordset.map(({ schema_name }) => schema_name);
      },
      database,
    );
  }

  private async withPool<T>(
    connection: SavedConnection,
    password: string,
    action: (pool: ConnectionPool) => Promise<T>,
    databaseOverride?: string,
  ): Promise<T> {
    const pool = new sql.ConnectionPool(
      this.createConfig(connection, password, databaseOverride),
    );
    await pool.connect();

    try {
      return await action(pool);
    } finally {
      await pool.close();
    }
  }

  private createConfig(
    connection: SavedConnection,
    password: string,
    databaseOverride?: string,
  ): SqlServerConfig {
    return {
      server: connection.host,
      port: connection.port,
      database: databaseOverride || connection.database || "master",
      user: connection.username,
      password,
      options: {
        encrypt: connection.sslMode === "require",
        trustServerCertificate: connection.sslMode === "require",
      },
    };
  }
}
