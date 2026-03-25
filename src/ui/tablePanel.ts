import * as vscode from "vscode";
import {
  buildSortedAndFilteredTableSql,
  buildPreviewTableSql,
} from "../db/databaseAdapters";
import {
  ExplorerTableNode,
  TableFilterDefinition,
  TableSortDefinition,
} from "../model/connection";
import { DatabaseService } from "../services/databaseService";
import { ErrorReporter } from "../services/errorReporter";
import { ConnectionStore } from "../storage/connectionStore";
import {
  ExtensionToWebviewMessage,
  TableViewMessage,
  TableViewState,
} from "../types";
import { getReactWebviewHtml } from "./webview/reactWebviewHtml";
import { getPanelIconPath } from "./webview/panelIcon";

export class TablePanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private currentNode?: ExplorerTableNode;
  private currentState?: TableViewState;
  private currentSql?: string;
  private currentFilters: TableFilterDefinition[] = [];
  private currentSort?: TableSortDefinition;
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly connectionStore: ConnectionStore,
    private readonly databaseService: DatabaseService,
    private readonly errorReporter: ErrorReporter,
  ) {}

  public async show(node: ExplorerTableNode): Promise<void> {
    const hasChangedTable =
      this.currentNode?.connection.id !== node.connection.id ||
      this.currentNode?.schema !== node.schema ||
      this.currentNode?.table !== node.table;
    this.currentNode = node;
    if (hasChangedTable) {
      this.currentFilters = [];
      this.currentSql = buildPreviewTableSql(node.connection.engine, {
        schema: node.schema,
        table: node.table,
      });
    }
    const panel = this.ensurePanel();
    panel.title = `${node.schema}.${node.table}`;
    panel.reveal(vscode.ViewColumn.Two);
    await this.refresh();
  }

  public async handleConnectionsChanged(): Promise<void> {
    if (!this.currentNode || !this.panel) {
      return;
    }

    const connection = this.connectionStore.getConnection(
      this.currentNode.connection.id,
    );
    if (!connection) {
      await this.postNotification(
        "error",
        "The connection for this table preview was removed.",
      );
      this.dispose();
      return;
    }

    this.currentNode = {
      ...this.currentNode,
      connection,
    };

    await this.refresh();
  }

  public dispose(): void {
    this.panel?.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private ensurePanel(): vscode.WebviewPanel {
    if (this.panel) {
      return this.panel;
    }

    const panel = vscode.window.createWebviewPanel(
      "sqlConnectionWorkbench.tablePreview",
      "Table Preview",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, "web", "dist"),
        ],
      },
    );

    panel.iconPath = getPanelIconPath(this.context.extensionUri);
    panel.webview.html = getReactWebviewHtml(
      this.context.extensionUri,
      panel.webview,
      "table",
    );
    panel.webview.onDidReceiveMessage(
      (message: TableViewMessage) => {
        void this.handleMessage(message);
      },
      undefined,
      this.disposables,
    );
    panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.currentNode = undefined;
        this.currentState = undefined;
      },
      undefined,
      this.disposables,
    );

    this.panel = panel;
    return panel;
  }

  private async handleMessage(message: TableViewMessage): Promise<void> {
    if (!this.currentNode) {
      return;
    }

    try {
      switch (message.type) {
        case "ready":
          await this.postState();
          break;
        case "refresh":
          await this.refresh();
          break;
        case "runQuery":
          await this.runCustomQuery(message.sql);
          break;
        case "applyFilters":
          await this.applyFilters(message.filters);
          break;
        case "applySort":
          await this.applySort({
            columnName: message.columnName,
            direction: message.direction,
          });
          break;
        case "resetSql":
          await this.resetSql();
          break;
        case "openWorkbench":
          await vscode.commands.executeCommand(
            "sqlConnectionWorkbench.openWorkbench",
            message.connectionId,
          );
          break;
      }
    } catch (error) {
      const normalized = this.errorReporter.error(error, {
        operation: "tablePanel.handleMessage",
        details: {
          messageType: message.type,
          connectionId: this.currentNode.connection.id,
          table: this.currentNode.table,
        },
      });

      await this.postNotification("error", normalized.message);
    }
  }

  private async refresh(): Promise<void> {
    if (!this.currentNode) {
      return;
    }

    const { connection, schema, table } = this.currentNode;
    const previewSql = buildPreviewTableSql(connection.engine, {
      schema,
      table,
    });
    const currentSql = this.currentSql ?? previewSql;

    try {
      const [columns, result] = await Promise.all([
        this.databaseService.getColumns(connection, { schema, table }),
        this.databaseService.executeQuery(connection, currentSql).then((x) => {
          return {
            ...x,
            columns: x.columns.map((x) => {
              if (x.name != this.currentSort?.columnName) return x;
              return {
                ...x,
                sort: this.currentSort?.direction,
              };
            }),
          };
        }),
      ]);

      this.currentSql = currentSql;
      this.currentState = {
        connectionId: connection.id,
        connectionName: connection.name,
        engine: connection.engine,
        database: this.currentNode.database,
        schema,
        table,
        previewSql,
        currentSql,
        columns,
        filters: [...this.currentFilters],
        result,
      };
    } catch (error) {
      const normalized = this.errorReporter.error(error, {
        operation: "tablePanel.refresh",
        details: {
          connectionId: connection.id,
          connectionName: connection.name,
          schema,
          table,
        },
      });

      this.currentState = {
        connectionId: connection.id,
        connectionName: connection.name,
        engine: connection.engine,
        database: this.currentNode.database,
        schema,
        table,
        previewSql,
        currentSql,
        columns: this.currentState?.columns ?? [],
        filters: [...this.currentFilters],
        errorMessage: normalized.message,
      };
    }

    await this.postState();
  }

  private async runCustomQuery(sql: string): Promise<void> {
    const trimmedSql = sql.trim();
    if (!trimmedSql) {
      throw new Error("Enter a SQL query before running it.");
    }

    this.currentSql = sql;
    await this.refresh();
  }

  private async applyFilters(filters: TableFilterDefinition[]): Promise<void> {
    if (!this.currentNode) {
      return;
    }

    this.currentFilters = filters;
    this.currentSql = buildSortedAndFilteredTableSql(
      this.currentNode.connection.engine,
      {
        schema: this.currentNode.schema,
        table: this.currentNode.table,
      },
      filters,
      this.currentSort,
    );
    await this.refresh();
  }

  private async applySort(sort: TableSortDefinition): Promise<void> {
    if (!this.currentNode) {
      return;
    }

    this.currentSort = sort;
    this.currentSql = buildSortedAndFilteredTableSql(
      this.currentNode.connection.engine,
      {
        schema: this.currentNode.schema,
        table: this.currentNode.table,
      },
      this.currentFilters,
      this.currentSort,
    );
    await this.refresh();
  }

  private async resetSql(): Promise<void> {
    if (!this.currentNode) {
      return;
    }

    this.currentFilters = [];
    this.currentSql = buildPreviewTableSql(this.currentNode.connection.engine, {
      schema: this.currentNode.schema,
      table: this.currentNode.table,
    });
    await this.refresh();
  }

  private async postState(): Promise<void> {
    if (!this.panel || !this.currentState) {
      return;
    }

    const delivered = await this.panel.webview.postMessage({
      type: "tableState",
      state: this.currentState,
    } satisfies ExtensionToWebviewMessage);

    if (!delivered) {
      this.errorReporter.warn(
        "Table preview state message was not delivered.",
        {
          connectionId: this.currentState.connectionId,
          table: `${this.currentState.schema}.${this.currentState.table}`,
        },
      );
    }
  }

  private async postNotification(
    level: "info" | "error",
    message: string,
  ): Promise<void> {
    if (this.panel) {
      await this.panel.webview.postMessage({
        type: "notification",
        level,
        message,
      } satisfies ExtensionToWebviewMessage);
    }

    if (level === "error") {
      void vscode.window.showErrorMessage(message);
    }
  }
}
