import * as path from 'path';
import * as vscode from 'vscode';

export type ReactWebviewView = 'workbench' | 'sidebar' | 'table';

export function getReactWebviewHtml(
  extensionUri: vscode.Uri,
  webview: vscode.Webview,
  view: ReactWebviewView
): string {
  const distRoot = vscode.Uri.joinPath(extensionUri, 'web', 'dist');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'index.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distRoot, 'index.css'));
  const distPath = path.join(extensionUri.fsPath, 'web', 'dist');

  if (!path.isAbsolute(distPath)) {
    throw new Error('Unable to resolve webview bundle path.');
  }

  return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta
          http-equiv="Content-Security-Policy"
          content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-eval' 'unsafe-inline';"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="${styleUri}" />
      </head>
      <body data-view="${view}">
        <div id="root"></div>
        <script src="${scriptUri}"></script>
      </body>
    </html>`;
}
