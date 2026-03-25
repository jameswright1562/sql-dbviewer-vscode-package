import { Client, ClientConfig } from "pg";
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

type PostgresRow = Record<string, unknown>;

interface DatabaseNameRow {
  datname: string;
}

interface SchemaNameRow {
  schema_name: string;
}

interface RoleRow {
  rolname: string;
  role_type: string;
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

export class PostgresAdapter implements DatabaseAdapter {
  public readonly engine = "postgres" as const;

  public async testConnection(
    connection: SavedConnection,
    credentials: ConnectionCredentials,
  ): Promise<void> {
    await this.withClient(connection, credentials.password, async (client) => {
      await client.query("select 1");
    });
  }

  public async discoverDatabases(
    connection: SavedConnection,
    credentials: ConnectionCredentials,
  ): Promise<DiscoveredDatabase[]> {
    return this.withClient(
      connection,
      credentials.password,
      async (client) => {
        const result = await client.query<DatabaseNameRow>(`
        select datname
        from pg_database
        where datallowconn = true
          and datistemplate = false
          and has_database_privilege(datname, 'CONNECT')
        order by datname
      `);

        const discovered = await Promise.allSettled(
          result.rows.map(async ({ datname }) => ({
            name: datname,
            schemas: await this.getSchemasForDatabase(
              connection,
              credentials.password,
              datname,
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
      connection.database || "postgres",
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
    return this.withClient(connection, credentials.password, async (client) => {
      const result = await client.query<RoleRow>(`
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

      return result.rows.map(({ rolname, role_type }) => ({
        name: rolname,
        type: role_type,
      }));
    });
  }

  public async getTypes(
    connection: SavedConnection,
    credentials: ConnectionCredentials,
  ): Promise<DatabaseTypeDefinition[]> {
    return this.withClient(connection, credentials.password, async (client) => {
      const result = await client.query<TypeRow>(`
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

      return result.rows.map(({ schema_name, type_name }) => ({
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
    return this.withClient(connection, credentials.password, async (client) => {
      const result = await client.query<TableRow>(
        `
        select table_name, table_type
        from information_schema.tables
        where table_schema = $1
        order by table_name
      `,
        [schema],
      );

      return result.rows.map(({ table_name, table_type }) => ({
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
    return this.withClient(connection, credentials.password, async (client) => {
      const result = await client.query<ColumnRow>(
        `
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = $1
          and table_name = $2
        order by ordinal_position
      `,
        [table.schema, table.table],
      );

      return result.rows.map(({ column_name, data_type, is_nullable }) => ({
        name: column_name,
        dataType: data_type,
        isNullable: is_nullable === "YES",
      }));
    });
  }

  public async executeQuery(
    connection: SavedConnection,
    credentials: ConnectionCredentials,
    sql: string,
  ): Promise<QueryExecutionResult> {
    return this.withClient(connection, credentials.password, async (client) => {
      const startedAt = Date.now();
      const result = await client.query<PostgresRow>(sql);

      return {
        columns: result.fields.map((field) => ({ name: field.name })),
        rows: result.rows,
        rowCount: result.rowCount ?? result.rows.length,
        durationMs: Date.now() - startedAt,
        message: `Query completed against ${connection.database}.`,
      };
    });
  }

  private async getSchemasForDatabase(
    connection: SavedConnection,
    password: string,
    database?: string,
  ): Promise<string[]> {
    return this.withClient(
      connection,
      password,
      async (client) => {
        const result = await client.query<SchemaNameRow>(`
        select schema_name
        from information_schema.schemata
        where schema_name not like 'pg_%'
          and schema_name <> 'information_schema'
        order by schema_name
      `);

        return result.rows.map(({ schema_name }) => schema_name);
      },
      database,
    );
  }

  private async withClient<T>(
    connection: SavedConnection,
    password: string,
    action: (client: Client) => Promise<T>,
    databaseOverride?: string,
  ): Promise<T> {
    const client = new Client(
      this.createConfig(connection, password, databaseOverride),
    );
    await client.connect();

    try {
      return await action(client);
    } finally {
      await client.end();
    }
  }

  private createConfig(
    connection: SavedConnection,
    password: string,
    databaseOverride?: string,
  ): ClientConfig {
    return {
      host: connection.host,
      port: connection.port,
      database: databaseOverride || connection.database || "postgres",
      user: connection.username,
      password,
      ssl:
        connection.sslMode === "require"
          ? { rejectUnauthorized: false }
          : undefined,
    };
  }
}
