import test from "node:test";
import assert from "node:assert/strict";
import { resolveSelectedConnectionId } from "../ui/workbenchSelection";

test("resolveSelectedConnectionId returns undefined while creating a new connection", () => {
  const selectedId = resolveSelectedConnectionId({
    connections: [{ id: "one" }, { id: "two" }],
    selectedConnectionId: "one",
    lastSelectedConnectionId: "two",
    isCreatingNewConnection: true,
  });

  assert.equal(selectedId, undefined);
});

test("resolveSelectedConnectionId prefers the current selected connection when it still exists", () => {
  const selectedId = resolveSelectedConnectionId({
    connections: [{ id: "one" }, { id: "two" }],
    selectedConnectionId: "two",
    lastSelectedConnectionId: "one",
    isCreatingNewConnection: false,
  });

  assert.equal(selectedId, "two");
});

test("resolveSelectedConnectionId falls back to last selected connection and then first connection", () => {
  const fromLastSelected = resolveSelectedConnectionId({
    connections: [{ id: "one" }, { id: "two" }],
    selectedConnectionId: "missing",
    lastSelectedConnectionId: "two",
    isCreatingNewConnection: false,
  });

  const fromFirstConnection = resolveSelectedConnectionId({
    connections: [{ id: "one" }, { id: "two" }],
    selectedConnectionId: "missing",
    lastSelectedConnectionId: "also-missing",
    isCreatingNewConnection: false,
  });

  assert.equal(fromLastSelected, "two");
  assert.equal(fromFirstConnection, "one");
});
