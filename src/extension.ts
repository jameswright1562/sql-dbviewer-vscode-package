import * as vscode from "vscode";
import { AwsSecretProvider } from "./services/awsSecretProvider";
import { DatabaseService } from "./services/databaseService";
import { ConnectionStore } from "./storage/connectionStore";
import { ConnectionTreeProvider } from "./tree/connectionTreeProvider";
import { WorkbenchPanel } from "./ui/workbenchPanel";
import { WorkbenchSidebarViewProvider } from "./ui/workbenchSidebarViewProvider";
import { TablePanel } from "./ui/tablePanel";
import { ExplorerConnectionNode, ExplorerTableNode } from "./model/connection";
import { ErrorReporter } from "./services/errorReporter";

export function activate(context: vscode.ExtensionContext): void {
  const errorReporter = new ErrorReporter(
    context.extensionMode !== vscode.ExtensionMode.Production,
  );
  const connectionStore = new ConnectionStore(context);
  const awsSecretProvider = new AwsSecretProvider(errorReporter);
  const databaseService = new DatabaseService(
    connectionStore,
    awsSecretProvider,
    errorReporter,
  );
  const treeProvider = new ConnectionTreeProvider(
    connectionStore,
    databaseService,
    errorReporter,
  );
  const workbenchPanel = new WorkbenchPanel(
    context,
    connectionStore,
    databaseService,
    treeProvider,
    errorReporter,
  );
  const workbenchSidebar = new WorkbenchSidebarViewProvider(
    context,
    connectionStore,
    errorReporter,
  );
  const tablePanel = new TablePanel(
    context,
    connectionStore,
    databaseService,
    errorReporter,
  );

  errorReporter.info("Extension activated.", {
    extensionMode: vscode.ExtensionMode[context.extensionMode],
  });

  context.subscriptions.push(
    errorReporter,
    vscode.window.createTreeView("sqlConnectionWorkbench.connectionsView", {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
    }),
    vscode.window.registerWebviewViewProvider(
      WorkbenchSidebarViewProvider.viewType,
      workbenchSidebar,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      },
    ),
    registerCommand(
      context,
      errorReporter,
      "sqlConnectionWorkbench.openWorkbench",
      async (target?: ExplorerConnectionNode | ExplorerTableNode) => {
        await workbenchPanel.show(target);
      },
    ),
    registerCommand(
      context,
      errorReporter,
      "sqlConnectionWorkbench.addConnection",
      async () => {
        await workbenchPanel.showNewConnection();
      },
    ),
    registerCommand(
      context,
      errorReporter,
      "sqlConnectionWorkbench.refreshConnections",
      async () => {
        treeProvider.refresh();
        await workbenchPanel.handleConnectionsChanged();
      },
    ),
    registerCommand(
      context,
      errorReporter,
      "sqlConnectionWorkbench.editConnection",
      async (target?: ExplorerConnectionNode | ExplorerTableNode) => {
        await workbenchPanel.show(target);
      },
    ),
    registerCommand(
      context,
      errorReporter,
      "sqlConnectionWorkbench.removeConnection",
      async (target?: ExplorerConnectionNode) => {
        if (!target?.connection) {
          return;
        }

        const confirmation = await vscode.window.showWarningMessage(
          `Remove connection "${target.connection.name}"?`,
          { modal: true },
          "Remove",
        );

        if (confirmation === "Remove") {
          await connectionStore.removeConnection(target.connection.id);
        }
      },
    ),
    registerCommand(
      context,
      errorReporter,
      "sqlConnectionWorkbench.selectSchemas",
      async (target?: ExplorerConnectionNode | ExplorerTableNode) => {
        const connectionId = target?.connection.id;
        if (!connectionId) {
          return;
        }

        await workbenchPanel.promptSchemaSelection(connectionId);
      },
    ),
    registerCommand(
      context,
      errorReporter,
      "sqlConnectionWorkbench.previewTable",
      async (target?: ExplorerTableNode) => {
        if (!target) {
          return;
        }

        await tablePanel.show(target);
      },
    ),
    {
      dispose: () => {
        workbenchPanel.dispose();
        tablePanel.dispose();
      },
    },
  );

  context.subscriptions.push(
    connectionStore.onDidChange(() => {
      treeProvider.refresh();
      void workbenchPanel.handleConnectionsChanged().catch((error) => {
        const normalized = errorReporter.error(error, {
          operation: "extension.onDidChangeConnectionStore",
        });
        void vscode.window.showErrorMessage(normalized.message);
      });
      void tablePanel.handleConnectionsChanged().catch((error) => {
        const normalized = errorReporter.error(error, {
          operation: "extension.onDidChangeTablePanel",
        });
        void vscode.window.showErrorMessage(normalized.message);
      });
    }),
  );

  void awsSecretProvider
    .prewarm(connectionStore.getConnections())
    .catch((error) => {
      const normalized = errorReporter.error(error, {
        operation: "extension.prewarmAwsSecrets",
      });
      void vscode.window.showWarningMessage(normalized.message);
    });
}

export function deactivate(): void {}

function registerCommand<T extends unknown[]>(
  context: vscode.ExtensionContext,
  errorReporter: ErrorReporter,
  command: string,
  handler: (...args: T) => Promise<void>,
): vscode.Disposable {
  return vscode.commands.registerCommand(command, async (...args: T) => {
    try {
      await handler(...args);
    } catch (error) {
      const normalized = errorReporter.error(error, {
        operation: `command.${command}`,
        details: {
          extensionMode: vscode.ExtensionMode[context.extensionMode],
          argumentCount: args.length,
        },
      });

      void vscode.window.showErrorMessage(
        `${command} failed: ${normalized.message}`,
      );
    }
  });
}
