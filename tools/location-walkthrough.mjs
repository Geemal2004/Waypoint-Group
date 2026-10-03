// Run after dataset-walkthrough on an isolated judge project. Mutates the untouched Tech trip.
// Browser coordinates are explicitly emulated test input, never a physical-GPS claim.
import assert from "node:assert/strict";
import {
  chromium,
  expect,
} from "../apps/web/node_modules/@playwright/test/index.mjs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const base = process.env.WAYPOINT_URL || "http://localhost:8080";
const password = process.env.JUDGE_PASSWORD || "WaypointDemo!2026";
class Client {
  cookie = "";
  token = "";
  header = "";
  async call(path, body) {
    const r = await fetch(base + "/api/v1" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: this.cookie,
        "Content-Type": "application/json",
        ...(body === undefined ? {} : { [this.header]: this.token }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of r.headers.getSetCookie())
      if (c.startsWith("JSESSIONID=")) this.cookie = c.split(";")[0];
    const result = await r.json();
    assert.equal(r.status, 200, `${path}: ${JSON.stringify(result)}`);
    return result;
  }
  async csrf() {
    const q = await this.call("/auth/csrf");
    this.header = q.headerName;
    this.token = q.token;
  }
  async login(username) {
    await this.csrf();
    const r = await fetch(base + "/api/v1/auth/login", {
      method: "POST",
      headers: {
        Cookie: this.cookie,
        [this.header]: this.token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ username, password }).toString(),
    });
    assert.equal(r.status, 200);
    for (const c of r.headers.getSetCookie())
      if (c.startsWith("JSESSIONID=")) this.cookie = c.split(";")[0];
    await this.csrf();
  }
}
const loader = new Client(),
  driver = new Client();
await loader.login("loader");
await driver.login("driver");
const orders = await loader.call("/orders");
const stops = ["S1-023", "S1-024", "S1-025"].map((ref) =>
  orders.find((o) => o.source_ref === ref),
);
assert.ok(
  stops.every(
    (o) =>
      o &&
      ["SCHEDULED", "LOADING", "RELEASED", "IN_TRANSIT", "ARRIVED"].includes(
        o.status,
      ),
  ),
  "Use the isolated dataset walkthrough; Tech trip must not be completed or deferred.",
);
const folder = new URL("../tmp/product-ui/location/", import.meta.url);
await mkdir(folder, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
async function capture(name) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: fileURLToPath(new URL(name + ".png", folder)),
    fullPage: false,
  });
}
try {
  for (const stop of stops) {
    let o = await loader.call(`/orders/${stop.id}`);
    if (o.status === "SCHEDULED")
      o = await loader.call(`/orders/${o.id}/loading`, {
        expectedVersion: o.version,
        reason: "NONE",
        lines: o.lines.map((l) => ({ lineId: l.id, quantity: l.ordered })),
      });
    if (o.status === "LOADING")
      await loader.call(`/orders/${o.id}/release`, {
        expectedVersion: o.version,
      });
  }
  let first = await driver.call(`/orders/${stops[0].id}`);
  if (first.status === "RELEASED")
    await driver.call(`/orders/${first.id}/start`, {
      expectedVersion: first.version,
    });
  await page.goto(base);
  await page.getByLabel("Username", { exact: true }).fill("driver");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Operating day", { exact: true }).fill("2026-01-08");
  await page
    .getByLabel("Assigned stop", { exact: true })
    .selectOption(first.id);
  const cdp = await browser.newBrowserCDPSession();
  const { browserContextIds } = await cdp.send("Target.getBrowserContexts");
  await cdp.send("Browser.setPermission", {
    permission: { name: "geolocation" },
    setting: "denied",
    origin: base,
    browserContextId: browserContextIds[0],
  });
  await page
    .getByRole("button", { name: "Start location reporting", exact: true })
    .click();
  await expect(
    page.getByText("Location permission denied. Enable permission to report.", {
      exact: true,
    }),
  ).toBeVisible();
  await capture("driver-permission-denied");
  await cdp.send("Browser.setPermission", {
    permission: { name: "geolocation" },
    setting: "granted",
    origin: base,
    browserContextId: browserContextIds[0],
  });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    longitude: 79.912,
    latitude: 6.965,
    accuracy: 150,
  });
  await page
    .getByRole("button", { name: "Start location reporting", exact: true })
    .click();
  await expect(
    page.getByText("Location accepted · poor accuracy; approximate position", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/server accepted/).first()).toBeVisible();
  const poor = (await driver.call(`/orders/${first.id}/journey`)).location;
  assert.equal(poor.poorAccuracy, true);
  assert.ok(poor.receivedAt && poor.capturedAt);
  await capture("driver-poor-accuracy");
  await context.setOffline(true);
  await context.setGeolocation({
    longitude: 79.913,
    latitude: 6.966,
    accuracy: 12,
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(sessionStorage).some((k) =>
          k.startsWith("waypoint-position:"),
        ),
      ),
    )
    .toBe(true);
  await capture("driver-offline-position-queue");
  await context.setOffline(false);
  await expect(
    page.getByText("Location accepted by the dispatcher", { exact: true }),
  ).toBeVisible({ timeout: 25000 });
  await expect
    .poll(async () =>
      Number(
        (await driver.call(`/orders/${first.id}/journey`)).location.longitude,
      ),
    )
    .toBe(79.913);
  await page
    .getByRole("button", { name: "Stop location reporting", exact: true })
    .click();
  await expect(
    page.getByText("Reporting stopped; last accepted position will expire", {
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture("driver-journey");
  const current = await driver.call(`/orders/${first.id}`);
  if (current.status === "IN_TRANSIT")
    await page
      .getByRole("button", {
        name: "Confirm arrival · safely stopped",
        exact: true,
      })
      .click();
  await expect(
    page.getByLabel("Delivery photo", { exact: true }),
  ).toBeVisible();
  await capture("driver-stop-proof");
  await page
    .getByRole("button", { name: "Use night theme", exact: true })
    .click();
  await capture("driver-stop-proof-night");
  const button = page.getByRole("button", {
    name: "Save proof on this device",
    exact: true,
  });
  const box = await button.boundingBox();
  assert.ok(
    box && box.y + box.height <= 844 && box.height >= 48,
    "Phone proof action remains visible and touch sized",
  );
  console.log(
    "PASS: emulated-browser denied permission, poor accuracy, capture/server receipt, offline latest-position queue, reconnect, stop reporting, ordered road journey and phone proof/night layout. Physical GPS/background tracking remains unverified.",
  );
} finally {
  await context.close();
  await browser.close();
}
