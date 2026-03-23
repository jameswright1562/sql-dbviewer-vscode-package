import * as vscode from 'vscode';
import { ConnectionStore } from '../storage/connectionStore';
import { ErrorReporter } from '../services/errorReporter';
import { ExtensionToWebviewMessage, SidebarMessage, SidebarState } from '../types';
import { getReactWebviewHtml } from './webview/reactWebviewHtml';

export class WorkbenchSidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'sqlConnectionWorkbench.workspaceSidebar';

  private view?: vscode.WebviewView;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly connectionStore: ConnectionStore,
    private readonly errorReporter: ErrorReporter
  ) {
    this.connectionStore.onDidChange(() => {
      void this.updateView();
    });
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'web', 'dist')]
    };
    webviewView.webview.html = getReactWebviewHtml(this.context.extensionUri, webviewView.webview, 'sidebar');

    webviewView.webview.onDidReceiveMessage((message: SidebarMessage) => {
      void this.handleMessage(message);
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });

    void this.updateView();
  }

  private async handleMessage(message: SidebarMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
          await this.updateView();
          break;
        case 'addConnection':
          await vscode.commands.executeCommand('sqlConnectionWorkbench.addConnection');
          break;
        case 'refresh':
          await vscode.commands.executeCommand('sqlConnectionWorkbench.refreshConnections');
          break;
        case 'openWorkbench':
          await vscode.commands.executeCommand('sqlConnectionWorkbench.openWorkbench', message.connectionId);
          break;
      }
    } catch (error) {
      this.errorReporter.error(error, {
        operation: 'workbenchSidebar.handleMessage',
        details: {
          messageType: message.type
        }
      });
    }
  }

  private async updateView(): Promise<void> {
    if (!this.view) {
      return;
    }

    const connections = this.connectionStore.getConnections();
    const state: SidebarState = {
      connections: await Promise.all(
        connections.map((connection) => this.connectionStore.toWebviewConnection(connection))
      ),
      selectedConnectionId: this.connectionStore.getLastSelectedConnectionId()
    };

    await this.view.webview.postMessage({
      type: 'sidebarState',
      state
    } satisfies ExtensionToWebviewMessage);
  }
}
