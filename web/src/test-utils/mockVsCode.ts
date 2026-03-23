import { IncomingMessage } from '../lib/protocol';
import { VsCodeApi } from '../lib/vscode';
import { act } from '@testing-library/react';

export interface MockVsCodeApi<State> extends VsCodeApi<State> {
  postMessage: jest.Mock<void, [unknown]>;
  getState: jest.Mock<State | undefined, []>;
  setState: jest.Mock<void, [State]>;
}

export function installMockVsCodeApi<State>(initialState?: State): MockVsCodeApi<State> {
  const api: MockVsCodeApi<State> = {
    postMessage: jest.fn<void, [unknown]>(),
    getState: jest.fn<State | undefined, []>(() => initialState),
    setState: jest.fn<void, [State]>()
  };

  window.acquireVsCodeApi = <ApiState = unknown>() => api as unknown as VsCodeApi<ApiState>;
  return api;
}

export function dispatchIncomingMessage(message: IncomingMessage): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: message }));
  });
}
