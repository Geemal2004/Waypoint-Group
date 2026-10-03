// Local screenshot evidence; no credentials or restricted data are committed.
import { chromium } from "../apps/web/node_modules/playwright-core/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const base = process.env.WAYPOINT_URL || "http://localhost:8080";
const stage = process.argv[2] || "after";
const folder = new URL(`../tmp/product-ui/${stage}/`, import.meta.url);
await mkdir(folder, { recursive: true });
const browser = await chromium.launch();
const checks = [];
async function capture(page, name) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  checks.push({ name, overflow, viewport: page.viewportSize() });
  await page.screenshot({
    path: fileURLToPath(new URL(`${name}.png`, folder)),
    fullPage: false,
  });
}
for (const [role, width, height] of [
  ["dispatcher", 1440, 900],
  ["manager", 390, 844],
  ["loader", 390, 844],
  ["driver", 390, 844],
  ["loader", 1024, 768],
]) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByLabel("Username", { exact: true }).fill(role);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.JUDGE_PASSWORD || "WaypointDemo!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  await page
    .getByLabel("Operating day", { exact: true })
    .fill(process.env.OPERATING_DAY || "2026-01-08");
  await page
    .getByRole("heading", { level: 1 })
    .first()
    .waitFor({ timeout: 45000 });
  await page.getByLabel("Operating day", { exact: true }).blur();
  await page.waitForTimeout(4000);
  if (role === "dispatcher") {
    const published = page.getByText(/^Published runs \(/);
    if (await published.count()) {
      await published.click();
      const row = page.locator(".published-run").filter({ hasText: "VEH009" });
      const adjust = row.getByRole("button", {
        name: "Adjust untouched manifest",
        exact: true,
      });
      if ((await adjust.count()) && (await adjust.isEnabled())) {
        await adjust.click();
        await page
          .getByRole("button", { name: "Validate road routes", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Publish validated plan", exact: true })
          .waitFor();
        await page.evaluate(() => window.scrollTo(0, 0));
      }
    }
  }

  if (role === "loader") {
    const option = page.getByLabel("Assigned load", { exact: true });
    if (await option.count()) {
      const chosen = await option
        .locator("option")
        .evaluateAll(
          (rows) => rows.find((r) => r.textContent.includes("S1-024"))?.value,
        );
      if (chosen) await option.selectOption(chosen);
    }
  }
  await page.waitForTimeout(4000);
  await capture(page, `${role}-${width}`);
  await page
    .getByRole("button", { name: "Use night theme", exact: true })
    .click();
  await capture(page, `${role}-${width}-night`);
  await page
    .getByRole("button", { name: "Use day theme", exact: true })
    .click();
  if (role === "manager") {
    const catalog = await page.evaluate(
      async () => await (await fetch("/api/v1/catalog")).json(),
    );
    for (const brand of ["FRESH", "STYLE", "TECH"]) {
      const outlet =
        catalog.outlets.find((o) => o.brand_code === brand && !o.demo) ||
        catalog.outlets.find((o) => o.brand_code === brand);
      if (outlet) {
        await page
          .getByLabel("Outlet", { exact: true })
          .selectOption(outlet.id);
        await page
          .getByRole("button", { name: "New order", exact: true })
          .click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await capture(page, `manager-${brand}-catalogue`);
        await page.getByLabel("Search products").scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, 100));
        await capture(page, `manager-${brand}-products`);
      }
    }
  }
  if (role === "dispatcher") {
    await page
      .getByRole("button", { name: "Live control", exact: true })
      .click();
    await page.waitForTimeout(3500);
    await capture(page, "dispatcher-live-network");
  }

  await context.close();
}
await browser.close();
await writeFile(
  new URL("checks.json", folder),
  JSON.stringify(checks, null, 2),
);
if (checks.some((c) => c.overflow))
  throw Error("Horizontal overflow detected; inspect private captures.");
console.log(`Captured ${stage} role screens in tmp/product-ui.`);
