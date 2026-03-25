import { SidebarApp } from "./features/sidebar/SidebarApp";
import { TableViewApp } from "./features/table/TableViewApp";
import { WorkbenchApp } from "./features/workbench/WorkbenchApp";
import { getWebviewKind } from "./lib/vscode";

export default function App() {
  const view = getWebviewKind();

  switch (view) {
    case "sidebar":
      return <SidebarApp />;
    case "table":
      return <TableViewApp />;
    default:
      return <WorkbenchApp />;
  }
}
