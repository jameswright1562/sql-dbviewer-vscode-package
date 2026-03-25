export interface SelectionCandidate {
  id: string;
}

export interface ResolveSelectedConnectionIdInput {
  connections: SelectionCandidate[];
  selectedConnectionId?: string;
  lastSelectedConnectionId?: string;
  isCreatingNewConnection?: boolean;
}

export function resolveSelectedConnectionId(
  input: ResolveSelectedConnectionIdInput,
): string | undefined {
  if (input.isCreatingNewConnection) {
    return undefined;
  }

  if (
    input.selectedConnectionId &&
    input.connections.some(
      (connection) => connection.id === input.selectedConnectionId,
    )
  ) {
    return input.selectedConnectionId;
  }

  if (
    input.lastSelectedConnectionId &&
    input.connections.some(
      (connection) => connection.id === input.lastSelectedConnectionId,
    )
  ) {
    return input.lastSelectedConnectionId;
  }

  return input.connections[0]?.id;
}
