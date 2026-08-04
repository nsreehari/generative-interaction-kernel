import React from "react";
import {
  FluentProvider,
  makeStyles,
  tokens,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";
import type { Preview } from "@storybook/react-vite";

const nativeFocus = typeof HTMLElement === "undefined" ? undefined : HTMLElement.prototype.focus;

const useStyles = makeStyles({
  canvas: {
    minHeight: "100vh",
    padding: tokens.spacingHorizontalXXL,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
  },
});

function FluentCanvas({ dark, children }: { dark: boolean; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <FluentProvider theme={dark ? webDarkTheme : webLightTheme}>
      <main className={styles.canvas}>{children}</main>
    </FluentProvider>
  );
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Fluent 2 theme",
      defaultValue: "light",
      toolbar: {
        icon: "paintbrush",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      if (nativeFocus) {
        Object.defineProperty(HTMLElement.prototype, "focus", {
          configurable: true,
          writable: true,
          value: nativeFocus,
        });
      }

      return (
        <FluentCanvas dark={context.globals.theme === "dark"}>
          <Story />
        </FluentCanvas>
      );
    },
  ],
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
    a11y: { test: "error" },
    options: {
      storySort: {
        order: ["Semantic Components", "Primitive Components", "*"],
      },
    },
  },
};

export default preview;