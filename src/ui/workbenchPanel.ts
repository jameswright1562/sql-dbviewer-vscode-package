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
import { getPanelIconPath } from './webview/panelIcon';
import { getReactWebviewHtml } from './webview/reactWebviewHtml';
import { getDefaultWorkbenchQuery, materializeDraft, normalizeDraft } from './workbenchDraft';

type WorkbenchTarget = ExplorerConnectionNode | ExplorerTableNode | SavedConnection | string | undefined;

export class WorkbenchPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private selectedConnectionId?: string;
  private isCreatingNewConnection = false;
  private discoveredDatabases: DiscoveredDatabase[] = [];
  private draftQuery = 'SELECT CURRENT_TIMESTAMP;';
  private draftResult?: QueryExecutionResult;
  private readonly queryByConnectionId = new Map<string, string>();
  private readonly resultByConnectionId = new Map<string, QueryExecutionResult>();
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly connectionStore: ConnectionStore,
    private readonly databaseService: DatabaseService,
    private readonly _treeProvider: ConnectionTreeProvider,
    private readonly errorReporter: ErrorReporter
  ) {}

  public async show(target?: WorkbenchTarget): Promise<void> {
    await this.errorReporter.capture({
      operation: 'workbench.show',
      details: {
        targetType: typeof target === 'string' ? 'connectionId' : target ? 'connection' : 'none'
      }
    }, async () => {
      this.applyTarget(target);
      this.ensurePanel().reveal(vscode.ViewColumn.One);
      await this.postState();
    });
  }

  public async showNewConnection(): Promise<void> {
    this.isCreatingNewConnection = true;
    this.selectedConnectionId = undefined;
    this.clearDiscovery();
    this.clearDraftExecution();
    await this.connectionStore.setLastSelectedConnectionId(undefined);
    await this.show();
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
      details: { connectionId }
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

      const picks = await vscode.window.showQuickPick(schemaItems, {
        canPickMany: true,
        title: `Visible schemas for ${connection.name}`,
        placeHolder: 'Choose schemas under the database shown above.'
      });

      if (!picks) {
        return;
      }

      await this.connectionStore.saveConnection({
        ...connection,
        visibleSchemas: picks
          .filter((pick) => pick.kind !== vscode.QuickPickItemKind.Separator)
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

  private ensurePanel(): vscode.WebviewPanel {
    if (this.panel) {
      return this.panel;
    }

    const panel = vscode.window.createWebviewPanel('sqlConnectionWorkbench.panel', 'SQL Workbench', vscode.ViewColumn.One, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'web', 'dist')]
    });

    panel.iconPath = getPanelIconPath(this.context.extensionUri);
    panel.webview.html = getReactWebviewHtml(this.context.extensionUri, panel.webview, 'workbench');
    panel.webview.onDidReceiveMessage((message: WorkbenchMessage) => {
      void this.handleMessage(message);
    }, undefined, this.disposables);
    panel.onDidDispose(() => {
      this.panel = undefined;
    }, undefined, this.disposables);

    this.panel = panel;
    return panel;
  }

  private async handleMessage(message: WorkbenchMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
          await this.postState();
          break;
        case 'selectConnection':
          await this.handleSelectConnection(message.connectionId);
          break;
        case 'newConnection':
          await this.showNewConnection();
          break;
        case 'saveConnection':
          await this.handleSaveConnection(message.draft);
          break;
        case 'deleteConnection':
          await this.handleDeleteConnection(message.connectionId);
          break;
        case 'testConnection':
          await this.handleTestConnection(message.draft);
          break;
        case 'discoverDatabases':
          await this.handleDiscoverDatabases(message.draft);
          break;
        case 'runQuery':
          await this.handleRunSavedQuery(message.connectionId, message.sql);
          break;
        case 'runDraftQuery':
          await this.handleRunDraftQuery(message.draft, message.sql);
          break;
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

      await this.notify('error', normalized.message);
    }
  }

  private async handleSelectConnection(connectionId?: string): Promise<void> {
    this.isCreatingNewConnection = !connectionId;
    this.selectedConnectionId = connectionId;

    if (connectionId) {
      this.clearDiscovery();
      this.clearDraftExecution();
    }

    await this.connectionStore.setLastSelectedConnectionId(connectionId);
    await this.postState();
  }

  private async handleSaveConnection(draft: ConnectionDraft): Promise<void> {
    const normalizedDraft = normalizeDraft(draft);
    if (!normalizedDraft.database.trim()) {
      await this.discoverDatabasesForDraft(normalizedDraft);
      await this.notify('info', 'Choose a discovered database before saving the connection.');
      await this.postState();
      return;
    }

    const saved = await this.connectionStore.saveConnection(normalizedDraft);
    this.isCreatingNewConnection = false;
    this.selectedConnectionId = saved.id;
    this.clearDraftExecution();
    this.ensureQuery(saved);
    await this.postState();
    await this.notify('info', `Saved ${saved.name}.`);
  }

  private async handleDeleteConnection(connectionId: string): Promise<void> {
    await this.connectionStore.removeConnection(connectionId);
    this.queryByConnectionId.delete(connectionId);
    this.resultByConnectionId.delete(connectionId);
    this.clearDiscovery();
    this.clearDraftExecution();
    await this.handleConnectionsChanged();
    await this.notify('info', 'Connection removed.');
  }

  private async handleTestConnection(draft: ConnectionDraft): Promise<void> {
    const normalizedDraft = normalizeDraft(draft);
    if (!normalizedDraft.database.trim()) {
      await this.discoverDatabasesForDraft(normalizedDraft);
      await this.postState();
      return;
    }

    const connection = materializeDraft(normalizedDraft);
    await this.databaseService.testConnection(connection, normalizedDraft.password);
    await this.notify('info', `Connection test for ${connection.name} succeeded.`);
  }

  private async handleDiscoverDatabases(draft: ConnectionDraft): Promise<void> {
    await this.discoverDatabasesForDraft(normalizeDraft(draft));
    await this.postState();
  }

  private async handleRunSavedQuery(connectionId: string, sql: string): Promise<void> {
    const connection = this.requireConnection(connectionId);
    const trimmedSql = sql.trim();
    if (!trimmedSql) {
      throw new Error('Enter a SQL query before running it.');
    }

    this.selectedConnectionId = connection.id;
    this.queryByConnectionId.set(connection.id, sql);
    const result = await this.databaseService.executeQuery(connection, trimmedSql);
    this.resultByConnectionId.set(connection.id, result);
    await this.postState();
  }

  private async handleRunDraftQuery(draft: ConnectionDraft, sql: string): Promise<void> {
    const normalizedDraft = normalizeDraft(draft);
    const trimmedSql = sql.trim();
    if (!trimmedSql) {
      throw new Error('Enter a SQL query before running it.');
    }

    this.draftQuery = sql;
    if (!normalizedDraft.database.trim()) {
      await this.discoverDatabasesForDraft(normalizedDraft);
      await this.postState();
      return;
    }

    const connection = materializeDraft(normalizedDraft);
    this.draftResult = await this.databaseService.executeQuery(connection, trimmedSql, normalizedDraft.password);
    await this.postState();
  }

  private applyTarget(target?: WorkbenchTarget): void {
    if (!target) {
      if (this.isCreatingNewConnection) {
        this.selectedConnectionId = undefined;
        return;
      }

      this.selectedConnectionId = this.selectedConnectionId
        ?? this.connectionStore.getLastSelectedConnectionId()
        ?? this.connectionStore.getConnections()[0]?.id;
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
      return;
    }

    this.isCreatingNewConnection = false;
    this.selectedConnectionId = target.id;
  }

  private async discoverDatabasesForDraft(draft: ConnectionDraft): Promise<void> {
    const connection = materializeDraft(draft);
    this.discoveredDatabases = await this.databaseService.discoverDatabases(connection, draft.password);

    if (!this.discoveredDatabases.length) {
      await this.notify('info', 'No accessible databases were discovered with the supplied credentials.');
      return;
    }

    await this.notify('info', `Discovered ${this.discoveredDatabases.length} accessible database(s).`);
  }

  private clearDiscovery(): void {
    this.discoveredDatabases = [];
  }

  private clearDraftExecution(): void {
    this.draftResult = undefined;
  }

  private requireConnection(connectionId: string): SavedConnection {
    const connection = this.connectionStore.getConnection(connectionId);
    if (!connection) {
      throw new Error('The selected connection no longer exists.');
    }

    return connection;
  }

  private ensureQuery(connection: SavedConnection): void {
    if (!this.queryByConnectionId.has(connection.id)) {
      this.queryByConnectionId.set(connection.id, getDefaultWorkbenchQuery(connection));
    }
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
      currentQuery: selectedId ? this.queryByConnectionId.get(selectedId) ?? '' : this.draftQuery,
      lastResult: selectedId ? this.resultByConnectionId.get(selectedId) : this.draftResult,
      discoveredDatabases: this.discoveredDatabases
    };

    const delivered = await this.panel.webview.postMessage({
      type: 'workbenchState',
      state
    } satisfies ExtensionToWebviewMessage);

    if (!delivered) {
      this.errorReporter.warn('Workbench state message was not delivered.', {
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
        this.errorReporter.warn('Workbench notification was not delivered.', {
          level,
          message
        });
      }
    }

    if (level === 'error') {
      void vscode.window.showErrorMessage(message);
    }
  }
}
