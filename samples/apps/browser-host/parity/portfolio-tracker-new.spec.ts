import { expect, test, type Page } from "@playwright/test";

const mockDesktopUrl = "/?b=portfolio-tracker-new&intelligence-model=mock&view=desktop";
const mockMobileUrl = "/?b=portfolio-tracker-new&intelligence-model=mock&view=mobile";

async function expectInitialPortfolio(page: Page): Promise<void> {
  const prices = page.getByRole("table", { name: "Market prices" });
  await expect(prices.getByRole("row")).toHaveText(["TickerPrice", "AAPL212.93", "MSFT357.81"]);
  await expect(page.getByRole("figure", { name: "Holdings value" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Total portfolio value" })).toContainText("$1499.29");
  const intelligence = page.getByRole("heading", { name: "Mock portfolio intelligence" }).locator("..");
  await expect(intelligence).toContainText(
    "Mock intelligence response for the current portfolio snapshot",
  );
  await expect(intelligence).toContainText("Largest position: MSFT");
  await expect(intelligence).toContainText("mock response; not model-generated");
}

test("desktop holdings save recomputes quotes, value, and intelligence", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(mockDesktopUrl);
  await expectInitialPortfolio(page);

  const holdings = page.getByRole("table", { name: "Editable table" });
  const prices = page.getByRole("table", { name: "Market prices" });
  const holdingsBox = await holdings.boundingBox();
  const pricesBox = await prices.boundingBox();
  expect(holdingsBox).not.toBeNull();
  expect(pricesBox).not.toBeNull();
  expect(pricesBox!.x).toBeGreaterThan(holdingsBox!.x);
  await expect(page.getByRole("table", { name: "Portfolio positions" }).getByRole("row")).toHaveText([
    "TickerQuantityPriceValueCost basisGain/loss",
    "AAPL2$212.93$425.86$180$245.86",
    "MSFT3$357.81$1073.43$540$533.43",
  ]);

  await page.getByRole("spinbutton", { name: "quantity, row 1" }).fill("1");
  await page.getByRole("textbox", { name: "ticker, row 2" }).fill("goog");
  await page.getByRole("spinbutton", { name: "quantity, row 2" }).fill("2");
  await page.getByRole("spinbutton", { name: "costBasis, row 2" }).fill("300");
  await page.getByRole("button", { name: "Save" }).dispatchEvent("click");

  await expect(page.getByRole("progressbar", { name: "Loading" }).first()).toBeVisible();
  await expect(prices.getByRole("row")).toHaveText(["TickerPrice", "AAPL212.93", "GOOG334.57"]);
  await expect(page.getByRole("group", { name: "Total portfolio value" })).toContainText("$882.07");
  await expect(page.getByRole("table", { name: "Portfolio positions" }).getByRole("row")).toHaveText([
    "TickerQuantityPriceValueCost basisGain/loss",
    "AAPL1$212.93$212.93$90$122.93",
    "GOOG2$334.57$669.14$600$69.14",
  ]);
  const intelligence = page.getByRole("heading", { name: "Mock portfolio intelligence" }).locator("..");
  await expect(intelligence).toContainText("Largest position: GOOG");
  await expect(intelligence).toContainText("Market value: 882.07");
  await expect(page.getByText("MSFT", { exact: true })).toHaveCount(0);
});

test("mobile launch preserves Cell results in the authored column arrangement", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(mockMobileUrl);
  await expectInitialPortfolio(page);
  await expect(page.getByRole("table", { name: "Portfolio positions" })).toHaveCount(0);

  const holdingsBox = await page.getByRole("table", { name: "Editable table" }).boundingBox();
  const pricesBox = await page.getByRole("table", { name: "Market prices" }).boundingBox();
  expect(holdingsBox).not.toBeNull();
  expect(pricesBox).not.toBeNull();
  expect(pricesBox!.y).toBeGreaterThan(holdingsBox!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("mock intelligence returns predictable output from the current portfolio values", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(mockDesktopUrl);

  await expect(page.getByRole("progressbar", { name: "Loading" }).first()).toBeVisible();
  const intelligence = page.getByRole("heading", { name: "Mock portfolio intelligence" }).locator("..");
  await expect(intelligence).toContainText("Mock intelligence response for the current portfolio snapshot");
  await expect(intelligence).toContainText("Largest position: MSFT");
  await expect(intelligence).toContainText("Market value: 1499.29");
  await expect(intelligence).toContainText("mock response; not model-generated");
});