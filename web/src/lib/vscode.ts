import { WebviewKind } from "./protocol";

export interface VsCodeApi<State> {
  postMessage(message: unknown): void;
  getState(): State | undefined;
  setState(state: State): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: <State = unknown>() => VsCodeApi<State>;
  }
}

let fallbackState: unknown;

const fallbackApi: VsCodeApi<unknown> = {
  postMessage: () => undefined,
  getState: () => fallbackState,
  setState: (state) => {
    fallbackState = state;
  },
};

export function getVsCodeApi<State>(): VsCodeApi<State> {
  if (typeof window === "undefined" || !window.acquireVsCodeApi) {
    return fallbackApi as VsCodeApi<State>;
  }

  return window.acquireVsCodeApi<State>();
}

export function getWebviewKind(): WebviewKind {
  if (typeof document === "undefined") {
    return "workbench";
  }

  const view = document.body.dataset.view;
  return view === "sidebar" || view === "table" ? view : "workbench";
}
