import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import {
  dispatchIncomingMessage,
  installMockVsCodeApi,
} from "./test-utils/mockVsCode";

describe("workbench view", () => {
  beforeEach(() => {
    document.body.dataset.view = "workbench";
  });

  test("renders the workbench and sends a ready message", () => {
    const api = installMockVsCodeApi();
    render(<App />);

    expect(screen.getByText("Connections")).toBeInTheDocument();
    expect(api.postMessage).toHaveBeenCalledWith({ type: "ready" });
  });

  test("sends a saveConnection message when saving a draft", async () => {
    const api = installMockVsCodeApi();
    render(<App />);

    await userEvent.type(screen.getByLabelText("Display name"), "Reporting");
    await userEvent.type(screen.getByLabelText("Host"), "db.internal");
    await userEvent.type(screen.getByLabelText("Database"), "analytics");
    await userEvent.type(screen.getByLabelText("Username"), "readonly_user");
    await userEvent.type(
      screen.getByPlaceholderText("Enter password"),
      "secret-password",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(api.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "saveConnection",
        draft: expect.objectContaining({
          name: "Reporting",
          host: "db.internal",
          database: "analytics",
          username: "readonly_user",
        }),
      }),
    );
  });
});

describe("sidebar view", () => {
  beforeEach(() => {
    document.body.dataset.view = "sidebar";
  });

  test("renders saved connections after receiving sidebar state", async () => {
    installMockVsCodeApi();
    render(<App />);

    dispatchIncomingMessage({
      type: "sidebarState",
      state: {
        selectedConnectionId: "connection-1",
        connections: [
          {
            id: "connection-1",
            name: "Warehouse",
            engine: "postgres",
            host: "warehouse.internal",
            port: 5432,
            database: "analytics",
            username: "reader",
            sslMode: "require",
            authMode: "storedPassword",
            visibleSchemas: ["public"],
            updatedAt: "2026-03-23T00:00:00.000Z",
            hasStoredPassword: true,
          },
        ],
      },
    });

    expect(await screen.findByText("Warehouse")).toBeInTheDocument();
    expect(screen.getByText("analytics")).toBeInTheDocument();
  });
});

describe("table preview view", () => {
  beforeEach(() => {
    document.body.dataset.view = "table";
  });

  test("renders preview SQL and rows after receiving table state", async () => {
    const api = installMockVsCodeApi();
    render(<App />);

    dispatchIncomingMessage({
      type: "tableState",
      state: {
        connectionId: "connection-1",
        connectionName: "Warehouse",
        engine: "postgres",
        database: "analytics",
        schema: "public",
        table: "orders",
        previewSql: 'SELECT * FROM "public"."orders" LIMIT 100;',
        currentSql: 'SELECT * FROM "public"."orders" LIMIT 100;',
        columns: [{ name: "order_id", dataType: "integer", isNullable: false }],
        filters: [],
        result: {
          columns: [{ name: "order_id" }],
          rows: [{ order_id: 42 }],
          rowCount: 1,
          durationMs: 12,
          message: "Query completed against analytics.",
        },
      },
    });

    expect(await screen.findByText("public.orders")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('SELECT * FROM "public"."orders" LIMIT 100;'),
    ).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Table SQL"));
    await userEvent.type(
      screen.getByLabelText("Table SQL"),
      "select order_id from public.orders limit 10;",
    );
    await userEvent.click(screen.getByRole("button", { name: "Run Query" }));

    expect(api.postMessage).toHaveBeenLastCalledWith({
      type: "runQuery",
      sql: "select order_id from public.orders limit 10;",
    });
  });
});
