import { ConnectionDraft, DatabaseEngine, WorkbenchConnection } from './protocol';

export const defaultPorts: Record<DatabaseEngine, number> = {
  postgres: 5432,
  mysql: 3306,
  sqlserver: 1433
};

export function getDefaultQuery(engine: DatabaseEngine): string {
  switch (engine) {
    case 'mysql':
      return 'SELECT NOW() AS current_timestamp;';
    case 'sqlserver':
      return 'SELECT SYSDATETIME() AS current_timestamp;';
    default:
      return 'SELECT CURRENT_TIMESTAMP;';
  }
}

export function createEmptyDraft(engine: DatabaseEngine = 'postgres'): ConnectionDraft {
  return {
    engine,
    name: '',
    host: '',
    port: defaultPorts[engine],
    database: '',
    username: '',
    sslMode: 'disable',
    authMode: 'storedPassword',
    visibleSchemas: [],
    awsSecret: {
      secretId: '',
      profile: '',
      passwordKey: 'password',
      region: ''
    },
    password: ''
  };
}

export function cloneConnectionToDraft(connection: WorkbenchConnection): ConnectionDraft {
  return {
    id: connection.id,
    engine: connection.engine,
    name: connection.name,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.username,
    sslMode: connection.sslMode,
    authMode: connection.authMode,
    visibleSchemas: [...connection.visibleSchemas],
    awsSecret: {
      secretId: connection.awsSecret?.secretId ?? '',
      profile: connection.awsSecret?.profile ?? '',
      passwordKey: connection.awsSecret?.passwordKey ?? 'password',
      region: connection.awsSecret?.region ?? ''
    },
    password: ''
  };
}

export function getEngineLabel(engine: DatabaseEngine): string {
  switch (engine) {
    case 'postgres':
      return 'PostgreSQL';
    case 'mysql':
      return 'MySQL';
    case 'sqlserver':
      return 'SQL Server';
  }
}
