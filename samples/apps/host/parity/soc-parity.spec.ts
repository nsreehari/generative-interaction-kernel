import { expect, test, type Page } from "@playwright/test";

const standaloneUrl = "/?b=live-workspace-soc";
const demoUrl = "/?b=live-workspace-soc&demo=&gik=1";
const investigationBoardUrl = "/?b=live-workspace-soc&gik=1&presentation=investigation-board";

async function stabilize(page: Page): Promise<void> {
  await page.getByRole("heading", { name: "Privileged access anomaly during payroll cutover" }).waitFor();
  await page.addStyleTag({ content: ".gx-timer-count,.gx-timer-separator{visibility:hidden!important}" });
  await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loaded");
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function assertPinnedToEnd(page: Page, label: string): Promise<void> {
  const container = page.getByRole("region", { name: label });
  await expect(container).toBeVisible();
  expect(await container.evaluate((element) =>
    element.scrollHeight - element.scrollTop - element.clientHeight <= 2
  )).toBe(true);
}

async function advance(page: Page, expectedAct: number): Promise<void> {
  await page.getByRole("button", { name: /Next act/ }).click();
  await expect(page.getByText(`Act ${expectedAct} of 5`, { exact: true })).toBeVisible();
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

test("investigation board preserves desktop columns and mobile stage flow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(investigationBoardUrl);
  await stabilize(page);
  await expect(page.getByRole("combobox", { name: "Select presentation context" })).toHaveCount(0);
  await expect(page.locator('[data-soc-arrangement="kanban"]')).toBeVisible();
  await expect(page.getByLabel("Investigation board").getByRole("region")).toHaveCount(5);
  await assertNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("soc-investigation-board-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await stabilize(page);
  await expect(page.getByRole("combobox", { name: "Select presentation context" })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("soc-investigation-board-mobile.png");
});

test("demo runner expands, collapses, and brokers semantic timeline focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(demoUrl);
  await stabilize(page);

  const runner = page.getByLabel("Scenario runner");
  const runnerToggle = runner.getByRole("button").first();
  await expect(runnerToggle).toHaveAttribute("aria-expanded", "false");
  await runnerToggle.click();
  await expect(runnerToggle).toHaveAttribute("aria-expanded", "true");
  const scenarioSelect = page.getByRole("combobox", { name: "Select demo Blueprint" });
  await expect(scenarioSelect).toHaveValue("soc-t3");
  const initialUrl = page.url();
  await scenarioSelect.selectOption("soc-executive");
  await expect(scenarioSelect).toHaveValue("soc-executive");
  await expect(page.getByText("Act 1 of 5", { exact: true })).toBeVisible();
  expect(page.url()).toBe(initialUrl);
  await expect(runner.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Expand control harness" }).click();
  await page.getByRole("tab", { name: "Blueprint" }).click();
  await expect(page.getByRole("heading", { name: "Intent to runnable bundle" })).toBeVisible();
  const journalTab = page.getByRole("tab", { name: "Journal / Ledger" });
  await journalTab.click();
  await expect(journalTab).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveScreenshot("soc-demo-expanded-desktop.png");

  await advance(page, 2);
  await page.getByRole("button", { name: "Reset scenario" }).click();
  await expect(page.getByText("Act 1 of 5", { exact: true })).toBeVisible();
  await advance(page, 2);
  await expect(page.getByRole("combobox", { name: "Select presentation context" })).toHaveText("Full substrate");
  await expect(page.getByText("Established investigation intent", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Frame the protected business objective/ })).toBeVisible();
  await expect(page.getByText(/organism/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Ledger" }).click();
  const scenarioEntry = page.getByRole("button", { name: /Frame the protected business objective/ });
  const organismEntry = page.getByRole("region", { name: "Journal timeline" }).getByRole("button").filter({ hasText: "Established investigation intent" });
  await expect(page.getByText(/Scenario instruction · complete/i)).toBeVisible();
  await expect(page.getByText(/SOC outcome · committed · Morgan/i)).toBeVisible();
  await organismEntry.click();
  await expect(organismEntry).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-soc-region="intent"]')).toHaveCSS("outline-style", "solid");
  await page.getByRole("button", { name: "Journal" }).click();
  await expect(scenarioEntry).toBeVisible();
  await page.getByRole("tab", { name: "Participants" }).click();
  await expect(page.locator('article[data-participant-id="human-morgan"]')).toHaveCSS("outline-style", "solid");
  await expect(page.getByRole("switch")).toHaveCount(0);

  await runnerToggle.click();
  await expect(runnerToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveScreenshot("soc-demo-collapsed-desktop.png");
});

test("executive demo reaches the governed human gate on a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(demoUrl);
  await stabilize(page);
  await assertNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Expand scenario runner" }).click();
  await page.getByRole("combobox", { name: "Select demo Blueprint" }).selectOption("soc-executive");
  await page.getByRole("button", { name: "Expand control harness" }).click();

  for (let act = 2; act <= 4; act += 1) await advance(page, act);
  await expect(page.getByText("Commander reviews the consequential decision", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Authorize Host-A isolation" })).toBeVisible();
  await assertPinnedToEnd(page, "Journal timeline");
  await assertNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("soc-demo-human-gate-mobile.png");
});
