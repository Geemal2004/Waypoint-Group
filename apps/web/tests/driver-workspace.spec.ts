import { test, expect } from "@playwright/test";

for (const offline of [false, true]) {
  test(`driver keeps trips separate and retains proof confirmation ${offline ? "through offline reload" : "online"}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const account = {
      id: "driver-test",
      username: "driver",
      name: "Driver",
      role: "DRIVER",
      depot: "Colombo",
    };
    const makeOrder = (
      id: string,
      trip: number,
      sequence: number,
      status = "IN_TRANSIT",
    ) => ({
      id,
      reference: id,
      outlet_id: id,
      outlet_name: `Outlet ${id}`,
      brand_code: "FRESH",
      temperature: "AMBIENT",
      status,
      version: 1,
      day: "2026-01-08",
      demo: true,
      access: "TRUCK",
      window_start: "08:00",
      window_end: "17:00",
      lines: [
        {
          id: "line",
          product_id: "rice",
          name: "Rice",
          ordered: 10,
          loaded: 10,
          delivered: null,
          received: null,
          weight_kg: 1,
          volume_m3: 0.01,
          temperature: "AMBIENT",
        },
      ],
      run: {
        route_trip_id: `trip-${trip}`,
        vehicle_id: "VEH-1",
        vehicle_name: "Truck",
        trip,
        stop_sequence: sequence,
        plan_version: 1,
        departure_at: `2026-01-08T0${trip}:00:00Z`,
        partial_reason: null,
      },
      loadingIssues: [],
      timeline: [],
      deferrals: [],
      proof: null,
      receipt: null,
    });
    const orders = [
      makeOrder("A", 1, 1, "ARRIVED"),
      makeOrder("B", 1, 2),
      makeOrder("C", 2, 1),
    ];
    let accepted = false;
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/sync-delivery")) {
        accepted = true;
        orders[0].status = "DELIVERED";
        await route.fulfill({
          json: {
            outcome: "accepted",
            message: "Server accepted delivery proof",
          },
        });
        return;
      }
      const data = path.endsWith("/auth/me")
        ? account
        : path.endsWith("/auth/csrf")
          ? { token: "test", headerName: "X-CSRF-TOKEN" }
          : path.endsWith("/catalog")
            ? { outlets: [], products: [], operatingDays: [] }
            : path.endsWith("/orders")
              ? orders
              : path.endsWith("/journey")
                ? null
                : [];
      await route.fulfill({ json: data });
    });
    await page.goto("/");
    const trip = page.getByLabel("Assigned trip", { exact: true });
    const stop = page.getByLabel("Assigned stop", { exact: true });
    await expect(trip.getByRole("radio")).toHaveCount(2);
    await expect(stop.getByRole("radio")).toHaveCount(2);
    await expect(stop.locator('input[value="C"]')).toHaveCount(0);
    await stop.locator('input[value="B"]').check();
    await expect(
      page.getByRole("button", { name: "I've arrived", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText(
        "Complete or explicitly defer earlier stops before arriving here.",
      ),
    ).toBeVisible();
    await trip.getByRole("radio", { name: /VEH-1 · trip 2/ }).check();
    await expect(stop.getByRole("radio")).toHaveCount(1);
    await expect(stop.locator("input:checked")).toHaveValue("C");
    await trip.getByRole("radio", { name: /VEH-1 · trip 1/ }).check();
    await page
      .getByRole("button", { name: "All delivered as loaded", exact: true })
      .click();
    await expect(
      page.getByLabel("Delivery photo", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Delivery photo", { exact: true }).setInputFiles({
      name: "proof.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    if (offline) {
      // Production shell caching must control the page before testing offline reload.
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      await expect(
        page.getByAltText("Selected delivery evidence preview"),
      ).toBeVisible();
      await page.context().setOffline(true);
    }
    await page
      .getByRole("button", { name: "Save proof on this device", exact: true })
      .click();
    await expect(page.locator(".driver-saved-confirmation")).toContainText(
      "Outlet A",
    );
    if (offline) {
      await expect(page.locator(".driver-sync-banner")).toContainText(
        "1 stop to send",
      );
      expect(accepted).toBe(false);
      await page.reload();
      await expect(page.locator(".driver-saved-confirmation")).toContainText(
        "Outlet A",
      );
      await expect(
        page.getByLabel("Delivery photo", { exact: true }),
      ).toHaveCount(0);
      await page.context().setOffline(false);
    }
    await expect.poll(() => accepted).toBe(true);
    await expect(
      page.getByRole("heading", {
        name: "Delivery proof accepted",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Delivery photo", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "View next stop", exact: true })
      .click();
    await expect(stop.locator("input:checked")).toHaveValue("B");
    await expect(
      page.getByRole("button", { name: "I've arrived", exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
