import * as vscode from 'vscode';
import { DatabaseService } from '../services/databaseService';
import { ConnectionStore } from '../storage/connectionStore';
import {
  ConnectionDraft,
  DiscoveredDatabase,
  ExplorerConnectionNode,
  ExplorerTableNode,
  QueryExecutionResult,
  SavedConnection
} from '../model/connection';
import { ConnectionTreeProvider } from '../tree/connectionTreeProvider';
import { ExtensionToWebviewMessage, WorkbenchMessage, WorkbenchState } from '../types';
import { ErrorReporter } from '../services/errorReporter';
import { resolveSelectedConnectionId } from './workbenchSelection';

type WorkbenchTarget = ExplorerConnectionNode | ExplorerTableNode | SavedConnection | string | undefined;

export class WorkbenchPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private selectedConnectionId?: string;
  private isCreatingNewConnection = false;
  private discoveredDatabases: DiscoveredDatabase[] = [];
  private readonly queryByConnectionId = new Map<string, string>();
  private readonly resultByConnectionId = new Map<string, QueryExecutionResult>();
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly connectionStore: ConnectionStore,
    private readonly databaseService: DatabaseService,
    private readonly treeProvider: ConnectionTreeProvider,
    private readonly errorReporter: ErrorReporter
  ) {}

  public async show(target?: WorkbenchTarget): Promise<void> {
    await this.errorReporter.capture({
      operation: 'workbench.show',
      details: {
        targetType: typeof target === 'string' ? 'connectionId' : target && 'kind' in target ? target.kind : target ? 'connection' : 'none'
      }
    }, async () => {
      this.applyTarget(target);

      if (!this.panel) {
        this.panel = vscode.window.createWebviewPanel(
          'sqlConnectionWorkbench.panel',
          'SQL Workbench',
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
          }
        );

        this.panel.onDidDispose(() => {
          this.panel = undefined;
        }, null, this.disposables);

        this.panel.webview.onDidReceiveMessage(async (message: WorkbenchMessage) => {
          await this.handleMessage(message);
        }, null, this.disposables);

        this.panel.webview.html = this.getHtml(this.panel.webview);
      } else {
        this.panel.reveal(vscode.ViewColumn.One);
      }

      await this.postState();
    });
  }

  public async showNewConnection(): Promise<void> {
    this.isCreatingNewConnection = true;
    this.selectedConnectionId = undefined;
    this.clearDiscovery();
    await this.connectionStore.setLastSelectedConnectionId(undefined);
    await this.show();
  }

  public async revealConnection(connectionId?: string): Promise<void> {
    this.isCreatingNewConnection = false;
    this.selectedConnectionId = connectionId;
    this.clearDiscovery();
    await this.connectionStore.setLastSelectedConnectionId(connectionId);
    await this.show(connectionId);
  }

  public async previewTable(node: ExplorerTableNode): Promise<void> {
    this.isCreatingNewConnection = false;
    this.selectedConnectionId = node.connection.id;
    this.clearDiscovery();
    this.queryByConnectionId.set(
      node.connection.id,
      this.treeProvider.buildPreviewQuery(node.connection, node.schema, node.table)
    );
    await this.connectionStore.setLastSelectedConnectionId(node.connection.id);
    await this.show(node);
  }

  public async handleConnectionsChanged(): Promise<void> {
    await this.errorReporter.capture({
      operation: 'workbench.handleConnectionsChanged'
    }, async () => {
      const connections = this.connectionStore.getConnections();
      this.selectedConnectionId = resolveSelectedConnectionId({
        connections,
        selectedConnectionId: this.selectedConnectionId,
        lastSelectedConnectionId: this.connectionStore.getLastSelectedConnectionId(),
        isCreatingNewConnection: this.isCreatingNewConnection
      });

      await this.postState();
    });
  }

  public async promptSchemaSelection(connectionId: string): Promise<void> {
    await this.errorReporter.capture({
      operation: 'workbench.promptSchemaSelection',
      details: {
        connectionId
      }
    }, async () => {
      const connection = this.connectionStore.getConnection(connectionId);
      if (!connection) {
        return;
      }

      const schemas = await this.databaseService.getSchemas(connection);
      const schemaItems: Array<vscode.QuickPickItem & { picked?: boolean }> = [
          {
            kind: vscode.QuickPickItemKind.Separator,
            label: connection.database
          },
          ...schemas.map((schema) => ({
            label: schema,
            description: connection.database,
            picked: connection.visibleSchemas.includes(schema)
          }))
        ];

      const picks = await vscode.window.showQuickPick(
        schemaItems,
        {
          canPickMany: true,
          title: `Visible schemas for ${connection.name}`,
          placeHolder: 'Choose schemas under the database shown above.'
        }
      );

      if (!picks) {
        return;
      }

      await this.connectionStore.saveConnection({
        ...connection,
        visibleSchemas: picks
          .filter((pick) => !isQuickPickSeparator(pick))
          .map((pick) => pick.label)
      });
      await this.notify('info', `Updated visible schemas for ${connection.name}.`);
    });
  }

  public dispose(): void {
    this.panel?.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private async handleMessage(message: WorkbenchMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
          await this.postState();
          break;
        case 'selectConnection':
          this.isCreatingNewConnection = !message.connectionId;
          this.selectedConnectionId = message.connectionId;
          if (message.connectionId) {
            this.clearDiscovery();
          }
          await this.connectionStore.setLastSelectedConnectionId(message.connectionId);
          await this.postState();
          break;
        case 'newConnection':
          this.isCreatingNewConnection = true;
          this.selectedConnectionId = undefined;
          this.clearDiscovery();
          await this.connectionStore.setLastSelectedConnectionId(undefined);
          await this.postState();
          break;
        case 'saveConnection': {
          const draft = this.normalizeDraft(message.draft);
          if (!draft.database.trim()) {
            await this.discoverDatabasesForDraft(draft);
            await this.notify('info', 'Choose a discovered database before saving the connection.');
            await this.postState();
            break;
          }

          const saved = await this.connectionStore.saveConnection(draft);
          this.isCreatingNewConnection = false;
          this.selectedConnectionId = saved.id;
          this.ensureQuery(saved);
          await this.postState();
          await this.notify('info', `Saved ${saved.name}.`);
          break;
        }
        case 'deleteConnection':
          await this.connectionStore.removeConnection(message.connectionId);
          this.queryByConnectionId.delete(message.connectionId);
          this.resultByConnectionId.delete(message.connectionId);
          this.clearDiscovery();
          await this.handleConnectionsChanged();
          await this.notify('info', 'Connection removed.');
          break;
        case 'testConnection': {
          const draft = this.normalizeDraft(message.draft);
          if (!draft.database.trim()) {
            await this.discoverDatabasesForDraft(draft);
            await this.postState();
            break;
          }

          const connection = this.materializeDraft(draft);
          await this.databaseService.testConnection(connection, draft.password);
          await this.notify('info', `Connection test for ${connection.name} succeeded.`);
          break;
        }
        case 'discoverDatabases': {
          const draft = this.normalizeDraft(message.draft);
          await this.discoverDatabasesForDraft(draft);
          await this.postState();
          break;
        }
        case 'runQuery': {
          const connection = this.requireConnection(message.connectionId);
          const sql = message.sql.trim();
          if (!sql) {
            throw new Error('Enter a SQL query before running it.');
          }

          this.selectedConnectionId = connection.id;
          this.queryByConnectionId.set(connection.id, message.sql);
          const result = await this.databaseService.executeQuery(connection, sql);
          this.resultByConnectionId.set(connection.id, result);
          await this.postState();
          break;
        }
        case 'chooseSchemas':
          await this.promptSchemaSelection(message.connectionId);
          await this.postState();
          break;
      }
    } catch (error) {
      const normalized = this.errorReporter.error(error, {
        operation: 'workbench.handleMessage',
        details: {
          messageType: message.type,
          connectionId: 'connectionId' in message ? message.connectionId : undefined
        }
      });
      const errorMessage = normalized.message;
      await this.notify('error', errorMessage);
    }
  }

  private applyTarget(target?: WorkbenchTarget): void {
    if (!target) {
      if (this.isCreatingNewConnection) {
        this.selectedConnectionId = undefined;
        return;
      }

      this.selectedConnectionId = this.selectedConnectionId ?? this.connectionStore.getLastSelectedConnectionId() ?? this.connectionStore.getConnections()[0]?.id;
      return;
    }

    if (typeof target === 'string') {
      this.isCreatingNewConnection = false;
      this.selectedConnectionId = target;
      return;
    }

    if ('kind' in target) {
      this.isCreatingNewConnection = false;
      this.selectedConnectionId = target.connection.id;
      if (target.kind === 'table') {
        this.queryByConnectionId.set(
          target.connection.id,
          this.treeProvider.buildPreviewQuery(target.connection, target.schema, target.table)
        );
      }
      return;
    }

    this.isCreatingNewConnection = false;
    this.selectedConnectionId = target.id;
  }

  private async discoverDatabasesForDraft(draft: ConnectionDraft): Promise<void> {
    const connection = this.materializeDraft(draft);
    this.discoveredDatabases = await this.databaseService.discoverDatabases(connection, draft.password);

    if (!this.discoveredDatabases.length) {
      await this.notify('info', 'No accessible databases were discovered with the supplied credentials.');
      return;
    }

    await this.notify('info', `Discovered ${this.discoveredDatabases.length} accessible database(s).`);
  }

  private materializeDraft(draft: ConnectionDraft): SavedConnection {
    return {
      id: draft.id ?? 'draft-connection',
      name: draft.name.trim(),
      engine: draft.engine,
      host: draft.host.trim(),
      port: draft.port,
      database: draft.database.trim(),
      username: draft.username.trim(),
      sslMode: draft.sslMode,
      authMode: draft.authMode,
      visibleSchemas: draft.visibleSchemas,
      awsSecret: draft.authMode === 'awsSecret' ? {
        secretId: draft.awsSecret!.secretId.trim(),
        profile: draft.awsSecret!.profile.trim(),
        passwordKey: draft.awsSecret!.passwordKey.trim(),
        region: draft.awsSecret?.region?.trim() || undefined
      } : undefined,
      updatedAt: new Date().toISOString()
    };
  }

  private normalizeDraft(draft: ConnectionDraft): ConnectionDraft {
    return {
      ...draft,
      name: draft.name ?? '',
      host: draft.host ?? '',
      port: Number(draft.port),
      database: draft.database ?? '',
      username: draft.username ?? '',
      sslMode: draft.sslMode ?? 'disable',
      visibleSchemas: Array.isArray(draft.visibleSchemas) ? draft.visibleSchemas : [],
      awsSecret: draft.authMode === 'awsSecret' ? {
        secretId: draft.awsSecret?.secretId ?? '',
        profile: draft.awsSecret?.profile ?? '',
        passwordKey: draft.awsSecret?.passwordKey ?? '',
        region: draft.awsSecret?.region ?? ''
      } : undefined,
      password: draft.password ?? ''
    };
  }

  private clearDiscovery(): void {
    this.discoveredDatabases = [];
  }

  private requireConnection(connectionId: string): SavedConnection {
    const connection = this.connectionStore.getConnection(connectionId);
    if (!connection) {
      throw new Error('The selected connection no longer exists.');
    }

    return connection;
  }

  private ensureQuery(connection: SavedConnection): void {
    if (this.queryByConnectionId.has(connection.id)) {
      return;
    }

    const defaultQuery = connection.engine === 'mysql'
      ? 'SELECT NOW() AS current_timestamp;'
      : connection.engine === 'sqlserver'
        ? 'SELECT SYSDATETIME() AS current_timestamp;'
      : 'SELECT CURRENT_TIMESTAMP;';

    this.queryByConnectionId.set(connection.id, defaultQuery);
  }

  private async postState(): Promise<void> {
    if (!this.panel) {
      return;
    }

    const connections = this.connectionStore.getConnections();
    const selectedId = resolveSelectedConnectionId({
      connections,
      selectedConnectionId: this.selectedConnectionId,
      lastSelectedConnectionId: this.connectionStore.getLastSelectedConnectionId(),
      isCreatingNewConnection: this.isCreatingNewConnection
    });

    if (selectedId) {
      const connection = connections.find((item) => item.id === selectedId);
      if (connection) {
        this.ensureQuery(connection);
      }
    }

    this.selectedConnectionId = selectedId;

    const webviewConnections = await Promise.all(
      connections.map((connection) => this.connectionStore.toWebviewConnection(connection))
    );

    const state: WorkbenchState = {
      connections: webviewConnections,
      selectedConnectionId: selectedId,
      currentQuery: selectedId ? this.queryByConnectionId.get(selectedId) ?? '' : '',
      lastResult: selectedId ? this.resultByConnectionId.get(selectedId) : undefined,
      discoveredDatabases: this.discoveredDatabases
    };

    const delivered = await this.panel.webview.postMessage({
      type: 'state',
      state
    } satisfies ExtensionToWebviewMessage);

    if (!delivered) {
      this.errorReporter.warn('Webview state message was not delivered.', {
        selectedConnectionId: selectedId
      });
    }
  }

  private async notify(level: 'info' | 'error', message: string): Promise<void> {
    if (this.panel) {
      const delivered = await this.panel.webview.postMessage({
        type: 'notification',
        level,
        message
      } satisfies ExtensionToWebviewMessage);

      if (!delivered) {
        this.errorReporter.warn('Webview notification was not delivered.', {
          level,
          message
        });
      }
    }

    if (level === 'error') {
      void vscode.window.showErrorMessage(message);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'workbench.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'workbench.css'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>SQL Workbench</title>
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let index = 0; index < 32; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return value;
}

function isQuickPickSeparator(item: vscode.QuickPickItem): boolean {
  return item.kind === vscode.QuickPickItemKind.Separator;
}
