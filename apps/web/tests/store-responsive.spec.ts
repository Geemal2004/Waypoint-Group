import { test, expect } from "@playwright/test";

for (const width of [360, 390, 768, 1024, 1440, 1920]) {
  test(`shop owner workspace at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const outlet = {
      id: "shop",
      name: "Colombo Central Store",
      brand_code: "FRESH",
      demo: false,
      window_start: "08:00",
      window_end: "17:00",
      access: "TRUCK",
    };
    const product = {
      id: "rice",
      name: "Premium long grain rice",
      brand_code: "FRESH",
      temperature: "AMBIENT",
      catalog_enabled: true,
      weight_kg: 2,
      volume_m3: 0.01,
      unit: "bags",
    };
    const order = {
      id: "order",
      reference: "STORE-001",
      outlet_id: "shop",
      outlet_name: outlet.name,
      brand_code: "FRESH",
      temperature: "AMBIENT",
      status: "SCHEDULED",
      version: 1,
      day: "2026-01-08",
      window_start: "08:00",
      window_end: "17:00",
      lines: [],
      run: null,
      deferrals: [],
      timeline: [],
      loadingIssues: [],
    };
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const data = path.endsWith("/auth/me")
        ? {
            id: "responsive-manager",
            name: "Shop Owner",
            username: "manager",
            role: "MANAGER",
            depot: "Colombo",
          }
        : path.endsWith("/catalog")
          ? {
              outlets: [outlet],
              products: [product],
              operatingDays: [{ day: "2099-01-08", demo: false }],
            }
          : path.endsWith("/orders")
            ? [order]
            : [];
      await route.fulfill({ json: data });
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Your store deliveries" }),
    ).toBeVisible();
    const noOverflow = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    await noOverflow();
    if (width >= 1100) {
      const cards = await page
        .locator(".store-summary .panel")
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
      expect(new Set(cards).size).toBe(1);
    }
    await page
      .getByRole("navigation", { name: "Store tasks" })
      .getByRole("button", { name: "New order", exact: true })
      .click();
    await page
      .getByLabel("Premium long grain rice quantity", { exact: true })
      .fill("3");
    const summary = page.getByRole("complementary", {
      name: "Current order summary",
    });
    await expect(summary).toContainText("6.0 kg");
    await noOverflow();
    if (width >= 1100) {
      const grid = await page
        .locator(".store-catalog-layout > .store-grid")
        .boundingBox();
      const side = await summary.boundingBox();
      expect(side!.x).toBeGreaterThanOrEqual(grid!.x + grid!.width);
    }
    await page
      .getByRole("button", { name: "Review order", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review your delivery request" }),
    ).toBeVisible();
    await noOverflow();
    await page.getByRole("button", { name: "Tracking", exact: true }).click();
    await page.getByRole("button").filter({ hasText: "STORE-001" }).click();
    await expect(
      page.getByRole("heading", { name: "STORE-001", exact: true }),
    ).toBeVisible();
    await noOverflow();
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Delivery history", exact: true }),
    ).toBeVisible();
    await noOverflow();
  });
}
