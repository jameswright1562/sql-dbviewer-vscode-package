import { DatabaseEngine } from '../model/connection';
import { TableReference } from './types';

export const TABLE_PREVIEW_LIMIT = 100;

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

export function buildPreviewTableSql(
  engine: DatabaseEngine,
  table: TableReference,
  limit = TABLE_PREVIEW_LIMIT
): string {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('Preview row limit must be a positive integer.');
  }

  if (engine === 'sqlserver') {
    return `SELECT TOP (${limit}) *\nFROM ${formatQualifiedTableName(engine, table)};`;
  }

  return `SELECT *\nFROM ${formatQualifiedTableName(engine, table)}\nLIMIT ${limit};`;
}

function formatQualifiedTableName(engine: DatabaseEngine, table: TableReference): string {
  return `${quoteIdentifier(engine, table.schema)}.${quoteIdentifier(engine, table.table)}`;
}

function quoteIdentifier(engine: DatabaseEngine, value: string): string {
  if (engine === 'mysql') {
    return `\`${value.replaceAll('`', '``')}\``;
  }

  if (engine === 'sqlserver') {
    return `[${value.replaceAll(']', ']]')}]`;
  }

  return `"${value.replaceAll('"', '""')}"`;
}
