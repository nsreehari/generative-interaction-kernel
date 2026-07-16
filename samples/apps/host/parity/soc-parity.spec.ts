import { expect, test, type Page } from "@playwright/test";

const standaloneUrl = "/?bundle=live-workspace-soc&context=war-room&plane=runtime";
const demoUrl = "/?bundle=live-workspace-soc&demo=soc-executive&context=war-room&plane=runtime";

async function stabilize(page: Page): Promise<void> {
  await page.getByRole("heading", { name: "Privileged access anomaly during payroll cutover" }).waitFor();
  await page.addStyleTag({ content: ".gx-timer-count,.gx-timer-separator{visibility:hidden!important}" });
  await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loaded");
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function advance(page: Page, expectedAct: number): Promise<void> {
  await page.getByRole("button", { name: /Next act/ }).click();
  await expect(page.getByText(`Act ${expectedAct} of 14`, { exact: true })).toBeVisible();
}

test("standalone SOC preserves desktop and mobile workspace parity", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(standaloneUrl);
  await stabilize(page);
  await expect(page.getByLabel("Scenario runner")).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("soc-standalone-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await stabilize(page);
  await assertNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("soc-standalone-mobile.png");
});

test("demo runner expands, collapses, and brokers semantic timeline focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(demoUrl);
  await stabilize(page);

  const runner = page.getByLabel("Scenario runner");
  const runnerToggle = runner.getByRole("button").first();
  await expect(runnerToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page).toHaveScreenshot("soc-demo-expanded-desktop.png");

  await advance(page, 2);
  await page.getByLabel("View shared substrate as").selectOption("full-substrate");
  const scenarioEntry = page.getByRole("button", { name: /Set the investigation objective/ });
  await scenarioEntry.click();
  await expect(scenarioEntry).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-soc-object-id="intent"]')).toHaveCSS("outline-style", "solid");
  await page.getByRole("button", { name: "Participants" }).click();
  await expect(page.locator('[data-soc-actor-id="human-morgan"]')).toHaveCSS("outline-style", "solid");

  await runnerToggle.click();
  await expect(runnerToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveScreenshot("soc-demo-collapsed-desktop.png");
});

test("executive demo reaches the governed human gate on a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(demoUrl);
  await stabilize(page);
  await assertNoHorizontalOverflow(page);

  for (let act = 2; act <= 13; act += 1) await advance(page, act);
  await expect(page.getByText("Require commander authorization", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Authorize Host-A isolation" })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("soc-demo-human-gate-mobile.png");
});
