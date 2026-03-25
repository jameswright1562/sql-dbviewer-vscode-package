import * as vscode from "vscode";
import { DatabaseService } from "../services/databaseService";
import { ExplorerNode } from "../model/connection";
import { ConnectionStore } from "../storage/connectionStore";
import { ErrorReporter } from "../services/errorReporter";

interface PlaceholderNode {
  kind: "placeholder";
  label: string;
  description?: string;
}

type TreeNode = ExplorerNode | PlaceholderNode;

export class ConnectionTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    TreeNode | undefined | void
  >();

  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(
    private readonly connectionStore: ConnectionStore,
    private readonly databaseService: DatabaseService,
    private readonly errorReporter?: ErrorReporter,
  ) {}

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  public getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.kind === "placeholder") {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.None,
      );
      item.description = element.description;
      item.contextValue = "placeholder";
      return item;
    }

    if (element.kind === "connection") {
      const item = new vscode.TreeItem(
        element.connection.name,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.description = `${element.connection.engine} · ${element.connection.database}`;
      item.tooltip = `${element.connection.host}:${element.connection.port} / ${element.connection.database}`;
      item.contextValue = "connection";
      item.iconPath = new vscode.ThemeIcon("database");
      item.command = {
        command: "sqlConnectionWorkbench.openWorkbench",
        title: "Open Workbench",
        arguments: [element],
      };
      return item;
    }

    if (element.kind === "database") {
      const item = new vscode.TreeItem(
        element.database,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.description = "schemas, roles, types";
      item.contextValue = "database";
      item.iconPath = new vscode.ThemeIcon("folder-library");
      return item;
    }

    if (element.kind === "category") {
      const labels: Record<typeof element.category, string> = {
        schemas: "Schemas",
        roles: "Roles",
        types: "Types",
      };
      const icons: Record<typeof element.category, string> = {
        schemas: "symbol-namespace",
        roles: "account",
        types: "symbol-class",
      };

      const item = new vscode.TreeItem(
        labels[element.category],
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.contextValue = `category.${element.category}`;
      item.iconPath = new vscode.ThemeIcon(icons[element.category]);
      return item;
    }

    if (element.kind === "schema") {
      const item = new vscode.TreeItem(
        element.schema,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.description = element.database;
      item.contextValue = "schema";
      item.iconPath = new vscode.ThemeIcon("symbol-namespace");
      return item;
    }

    if (element.kind === "column") {
      const item = new vscode.TreeItem(
        element.column.name,
        vscode.TreeItemCollapsibleState.None,
      );
      item.description = `${element.column.dataType}${element.column.isNullable ? " · nullable" : ""}`;
      item.tooltip = `${element.schema}.${element.table}.${element.column.name} (${element.column.dataType})`;
      item.contextValue = "column";
      item.iconPath = new vscode.ThemeIcon("symbol-field");
      return item;
    }

    if (element.kind === "role") {
      const item = new vscode.TreeItem(
        element.role.name,
        vscode.TreeItemCollapsibleState.None,
      );
      item.description = element.role.type;
      item.contextValue = "role";
      item.iconPath = new vscode.ThemeIcon("account");
      return item;
    }

    if (element.kind === "type") {
      const item = new vscode.TreeItem(
        element.typeDefinition.name,
        vscode.TreeItemCollapsibleState.None,
      );
      item.description = element.typeDefinition.schema;
      item.contextValue = "type";
      item.iconPath = new vscode.ThemeIcon("symbol-class");
      return item;
    }

    const item = new vscode.TreeItem(
      element.table,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.description = element.tableType.toLowerCase();
    item.tooltip = `${element.database}.${element.schema}.${element.table}`;
    item.contextValue = "table";
    item.iconPath = new vscode.ThemeIcon("table");
    return item;
  }

  public async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (!element) {
      const connections = this.connectionStore.getConnections();
      if (!connections.length) {
        return [
          {
            kind: "placeholder",
            label: "No connections yet",
            description: "Add a connection to start exploring data.",
          },
        ];
      }

      return connections.map((connection) => ({
        kind: "connection" as const,
        connection,
      }));
    }

    if (
      element.kind === "placeholder" ||
      element.kind === "column" ||
      element.kind === "role" ||
      element.kind === "type"
    ) {
      return [];
    }

    if (element.kind === "connection") {
      return [
        {
          kind: "database" as const,
          connection: element.connection,
          database: element.connection.database,
        },
      ];
    }

    if (element.kind === "database") {
      return [
        {
          kind: "category" as const,
          connection: element.connection,
          database: element.database,
          category: "schemas",
        },
        {
          kind: "category" as const,
          connection: element.connection,
          database: element.database,
          category: "roles",
        },
        {
          kind: "category" as const,
          connection: element.connection,
          database: element.database,
          category: "types",
        },
      ];
    }

    if (element.kind === "category") {
      if (element.category === "schemas") {
        if (!element.connection.visibleSchemas.length) {
          return [
            {
              kind: "placeholder",
              label: "No schemas selected",
              description:
                'Use "Select Visible Schemas" to populate the explorer.',
            },
          ];
        }

        return element.connection.visibleSchemas.map((schema) => ({
          kind: "schema" as const,
          connection: element.connection,
          database: element.database,
          schema,
        }));
      }

      try {
        if (element.category === "roles") {
          const roles = await this.databaseService.getRoles(element.connection);
          if (!roles.length) {
            return [
              {
                kind: "placeholder",
                label: "No roles found",
              },
            ];
          }

          return roles.map((role) => ({
            kind: "role" as const,
            connection: element.connection,
            database: element.database,
            role,
          }));
        }

        const types = await this.databaseService.getTypes(element.connection);
        if (!types.length) {
          return [
            {
              kind: "placeholder",
              label: "No types found",
            },
          ];
        }

        return types.map((typeDefinition) => ({
          kind: "type" as const,
          connection: element.connection,
          database: element.database,
          typeDefinition,
        }));
      } catch (error) {
        this.errorReporter?.error(error, {
          operation: "tree.getChildren",
          details: {
            connectionId: element.connection.id,
            connectionName: element.connection.name,
            category: element.category,
          },
        });
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load database objects.";
        return [
          {
            kind: "placeholder",
            label: `Failed to load ${element.category}`,
            description: message,
          },
        ];
      }
    }

    if (element.kind === "table") {
      try {
        const columns = await this.databaseService.getColumns(
          element.connection,
          {
            schema: element.schema,
            table: element.table,
          },
        );

        if (!columns.length) {
          return [
            {
              kind: "placeholder",
              label: "No columns found",
            },
          ];
        }

        return columns.map((column) => ({
          kind: "column" as const,
          connection: element.connection,
          database: element.database,
          schema: element.schema,
          table: element.table,
          column,
        }));
      } catch (error) {
        this.errorReporter?.error(error, {
          operation: "tree.getChildren",
          details: {
            connectionId: element.connection.id,
            connectionName: element.connection.name,
            schema: element.schema,
            table: element.table,
          },
        });
        const message =
          error instanceof Error ? error.message : "Unable to load columns.";
        return [
          {
            kind: "placeholder",
            label: "Failed to load columns",
            description: message,
          },
        ];
      }
    }

    try {
      const tables = await this.databaseService.getTables(
        element.connection,
        element.schema,
      );
      if (!tables.length) {
        return [
          {
            kind: "placeholder",
            label: "No tables found",
          },
        ];
      }

      return tables.map((table) => ({
        kind: "table" as const,
        connection: element.connection,
        database: element.database,
        schema: table.schema,
        table: table.name,
        tableType: table.type,
      }));
    } catch (error) {
      this.errorReporter?.error(error, {
        operation: "tree.getChildren",
        details: {
          connectionId: element.connection.id,
          connectionName: element.connection.name,
          schema: element.schema,
        },
      });
      const message =
        error instanceof Error ? error.message : "Unable to load tables.";
      return [
        {
          kind: "placeholder",
          label: "Failed to load schema",
          description: message,
        },
      ];
    }
  }

  public getParent(element: TreeNode): TreeNode | undefined {
    if (element.kind === "database") {
      const connection = this.connectionStore.getConnection(
        element.connection.id,
      );
      if (!connection) {
        return undefined;
      }

      return {
        kind: "connection",
        connection,
      };
    }

    if (element.kind === "category") {
      const connection = this.connectionStore.getConnection(
        element.connection.id,
      );
      if (!connection) {
        return undefined;
      }

      return {
        kind: "database",
        connection,
        database: element.database,
      };
    }

    if (element.kind === "schema") {
      const connection = this.connectionStore.getConnection(
        element.connection.id,
      );
      if (!connection) {
        return undefined;
      }

      return {
        kind: "category",
        connection,
        database: element.database,
        category: "schemas",
      };
    }

    if (element.kind === "table") {
      const connection = this.connectionStore.getConnection(
        element.connection.id,
      );
      if (!connection) {
        return undefined;
      }

      return {
        kind: "schema",
        connection,
        database: element.database,
        schema: element.schema,
      };
    }

    if (element.kind === "column") {
      const connection = this.connectionStore.getConnection(
        element.connection.id,
      );
      if (!connection) {
        return undefined;
      }

      return {
        kind: "table",
        connection,
        database: element.database,
        schema: element.schema,
        table: element.table,
        tableType: "table",
      };
    }

    if (element.kind === "role" || element.kind === "type") {
      const connection = this.connectionStore.getConnection(
        element.connection.id,
      );
      if (!connection) {
        return undefined;
      }

      return {
        kind: "category",
        connection,
        database: element.database,
        category: element.kind === "role" ? "roles" : "types",
      };
    }

    return undefined;
  }
}
