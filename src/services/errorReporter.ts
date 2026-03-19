import * as vscode from 'vscode';

export interface ErrorContext {
  operation: string;
  details?: Record<string, unknown>;
}

export class ErrorReporter implements vscode.Disposable {
  private readonly outputChannel = vscode.window.createOutputChannel('SQL Connection Workbench');

  public constructor(private readonly isDebugging: boolean) {}

  public info(message: string, details?: Record<string, unknown>): void {
    this.append('INFO', message, details);
  }

  public warn(message: string, details?: Record<string, unknown>): void {
    this.append('WARN', message, details);
  }

  public error(error: unknown, context: ErrorContext): Error {
    const normalized = normalizeError(error);
    const payload = {
      operation: context.operation,
      ...context.details,
      name: normalized.name,
      message: normalized.message,
      stack: normalized.stack
    };

    this.append('ERROR', `Unhandled exception in ${context.operation}`, payload);
    console.error(`[SQL Connection Workbench] ${context.operation}`, payload);

    if (this.isDebugging) {
      this.outputChannel.show(true);
    }

    return normalized;
  }

  public async capture<T>(context: ErrorContext, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      throw this.error(error, context);
    }
  }

  public dispose(): void {
    this.outputChannel.dispose();
  }

  private append(level: 'INFO' | 'WARN' | 'ERROR', message: string, details?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}`);

    if (details && Object.keys(details).length > 0) {
      this.outputChannel.appendLine(this.stringify(details));
    }
  }

  private stringify(details: Record<string, unknown>): string {
    try {
      return JSON.stringify(details, null, 2);
    } catch {
      return String(details);
    }
  }
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  return new Error('Unexpected error');
}
