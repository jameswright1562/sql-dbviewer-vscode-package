// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";

import React from "react";

type Props = Record<string, unknown> & { children?: React.ReactNode };

const allowedProps = new Set([
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-controls",
  "aria-expanded",
  "aria-pressed",
  "aria-selected",
  "className",
  "disabled",
  "id",
  "multiple",
  "name",
  "onBlur",
  "onChange",
  "onClick",
  "onFocus",
  "onInput",
  "onKeyDown",
  "onKeyUp",
  "placeholder",
  "readOnly",
  "role",
  "selected",
  "style",
  "tabIndex",
  "title",
  "type",
  "value",
  "checked",
  "defaultValue",
  "defaultChecked",
]);

function filterProps(props: Props): Props {
  return Object.fromEntries(
    Object.entries(props).filter(
      ([key]) =>
        key === "children" ||
        key.startsWith("data-") ||
        key.startsWith("aria-") ||
        key.startsWith("on") ||
        allowedProps.has(key),
    ),
  );
}

function mockToolkitComponent(tag: keyof JSX.IntrinsicElements) {
  return React.forwardRef<HTMLElement, Props>(({ children, ...props }, ref) =>
    React.createElement(tag, { ref, ...filterProps(props) }, children),
  );
}

function mockInputComponent(type: string) {
  return React.forwardRef<HTMLInputElement, Props>(
    ({ children, ...props }, ref) =>
      React.createElement("input", {
        ref,
        type,
        ...filterProps(props),
      }),
  );
}

jest.mock("@vscode/webview-ui-toolkit/react", () => ({
  VSCodeButton: mockToolkitComponent("button"),
  VSCodeCheckbox: mockInputComponent("checkbox"),
  VSCodeDataGrid: mockToolkitComponent("div"),
  VSCodeDataGridCell: mockToolkitComponent("div"),
  VSCodeDataGridRow: mockToolkitComponent("div"),
  VSCodeDropdown: mockToolkitComponent("select"),
  VSCodeOption: mockToolkitComponent("option"),
  VSCodeProgressRing: mockToolkitComponent("div"),
  VSCodeRadio: mockInputComponent("radio"),
  VSCodeRadioGroup: mockToolkitComponent("div"),
  VSCodeTextArea: mockToolkitComponent("textarea"),
  VSCodeTextField: mockInputComponent("text"),
}));
