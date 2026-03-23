import * as vscode from 'vscode';

export function getPanelIconPath(extensionUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(extensionUri, 'media', 'activity-icon.svg');
}
