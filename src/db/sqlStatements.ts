import { DatabaseEngine, TableFilterDefinition } from '../model/connection';
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

export function buildFilteredTableSql(
  engine: DatabaseEngine,
  table: TableReference,
  filters: TableFilterDefinition[],
  limit = TABLE_PREVIEW_LIMIT
): string {
  const normalizedFilters = filters.filter((filter) => {
    if (!filter.columnName.trim()) {
      return false;
    }

    return filter.operator === 'isNull' || filter.operator === 'isNotNull' || Boolean(filter.value?.trim());
  });

  if (!normalizedFilters.length) {
    return buildPreviewTableSql(engine, table, limit);
  }

  const qualifiedTableName = formatQualifiedTableName(engine, table);
  const whereClause = normalizedFilters
    .map((filter) => buildFilterClause(engine, filter))
    .join('\n  AND ');

  if (engine === 'sqlserver') {
    return `SELECT TOP (${limit}) *\nFROM ${qualifiedTableName}\nWHERE ${whereClause};`;
  }

  return `SELECT *\nFROM ${qualifiedTableName}\nWHERE ${whereClause}\nLIMIT ${limit};`;
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

function buildFilterClause(engine: DatabaseEngine, filter: TableFilterDefinition): string {
  const column = quoteIdentifier(engine, filter.columnName.trim());
  const value = filter.value?.trim() ?? '';

  switch (filter.operator) {
    case 'equals':
      return `${column} = ${formatLiteral(value)}`;
    case 'notEquals':
      return `${column} <> ${formatLiteral(value)}`;
    case 'contains':
      return `${column} LIKE ${formatLiteral(`%${escapeLike(value)}%`)}`;
    case 'startsWith':
      return `${column} LIKE ${formatLiteral(`${escapeLike(value)}%`)}`;
    case 'endsWith':
      return `${column} LIKE ${formatLiteral(`%${escapeLike(value)}`)}`;
    case 'greaterThan':
      return `${column} > ${formatLiteral(value)}`;
    case 'greaterThanOrEqual':
      return `${column} >= ${formatLiteral(value)}`;
    case 'lessThan':
      return `${column} < ${formatLiteral(value)}`;
    case 'lessThanOrEqual':
      return `${column} <= ${formatLiteral(value)}`;
    case 'isNull':
      return `${column} IS NULL`;
    case 'isNotNull':
      return `${column} IS NOT NULL`;
  }
}

function formatLiteral(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return value;
  }

  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase();
  }

  return `'${value.replaceAll("'", "''")}'`;
}

function escapeLike(value: string): string {
  return value.replaceAll('%', '\\%').replaceAll('_', '\\_');
}
