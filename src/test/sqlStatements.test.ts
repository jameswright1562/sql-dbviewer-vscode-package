import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFilteredTableSql } from '../db/sqlStatements';

test('buildFilteredTableSql creates a preview query with filters for postgres', () => {
  const sql = buildFilteredTableSql(
    'postgres',
    { schema: 'public', table: 'orders' },
    [
      { columnName: 'status', operator: 'equals', value: 'open' },
      { columnName: 'customer_name', operator: 'contains', value: 'Jane' }
    ]
  );

  assert.equal(
    sql,
    `SELECT *\nFROM "public"."orders"\nWHERE "status" = 'open'\n  AND "customer_name" LIKE '%Jane%'\nLIMIT 100;`
  );
});

test('buildFilteredTableSql falls back to the base preview query when filters are empty', () => {
  const sql = buildFilteredTableSql('mysql', { schema: 'analytics', table: 'events' }, []);

  assert.equal(sql, 'SELECT *\nFROM `analytics`.`events`\nLIMIT 100;');
});
