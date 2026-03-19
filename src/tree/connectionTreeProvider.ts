import * as vscode from 'vscode';
import { DatabaseService } from '../services/databaseService';
import { SavedConnection, ExplorerNode } from '../model/connection';
import { ConnectionStore } from '../storage/connectionStore';
import { ErrorReporter } from '../services/errorReporter';

interface PlaceholderNode {
  kind: 'placeholder';
  label: string;
  description?: string;
}

type TreeNode = ExplorerNode | PlaceholderNode;

export class ConnectionTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TreeNode | undefined | void>();

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(
    private readonly connectionStore: ConnectionStore,
    private readonly databaseService: DatabaseService,
    private readonly errorReporter?: ErrorReporter
  ) {}

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  public getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.kind === 'placeholder') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.description = element.description;
      item.contextValue = 'placeholder';
      return item;
    }

    if (element.kind === 'connection') {
      const item = new vscode.TreeItem(element.connection.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.description = `${element.connection.engine} · ${element.connection.database}`;
      item.tooltip = `${element.connection.host}:${element.connection.port} / ${element.connection.database}`;
      item.contextValue = 'connection';
      item.iconPath = new vscode.ThemeIcon('database');
      item.command = {
        command: 'sqlConnectionWorkbench.openWorkbench',
        title: 'Open Workbench',
        arguments: [element]
      };
      return item;
    }

    if (element.kind === 'database') {
      const item = new vscode.TreeItem(element.database, vscode.TreeItemCollapsibleState.Collapsed);
      item.description = `${element.connection.visibleSchemas.length} schema(s)`;
      item.contextValue = 'database';
      item.iconPath = new vscode.ThemeIcon('folder-library');
      return item;
    }

    if (element.kind === 'schema') {
      const item = new vscode.TreeItem(element.schema, vscode.TreeItemCollapsibleState.Collapsed);
      item.description = element.database;
      item.contextValue = 'schema';
      item.iconPath = new vscode.ThemeIcon('symbol-namespace');
      return item;
    }

    const item = new vscode.TreeItem(element.table, vscode.TreeItemCollapsibleState.None);
    item.description = element.tableType.toLowerCase();
    item.tooltip = `${element.database}.${element.schema}.${element.table}`;
    item.contextValue = 'table';
    item.iconPath = new vscode.ThemeIcon('table');
    item.command = {
      command: 'sqlConnectionWorkbench.previewTable',
      title: 'Preview Table',
      arguments: [element]
    };
    return item;
  }

  public async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!element) {
      const connections = this.connectionStore.getConnections();
      if (!connections.length) {
        return [{
          kind: 'placeholder',
          label: 'No connections yet',
          description: 'Add a connection to start exploring data.'
        }];
      }

      return connections.map((connection) => ({
        kind: 'connection' as const,
        connection
      }));
    }

    if (element.kind === 'placeholder' || element.kind === 'table') {
      return [];
    }

    if (element.kind === 'connection') {
      const connection = element.connection;
      if (!connection.visibleSchemas.length) {
        return [{
          kind: 'placeholder',
          label: 'No schemas selected',
          description: 'Use "Select Visible Schemas" to populate the explorer.'
        }];
      }

      return [{
        kind: 'database' as const,
        connection,
        database: connection.database
      }];
    }

    if (element.kind === 'database') {
      return element.connection.visibleSchemas.map((schema) => ({
        kind: 'schema' as const,
        connection: element.connection,
        database: element.database,
        schema
      }));
    }

    try {
      const tables = await this.databaseService.getTables(element.connection, element.schema);
      if (!tables.length) {
        return [{
          kind: 'placeholder',
          label: 'No tables found'
        }];
      }

      return tables.map((table) => ({
        kind: 'table' as const,
        connection: element.connection,
        database: element.database,
        schema: table.schema,
        table: table.name,
        tableType: table.type
      }));
    } catch (error) {
      this.errorReporter?.error(error, {
        operation: 'tree.getChildren',
        details: {
          connectionId: element.connection.id,
          connectionName: element.connection.name,
          schema: element.schema
        }
      });
      const message = error instanceof Error ? error.message : 'Unable to load tables.';
      return [{
        kind: 'placeholder',
        label: 'Failed to load schema',
        description: message
      }];
    }
  }

  public getParent(element: TreeNode): TreeNode | undefined {
    if (element.kind === 'database') {
      const connection = this.connectionStore.getConnection(element.connection.id);
      if (!connection) {
        return undefined;
      }

      return {
        kind: 'connection',
        connection
      };
    }

    if (element.kind === 'schema') {
      const connection = this.connectionStore.getConnection(element.connection.id);
      if (!connection) {
        return undefined;
      }

      return {
        kind: 'database',
        connection,
        database: element.database
      };
    }

    if (element.kind === 'table') {
      const connection = this.connectionStore.getConnection(element.connection.id);
      if (!connection) {
        return undefined;
      }

      return {
        kind: 'schema',
        connection,
        database: element.database,
        schema: element.schema
      };
    }

    return undefined;
  }

  public buildPreviewQuery(connection: SavedConnection, schema: string, table: string): string {
    if (connection.engine === 'sqlserver') {
      return `SELECT TOP 100 *\nFROM [${schema}].[${table}];`;
    }

    const quote = connection.engine === 'mysql' ? '`' : '"';
    const qualifiedName = `${quote}${schema}${quote}.${quote}${table}${quote}`;
    return `SELECT *\nFROM ${qualifiedName}\nLIMIT 100;`;
  }
}
