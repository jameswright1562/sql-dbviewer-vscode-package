import { AwsSecretProvider } from './awsSecretProvider';
import { ConnectionStore } from '../storage/connectionStore';
import { DatabaseEngine, DatabaseRole, DatabaseTypeDefinition, DiscoveredDatabase, QueryExecutionResult, SavedConnection, SchemaTable } from '../model/connection';
import { ConnectionCredentials, DatabaseAdapter, MySqlAdapter, PostgresAdapter, SqlServerAdapter } from '../db/databaseAdapters';
import { ErrorReporter } from './errorReporter';

export class DatabaseService {
  private readonly adapters = new Map<SavedConnection['engine'], DatabaseAdapter>();

  public constructor(
    private readonly connectionStore: ConnectionStore,
    private readonly awsSecretProvider: AwsSecretProvider,
    private readonly errorReporter?: ErrorReporter,
    adapters?: DatabaseAdapter[]
  ) {
    const resolvedAdapters = adapters ?? [
      new PostgresAdapter(),
      new MySqlAdapter(),
      new SqlServerAdapter()
    ];

    resolvedAdapters.forEach((adapter) => {
      this.adapters.set(adapter.engine, adapter);
    });
  }

  public async testConnection(connection: SavedConnection, passwordOverride?: string): Promise<void> {
    await this.withResolvedCredentials(connection, (adapter, credentials) =>
      adapter.testConnection(connection, credentials)
    , false, passwordOverride);
  }

  public async getSchemas(connection: SavedConnection): Promise<string[]> {
    return this.withResolvedCredentials(connection, (adapter, credentials) =>
      adapter.getSchemas(connection, credentials)
    );
  }

  public async getRoles(connection: SavedConnection): Promise<DatabaseRole[]> {
    return this.withResolvedCredentials(connection, (adapter, credentials) =>
      adapter.getRoles(connection, credentials)
    );
  }

  public async getTypes(connection: SavedConnection): Promise<DatabaseTypeDefinition[]> {
    return this.withResolvedCredentials(connection, (adapter, credentials) =>
      adapter.getTypes(connection, credentials)
    );
  }

  public async discoverDatabases(connection: SavedConnection, passwordOverride?: string): Promise<DiscoveredDatabase[]> {
    return this.withResolvedCredentials(connection, (adapter, credentials) =>
      adapter.discoverDatabases(connection, credentials)
    , false, passwordOverride);
  }

  public async getTables(connection: SavedConnection, schema: string): Promise<SchemaTable[]> {
    return this.withResolvedCredentials(connection, (adapter, credentials) =>
      adapter.getTables(connection, credentials, schema)
    );
  }

  public async executeQuery(connection: SavedConnection, sql: string, passwordOverride?: string): Promise<QueryExecutionResult> {
    return this.withResolvedCredentials(connection, (adapter, credentials) =>
      adapter.executeQuery(connection, credentials, sql)
    , false, passwordOverride);
  }

  private async withResolvedCredentials<T>(
    connection: SavedConnection,
    run: (adapter: DatabaseAdapter, credentials: ConnectionCredentials) => Promise<T>,
    hasRetried = false,
    passwordOverride?: string
  ): Promise<T> {
    const adapter = this.getAdapter(connection);

    try {
      const credentials = await this.resolveCredentials(connection, passwordOverride);
      return await run(adapter, credentials);
    } catch (error) {
      if (!hasRetried && connection.authMode === 'awsSecret' && this.isAuthenticationError(error)) {
        this.errorReporter?.warn('Authentication failed. Invalidating cached AWS secret and retrying once.', {
          connectionId: connection.id,
          connectionName: connection.name,
          engine: connection.engine
        });
        this.awsSecretProvider.invalidate(connection);
        return this.withResolvedCredentials(connection, run, true, passwordOverride);
      }

      this.errorReporter?.error(error, {
        operation: 'database.operation',
        details: {
          connectionId: connection.id,
          connectionName: connection.name,
          engine: connection.engine,
          database: connection.database,
          hasRetried
        }
      });
      throw error;
    }
  }

  private async resolveCredentials(connection: SavedConnection, passwordOverride?: string): Promise<ConnectionCredentials> {
    if (connection.authMode === 'awsSecret') {
      return {
        password: await this.awsSecretProvider.getPassword(connection)
      };
    }

    if (passwordOverride?.trim()) {
      return { password: passwordOverride.trim() };
    }

    const password = await this.connectionStore.getPassword(connection.id);
    if (!password) {
      throw new Error(`No stored password was found for "${connection.name}".`);
    }

    return { password };
  }

  private getAdapter(connection: SavedConnection): DatabaseAdapter {
    const adapter = this.adapters.get(connection.engine);
    if (!adapter) {
      throw new Error(`Unsupported database engine: ${connection.engine}`);
    }

    return adapter;
  }

  public registerAdapter(adapter: DatabaseAdapter): void {
    this.adapters.set(adapter.engine as DatabaseEngine, adapter);
  }

  private isAuthenticationError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const authMarkers = ['28P01', 'ER_ACCESS_DENIED_ERROR', 'ELOGIN', 'Access denied', 'password authentication failed', 'Login failed'];
    const errorText = `${error.name} ${error.message}`;
    return authMarkers.some((marker) => errorText.includes(marker));
  }
}
