import { test, expect, type Page } from "@playwright/test";

const account = {
  id: "driver-layout",
  username: "driver",
  name: "Driver",
  role: "DRIVER",
  depot: "Colombo",
};
const order = (id: string, sequence: number, status: string) => ({
  id,
  reference: id,
  outlet_id: id,
  outlet_name: `Keells Super Nugegoda ${id}`,
  brand_code: "FRESH",
  temperature: "CHILLED",
  status,
  version: 1,
  day: "2026-01-08",
  demo: true,
  access: "VAN_ONLY",
  window_start: "10:30",
  window_end: "11:30",
  lines: [
    {
      id: `line-${id}`,
      product_id: "milk",
      name: "Fresh milk 1L",
      ordered: 24,
      loaded: 24,
      delivered: null,
      received: null,
      weight_kg: 1,
      volume_m3: 0.01,
      temperature: "CHILLED",
    },
  ],
  run: {
    route_trip_id: "trip-1",
    vehicle_id: "VEH-1",
    vehicle_name: "Chilled van",
    trip: 1,
    stop_sequence: sequence,
    plan_version: 1,
    departure_at: "2026-01-08T04:00:00Z",
    partial_reason: null,
  },
  loadingIssues: [],
  timeline: [],
  deferrals: [],
  proof: null,
  receipt: null,
});

const journey = {
  vehicleId: "VEH-1",
  destination: { longitude: 79.9, latitude: 6.87, supplemental: false },
  trip: {},
  stops: [],
  location: null,
};

async function openDriver(
  page: Page,
  orders: unknown[],
  posted: string[] = [],
) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") posted.push(path);
    if (path.endsWith("/location")) {
      await route.fulfill({
        json: {
          ...route.request().postDataJSON(),
          receivedAt: new Date().toISOString(),
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
              ? journey
              : [];
    await route.fulfill({ json: data });
  });
  await page.goto("/");
  await expect(page.locator(".driver-workspace")).toBeVisible();
}

const smallestText = (page: Page) =>
  page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.querySelector(".app-shell")!,
      NodeFilter.SHOW_TEXT,
    );
    const offenders: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement!;
      if (!n.textContent!.trim() || el.closest(".maplibregl-ctrl-attrib"))
        continue;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size > 0 && size < 16)
        offenders.push(`${size}px: ${n.textContent!.trim()}`);
    }
    return offenders;
  });

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`driver phone layout is readable and thumb-reachable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openDriver(page, [
      order("A", 1, "IN_TRANSIT"),
      order("B", 2, "IN_TRANSIT"),
    ]);

    expect(await smallestText(page)).toEqual([]);

    const outlet = page.getByRole("heading", {
      name: "Keells Super Nugegoda A",
    });
    await expect(outlet).toBeInViewport();
    expect(
      parseFloat(await outlet.evaluate((e) => getComputedStyle(e).fontSize)),
    ).toBeGreaterThanOrEqual(32);

    const arrive = page.getByRole("button", {
      name: "I've arrived",
      exact: true,
    });
    await expect(arrive).toBeInViewport();
    const arriveBox = (await arrive.boundingBox())!;
    expect(arriveBox.height).toBeGreaterThanOrEqual(64);

    const nav = page.getByRole("navigation", { name: "Driver tasks" });
    const navBox = (await nav.boundingBox())!;
    expect(navBox.y + navBox.height).toBeCloseTo(viewport.height, 0);
    expect(arriveBox.y + arriveBox.height).toBeLessThanOrEqual(navBox.y);
    for (const button of await nav.getByRole("button").all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(64);

    await page.mouse.wheel(0, 2000);
    await expect(arrive).toBeInViewport();

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("desktop screens show the driver app in a centred phone-width frame", async ({
  page,
}) => {
  const viewport = { width: 1440, height: 900 };
  await page.setViewportSize(viewport);
  await openDriver(page, [
    order("A", 1, "IN_TRANSIT"),
    order("B", 2, "IN_TRANSIT"),
  ]);

  const frame = (await page.locator(".workspace").boundingBox())!;
  expect(frame.width).toBeCloseTo(440, 0);
  expect(frame.x + frame.width / 2).toBeCloseTo(viewport.width / 2, -1);

  const nav = page.getByRole("navigation", { name: "Driver tasks" });
  const arrive = page.getByRole("button", {
    name: "I've arrived",
    exact: true,
  });
  for (const target of [nav, page.locator(".driver-action-bar"), arrive]) {
    const box = (await target.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(frame.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
  }
  const navBox = (await nav.boundingBox())!;
  expect(navBox.y + navBox.height).toBeCloseTo(viewport.height, 0);

  const outlet = page.getByRole("heading", { name: "Keells Super Nugegoda A" });
  expect(
    parseFloat(await outlet.evaluate((e) => getComputedStyle(e).fontSize)),
  ).toBeLessThanOrEqual(36);
  expect(await smallestText(page)).toEqual([]);
  await arrive.click();
  const sheet = (await page.locator(".driver-sheet").boundingBox())!;
  expect(sheet.width).toBeLessThanOrEqual(441);
});

test("arrival needs a deliberate confirmation in a bottom sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const posted: string[] = [];
  await openDriver(page, [order("A", 1, "IN_TRANSIT")], posted);
  const arrive = page.getByRole("button", {
    name: "I've arrived",
    exact: true,
  });
  const sheet = page.getByRole("dialog", { name: "Keells Super Nugegoda A" });

  await arrive.click();
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Confirm arrival", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  expect(posted.filter((p) => p.endsWith("/arrive"))).toEqual([]);

  await arrive.click();
  await sheet
    .getByRole("button", { name: "Confirm arrival", exact: true })
    .click();
  await expect.poll(() => posted).toContain("/api/v1/orders/A/arrive");
});

test("arrival is locked while GPS reports the vehicle moving", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.addInitScript(() => {
    (window as any).__speed = 12;
    navigator.geolocation.watchPosition = (success) => {
      const emit = () =>
        success({
          timestamp: Date.now(),
          coords: {
            latitude: 6.87,
            longitude: 79.9,
            accuracy: 15,
            speed: (window as any).__speed,
          },
        } as GeolocationPosition);
      emit();
      return window.setInterval(emit, 300);
    };
    navigator.geolocation.clearWatch = (id) => window.clearInterval(id);
  });
  await openDriver(page, [order("A", 1, "IN_TRANSIT")]);
  await page
    .getByRole("button", { name: "Share location", exact: true })
    .click();

  const locked = page.getByRole("button", {
    name: "Stop safely to record arrival",
    exact: true,
  });
  await expect(locked).toBeDisabled();
  await expect(locked).toBeInViewport();
  await expect(
    page.getByText("Vehicle is moving. Stop safely before recording arrival."),
  ).toBeVisible();

  await page.evaluate(() => ((window as any).__speed = 0));
  await expect(
    page.getByRole("button", { name: "I've arrived", exact: true }),
  ).toBeEnabled();
});

test("trip and stop pickers are large tappable cards", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const second = order("C", 1, "IN_TRANSIT");
  second.run = { ...second.run, route_trip_id: "trip-2", trip: 2 };
  await openDriver(page, [
    order("A", 1, "DELIVERED"),
    order("B", 2, "IN_TRANSIT"),
    second,
  ]);
  const trips = page.getByRole("radiogroup", { name: "Assigned trip" });
  const stops = page.getByRole("radiogroup", { name: "Assigned stop" });
  await expect(trips.getByRole("radio")).toHaveCount(2);
  await expect(stops.locator("li")).toHaveCount(2);
  await expect(stops.getByRole("radio")).toHaveCount(1);
  for (const card of await page
    .locator(".driver-choice, .driver-stop-row")
    .all())
    expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(72);

  await trips.getByRole("radio", { name: /trip 2/ }).check();
  await expect(
    page.getByRole("heading", { name: "Keells Super Nugegoda C" }),
  ).toBeVisible();
});

const png = {
  name: "proof.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
};

test("driver reopens saved proof when the service is unreachable but Wi-Fi stays online", async ({
  page,
}) => {
  await openDriver(page, [order("A", 1, "ARRIVED")]);
  await page
    .getByRole("button", { name: "All delivered as loaded", exact: true })
    .click();
  await page.getByLabel("Delivery photo", { exact: true }).setInputFiles(png);
  await expect(
    page.getByText("Draft saved on this device", { exact: false }),
  ).toBeVisible();
  await page.route("**/api/v1/**", (route) =>
    route.abort("internetdisconnected"),
  );
  await page.reload();
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await expect(page.locator(".driver-workspace")).toBeVisible();
  await expect(page.locator(".driver-sync-banner")).toContainText("Offline");
  await expect(page.locator(".driver-sync-banner")).not.toContainText("Online");
  await expect(
    page.getByText("Service connection unavailable.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByAltText("Selected delivery evidence preview"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save proof on this device", exact: true })
    .click();
  await expect(page.locator(".driver-saved-confirmation")).toContainText(
    "Keells Super Nugegoda A",
  );
  await expect(page.locator(".driver-sync-banner")).toContainText(
    "1 stop to send",
  );
  await page.unroute("**/api/v1/**");
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({ status: 503, json: { message: "Service unavailable" } }),
  );
  await page.reload();
  await expect(page.locator(".driver-workspace")).toBeVisible();
  await expect(page.locator(".driver-sync-banner")).toContainText("Offline");
  await expect(page.locator(".driver-sync-banner")).toContainText(
    "1 stop to send",
  );
  await openDriver(page, [order("A", 1, "ARRIVED")]);
  await expect(page.locator(".driver-sync-banner")).toContainText("Online");
});

test("an unchanged delivery is recorded in three taps after arrival", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openDriver(page, [order("A", 1, "ARRIVED")]);
  await expect(page.getByText("Step 1 of 2 · Count")).toBeVisible();
  await expect(page.getByLabel("Delivery photo", { exact: true })).toHaveCount(
    0,
  );

  await page
    .getByRole("button", { name: "All delivered as loaded", exact: true })
    .click();
  await expect(page.getByText("Step 2 of 2 · Photo and save")).toBeVisible();
  await expect(page.locator(".driver-delivery-summary")).toContainText(
    "24 of 24 released units delivered",
  );
  await page.getByLabel("Delivery photo", { exact: true }).setInputFiles(png);
  await expect(
    page.getByAltText("Selected delivery evidence preview"),
  ).toBeVisible();
  const save = page.getByRole("button", {
    name: "Save proof on this device",
    exact: true,
  });
  await expect(save).toBeEnabled();
  await expect(save).toBeInViewport();
  expect(await smallestText(page)).toEqual([]);
});

test("a short delivery needs a reason before the photo step", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openDriver(page, [order("A", 1, "ARRIVED")]);
  const next = page.getByRole("button", {
    name: "Continue to photo",
    exact: true,
  });
  await expect(next).toBeEnabled();
  await page
    .getByRole("button", { name: "Decrease Delivered Fresh milk 1L" })
    .click();
  await expect(next).toBeDisabled();
  await expect(page.getByText("Why is it short? (required)")).toBeVisible();
  const reason = page
    .getByRole("radiogroup", { name: "Delivery issue" })
    .getByRole("radio", { name: "Short at delivery", exact: true });
  await reason.check();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.getByText("23 of 24")).toBeVisible();
  await page.getByRole("button", { name: "Change quantities" }).click();
  await expect(
    page.getByLabel("Delivered Fresh milk 1L quantity", { exact: true }),
  ).toHaveValue("23");
  await expect(reason).toBeChecked();
});

test("the delivery form is replaced while GPS reports the vehicle moving", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.addInitScript(() => {
    (window as any).__speed = 12;
    navigator.geolocation.watchPosition = (success) => {
      const emit = () =>
        success({
          timestamp: Date.now(),
          coords: {
            latitude: 6.87,
            longitude: 79.9,
            accuracy: 15,
            speed: (window as any).__speed,
          },
        } as GeolocationPosition);
      emit();
      return window.setInterval(emit, 300);
    };
    navigator.geolocation.clearWatch = (id) => window.clearInterval(id);
  });
  await openDriver(page, [order("A", 1, "ARRIVED")]);
  await page.getByRole("button", { name: "Journey", exact: true }).click();
  await page
    .getByRole("button", { name: "Share location", exact: true })
    .click();
  await page.getByRole("button", { name: "Stop proof", exact: true }).click();
  await expect(
    page.getByText(/Vehicle is moving\. Your draft is kept/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "All delivered as loaded" }),
  ).toHaveCount(0);

  await page.evaluate(() => ((window as any).__speed = 0));
  await expect(
    page.getByRole("button", { name: "All delivered as loaded" }),
  ).toBeVisible();
});

test("driver text scales with a 200% system font size without horizontal scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openDriver(page, [order("A", 1, "RELEASED")]);
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await expect(
    page.getByRole("button", { name: "Acknowledge plan & start journey" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
