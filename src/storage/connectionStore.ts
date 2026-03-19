import * as vscode from 'vscode';
import { ConnectionDraft, SavedConnection, WebviewConnection } from '../model/connection';

const CONNECTIONS_KEY = 'sqlConnectionWorkbench.connections';
const LAST_SELECTED_CONNECTION_KEY = 'sqlConnectionWorkbench.lastSelectedConnection';

export class ConnectionStore {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();

  public readonly onDidChange = this.onDidChangeEmitter.event;

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public getConnections(): SavedConnection[] {
    const stored = this.context.globalState.get<SavedConnection[]>(CONNECTIONS_KEY, []);
    return [...stored].sort((left, right) => left.name.localeCompare(right.name));
  }

  public async saveConnection(draft: ConnectionDraft): Promise<SavedConnection> {
    this.validateDraft(draft);

    const connections = this.getConnections();
    const connectionId = draft.id ?? this.createConnectionId();
    const existing = connections.find((item) => item.id === connectionId);

    const saved: SavedConnection = {
      id: connectionId,
      name: draft.name.trim(),
      engine: draft.engine,
      host: draft.host.trim(),
      port: draft.port,
      database: draft.database.trim(),
      username: draft.username.trim(),
      sslMode: draft.sslMode,
      authMode: draft.authMode,
      visibleSchemas: [...new Set(draft.visibleSchemas.map((schema) => schema.trim()).filter(Boolean))],
      awsSecret: draft.authMode === 'awsSecret' ? {
        secretId: draft.awsSecret!.secretId.trim(),
        profile: draft.awsSecret!.profile.trim(),
        passwordKey: draft.awsSecret!.passwordKey.trim(),
        region: draft.awsSecret?.region?.trim() || undefined
      } : undefined,
      updatedAt: new Date().toISOString()
    };

    if (saved.authMode === 'storedPassword') {
      const nextPassword = draft.password?.trim();
      const hasExistingPassword = await this.hasPassword(connectionId);

      if (!nextPassword && !hasExistingPassword) {
        throw new Error('A password is required for a password-managed connection.');
      }

      if (nextPassword) {
        await this.context.secrets.store(this.getPasswordKey(connectionId), nextPassword);
      }
    } else {
      await this.context.secrets.delete(this.getPasswordKey(connectionId));
    }

    const remaining = connections.filter((item) => item.id !== connectionId);
    remaining.push(saved);

    await this.context.globalState.update(CONNECTIONS_KEY, remaining);
    await this.setLastSelectedConnectionId(connectionId);
    this.onDidChangeEmitter.fire();
    return saved;
  }

  public async removeConnection(connectionId: string): Promise<void> {
    const remaining = this.getConnections().filter((item) => item.id !== connectionId);
    await this.context.globalState.update(CONNECTIONS_KEY, remaining);
    await this.context.secrets.delete(this.getPasswordKey(connectionId));

    if (this.getLastSelectedConnectionId() === connectionId) {
      await this.setLastSelectedConnectionId(remaining[0]?.id);
    }

    this.onDidChangeEmitter.fire();
  }

  public async getPassword(connectionId: string): Promise<string | undefined> {
    return this.context.secrets.get(this.getPasswordKey(connectionId));
  }

  public async hasPassword(connectionId: string): Promise<boolean> {
    return Boolean(await this.getPassword(connectionId));
  }

  public getConnection(connectionId: string): SavedConnection | undefined {
    return this.getConnections().find((item) => item.id === connectionId);
  }

  public getLastSelectedConnectionId(): string | undefined {
    return this.context.globalState.get<string>(LAST_SELECTED_CONNECTION_KEY);
  }

  public async setLastSelectedConnectionId(connectionId?: string): Promise<void> {
    await this.context.globalState.update(LAST_SELECTED_CONNECTION_KEY, connectionId);
  }

  public async toWebviewConnection(connection: SavedConnection): Promise<WebviewConnection> {
    return {
      ...connection,
      hasStoredPassword: connection.authMode === 'storedPassword' && await this.hasPassword(connection.id)
    };
  }

  private validateDraft(draft: ConnectionDraft): void {
    if (!draft.name?.trim()) {
      throw new Error('Connection name is required.');
    }

    if (!draft.host?.trim()) {
      throw new Error('Host is required.');
    }

    if (!draft.database?.trim()) {
      throw new Error('Database is required.');
    }

    if (!draft.username?.trim()) {
      throw new Error('Username is required.');
    }

    if (!Number.isFinite(draft.port) || draft.port <= 0) {
      throw new Error('Port must be a positive number.');
    }

    if (draft.authMode === 'awsSecret') {
      if (!draft.awsSecret?.secretId?.trim()) {
        throw new Error('AWS secret id or ARN is required.');
      }

      if (!draft.awsSecret.profile?.trim()) {
        throw new Error('AWS profile is required.');
      }

      if (!draft.awsSecret.passwordKey?.trim()) {
        throw new Error('Password key is required.');
      }
    }
  }

  private getPasswordKey(connectionId: string): string {
    return `sqlConnectionWorkbench.password.${connectionId}`;
  }

  private createConnectionId(): string {
    return `connection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
