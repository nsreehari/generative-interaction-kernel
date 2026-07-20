import roleData from "../../../../theme/roles.json";

/**
 * The shared semantic role map (theme/roles.json) — the ONE source both adapters read.
 * On React each role binds to a Fluent v9 token; on WinUI/Reactor the same role binds to a
 * Fluent ThemeResource brush.
 */
export const themeRoles = roleData.roles as Record<
  string,
  { cssVar: string; web: string; winui: string }
>;

/**
 * A minimal view of Fluent's exported `tokens` object: token name -> `var(--token)` CSS
 * reference. Passing Fluent's `tokens` keeps the @fluentui dependency in the app, not the
 * adapter, while this helper stays framework-data-only.
 */
export type FluentTokens = Record<string, string>;

/**
 * Builds the semantic-role CSS custom properties from the shared role map, binding each role's
 * `cssVar` to its Fluent token (`tokens[role.web]`). Apply the result as an inline `style` on the
 * Fluent-scoped root so the primitive stylesheet's `var(--panel)` / `var(--text)` / ... reads a
 * Fluent-driven value — no hand-maintained `.gx-host` color block, and it re-themes automatically
 * when the FluentProvider theme changes (Light <-> Dark), because the values are Fluent var refs.
 */
export function roleVars(tokens: FluentTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const role of Object.values(themeRoles)) {
    const token = tokens[role.web];
    if (token) vars[role.cssVar] = token;
  }
  return vars;
}
