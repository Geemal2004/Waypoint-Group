import { test, expect, type Page } from "@playwright/test";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
async function login(page: Page, username: string) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("WaypointDemo!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
}
async function call(page: Page, path: string, body?: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const token = await (await fetch("/api/v1/auth/csrf")).json();
      const r = await fetch("/api/v1" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          [token.headerName]: token.token,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(data));
      return data;
    },
    { path, body },
  );
}
async function select(page: Page, id: string) {
  await page
    .getByRole("button")
    .filter({ hasText: id.slice(0, 8) })
    .click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
}
test("four role browser handoff, partial load, offline reload, same-stop conflict and recovery", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    [
      { width: 420, height: 900 },
      { width: 1600, height: 960 },
      { width: 390, height: 844 },
      { width: 390, height: 900 },
    ].map((viewport) => browser.newContext({ viewport })),
  );
  const [manager, dispatcher, loader, driver] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  const errors: string[] = [];
  for (const p of [manager, dispatcher, loader, driver])
    p.on("pageerror", (e) => errors.push(e.message));
  for (const [p, u] of [
    [manager, "manager"],
    [dispatcher, "dispatcher"],
    [loader, "loader"],
    [driver, "driver"],
  ] as const)
    await login(p, u);
  const catalog = await call(manager, "/catalog"),
    existing = await call(dispatcher, "/orders");
  const day = catalog.operatingDays.find(
    (d: { demo: boolean; day: string }) =>
      d.demo &&
      d.day > new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10) &&
      !existing.some(
        (o: { day: string; run?: { vehicle_id: string } }) =>
          o.day === d.day &&
          ["DEMO-DRY", "DEMO-VAN"].includes(o.run?.vehicle_id || ""),
      ),
  )?.day;
  expect(day).toBeTruthy();
  await manager.getByRole("button", { name: "New order", exact: true }).click();
  await manager.getByLabel("Requested operating day").selectOption(day);
  await manager.getByLabel("Rice cartons quantity", { exact: true }).fill("10");
  await manager
    .getByRole("button", { name: "Review order", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Place order", exact: true })
    .click();
  await expect(
    manager.getByRole("heading", { name: "Your deliveries", exact: true }),
  ).toBeVisible();
  const created = (await call(manager, "/orders")).filter(
    (o: { id: string }) => !existing.some((e: { id: string }) => e.id === o.id),
  );
  expect(created).toHaveLength(1);
  const id = created[0].id;
  await expect(
    dispatcher.getByRole("button").filter({ hasText: id.slice(0, 8) }),
  ).toBeVisible();
  await select(dispatcher, id);
  await dispatcher
    .getByLabel("Publication reason")
    .fill(
      "Browser walkthrough: synthetic one-stop reservation, safe capacity.",
    );
  await dispatcher
    .getByRole("button", { name: "Publish assigned load", exact: true })
    .click();
  await expect(
    loader.getByRole("button").filter({ hasText: id.slice(0, 8) }),
  ).toBeVisible();
  await select(loader, id);
  await noOverflow(loader);
  await loader
    .getByLabel("Loaded Rice cartons quantity", { exact: true })
    .fill("8");
  await loader.getByLabel("Loading exception").selectOption("SHORTAGE");
  await loader
    .getByRole("button", {
      name: "Acknowledge plan & save loading check",
      exact: true,
    })
    .click();
  await expect(
    loader.getByText(
      "Release held · dispatcher must approve the partial load.",
    ),
  ).toBeVisible();
  await dispatcher
    .getByLabel("Approval reason")
    .fill("Eight cartons approved; two known missing cartons remain recorded.");
  await dispatcher
    .getByRole("button", { name: "Approve partial release", exact: true })
    .click();
  await loader
    .getByRole("button", { name: "Release load to driver", exact: true })
    .click();
  await select(driver, id);
  await driver
    .getByRole("button", {
      name: "Acknowledge plan & start journey",
      exact: true,
    })
    .click();
  await driver
    .getByRole("button", {
      name: "Confirm arrival · safely stopped",
      exact: true,
    })
    .click();
  await driver
    .getByLabel("Delivery photo", { exact: true })
    .setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: png });
  await driver
    .getByRole("button", { name: "Save proof on this device", exact: true })
    .click();
  await expect(
    driver.getByText(`${id.slice(0, 8)} · Accepted by server`, { exact: true }),
  ).toBeVisible();
  await select(manager, id);
  await manager
    .getByRole("button", { name: "Confirm received", exact: true })
    .click();
  await expect(
    manager.getByRole("button").filter({ hasText: id.slice(0, 8) }),
  ).toContainText("Receipt confirmed");
  const received = await call(manager, `/orders/${id}`);
  expect(received.lines[0]).toMatchObject({
    ordered: 10,
    loaded: 8,
    delivered: 8,
    received: 8,
  });
  expect(received.receipt.issue).toBe("");
  await manager
    .getByRole("button", { name: "Use night theme", exact: true })
    .click();
  await expect(manager.locator("html")).toHaveAttribute("data-theme", "night");
  await noOverflow(manager);
  await manager.screenshot({
    path: "../../tmp/browser-results/manager-night.png",
    fullPage: true,
  });
  await loader.screenshot({
    path: "../../tmp/browser-results/loader-phone.png",
    fullPage: true,
  });
  await dispatcher.screenshot({
    path: "../../tmp/browser-results/dispatcher-desktop.png",
    fullPage: true,
  });

  // Set up a second real assignment, then exercise the durable browser proof path.
  let o = await call(manager, "/orders", {
    outletId: "DEMO-FRESH",
    day,
    items: [{ productId: "DEMO-RICE", quantity: 4 }],
  });
  o = await call(dispatcher, `/orders/${o.id}/publish`, {
    expectedVersion: o.version,
    vehicleId: "DEMO-VAN",
    loaderId: "DEMO-LOADER",
    trip: 1,
    departureAt: `${day}T00:00:00Z`,
    returnAt: `${day}T02:00:00Z`,
    estimatedFuelL: 10,
    reason: "Browser offline fixture · no road feasibility claim",
  });
  o = await call(loader, `/orders/${o.id}/loading`, {
    expectedVersion: o.version,
    lines: [{ lineId: o.lines[0].id, quantity: 4 }],
    reason: "NONE",
  });
  o = await call(loader, `/orders/${o.id}/release`, {
    expectedVersion: o.version,
  });
  await driver.reload();
  await select(driver, o.id);
  await driver
    .getByRole("button", {
      name: "Acknowledge plan & start journey",
      exact: true,
    })
    .click();
  await driver
    .getByRole("button", {
      name: "Confirm arrival · safely stopped",
      exact: true,
    })
    .click();
  await driver.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await driver.reload();
  await select(driver, o.id);
  await expect(
    driver.getByRole("button", {
      name: "Save proof on this device",
      exact: true,
    }),
  ).toBeVisible();
  await contexts[3].setOffline(true);
  await driver.reload();
  await select(driver, o.id);
  await noOverflow(driver);
  await driver
    .getByLabel("Delivery photo", { exact: true })
    .setInputFiles({ name: "offline.png", mimeType: "image/png", buffer: png });
  await driver
    .getByRole("button", { name: "Save proof on this device", exact: true })
    .click();
  await expect(
    driver.getByText(`${o.id.slice(0, 8)} · Saved on device · pending sync`, {
      exact: true,
    }),
  ).toBeVisible();
  await driver.reload();
  await expect(
    driver.getByText(`${o.id.slice(0, 8)} · Saved on device · pending sync`, {
      exact: true,
    }),
  ).toBeVisible();
  await driver.screenshot({
    path: "../../tmp/browser-results/driver-offline.png",
    fullPage: true,
  });
  await select(dispatcher, o.id);
  await dispatcher
    .getByLabel("Reason", { exact: true })
    .fill(
      "Same-stop closure while driver is offline; retain proof for review.",
    );
  await dispatcher
    .getByLabel("Next eligible day")
    .selectOption(
      catalog.operatingDays.find(
        (d: { demo: boolean; day: string }) => d.demo && d.day > day,
      ).day,
    );
  await dispatcher
    .getByRole("button", { name: "Record deferral", exact: true })
    .click();
  await expect(
    dispatcher.getByRole("button").filter({ hasText: o.id.slice(0, 8) }),
  ).toContainText("Deferred");
  await contexts[3].setOffline(false);
  await expect(
    driver.getByText(`${o.id.slice(0, 8)} · Conflict needs review`, {
      exact: true,
    }),
  ).toBeVisible();
  await dispatcher
    .getByLabel("Resolution reason")
    .fill(
      "Reviewed retained photo; actual delivery confirmed, preserve original deferral.",
    );
  await dispatcher
    .getByRole("button", { name: "Accept verified delivery", exact: true })
    .click();
  await expect(
    driver.getByText(`${o.id.slice(0, 8)} · Accepted by server`, {
      exact: true,
    }),
  ).toBeVisible();
  await select(manager, o.id);
  await manager
    .getByRole("button", { name: "Confirm received", exact: true })
    .click();
  expect((await call(manager, `/orders/${o.id}`)).deferrals).toHaveLength(1);
  expect(errors).toEqual([]);
  for (const c of contexts) await c.close();
});

test("Style scheduling and Tech protected receiving issue remain persisted", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    ["manager", "dispatcher", "loader", "driver"].map(() =>
      browser.newContext({ viewport: { width: 420, height: 900 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [manager, dispatcher, loader, driver] = pages;
  for (let i = 0; i < pages.length; i++)
    await login(pages[i], ["manager", "dispatcher", "loader", "driver"][i]);
  const catalog = await call(manager, "/catalog"),
    existing = await call(dispatcher, "/orders");
  const day = catalog.operatingDays.find(
    (d: { demo: boolean; day: string }) =>
      d.demo &&
      d.day > new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10) &&
      !existing.some(
        (o: { day: string; run?: { vehicle_id: string } }) =>
          o.day === d.day && o.run?.vehicle_id === "DEMO-DRY",
      ),
  )?.day;
  expect(day).toBeTruthy();
  await manager
    .getByRole("combobox", { name: "Outlet", exact: true })
    .selectOption("DEMO-TECH");
  await manager.getByRole("button", { name: "New order", exact: true }).click();
  await manager.getByLabel("Requested operating day").selectOption(day);
  await manager
    .getByLabel("55-inch television quantity", { exact: true })
    .fill("2");
  await manager
    .getByRole("button", { name: "Review order", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Place order", exact: true })
    .click();
  await expect(
    manager.getByRole("heading", { name: "Your deliveries", exact: true }),
  ).toBeVisible();
  let o = (await call(manager, "/orders")).find(
    (o: { id: string }) => !existing.some((e: { id: string }) => e.id === o.id),
  );
  expect(o.brand_code).toBe("TECH");
  o = await call(dispatcher, `/orders/${o.id}/publish`, {
    expectedVersion: o.version,
    vehicleId: "DEMO-DRY",
    loaderId: "DEMO-LOADER",
    trip: 1,
    departureAt: `${day}T03:30:00Z`,
    returnAt: `${day}T05:30:00Z`,
    estimatedFuelL: 10,
    reason: "Protected Tech fixture; no road feasibility claim",
  });
  o = await call(loader, `/orders/${o.id}/loading`, {
    expectedVersion: o.version,
    lines: [{ lineId: o.lines[0].id, quantity: 2 }],
    reason: "NONE",
  });
  o = await call(loader, `/orders/${o.id}/release`, {
    expectedVersion: o.version,
  });
  o = await call(driver, `/orders/${o.id}/start`, {
    expectedVersion: o.version,
  });
  o = await call(driver, `/orders/${o.id}/arrive`, {
    expectedVersion: o.version,
  });
  await driver.reload();
  await select(driver, o.id);
  await driver
    .getByLabel("Delivery photo", { exact: true })
    .setInputFiles({ name: "tech.png", mimeType: "image/png", buffer: png });
  await driver
    .getByRole("button", { name: "Save proof on this device", exact: true })
    .click();
  await expect(
    driver.getByText(`${o.id.slice(0, 8)} · Accepted by server`, {
      exact: true,
    }),
  ).toBeVisible();
  await select(manager, o.id);
  await manager.getByLabel("Receiving issue").selectOption("Damaged packaging");
  await manager
    .getByRole("button", { name: "Confirm received", exact: true })
    .click();
  await expect(
    manager.getByRole("button").filter({ hasText: o.id.slice(0, 8) }),
  ).toContainText("Receipt confirmed");
  expect((await call(manager, `/orders/${o.id}`)).receipt.issue).toBe(
    "Damaged packaging",
  );
  await manager
    .getByRole("combobox", { name: "Outlet", exact: true })
    .selectOption("DEMO-STYLE");
  await manager.getByRole("button", { name: "New order", exact: true }).click();
  await manager
    .getByLabel("Requested operating day")
    .selectOption("2026-10-07");
  await manager
    .getByLabel("Hanging garment cartons quantity", { exact: true })
    .fill("3");
  const before = await call(manager, "/orders");
  await manager
    .getByRole("button", { name: "Review order", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Place order", exact: true })
    .click();
  await expect(
    manager.getByRole("heading", { name: "Your deliveries", exact: true }),
  ).toBeVisible();
  const style = (await call(manager, "/orders")).find(
    (o: { id: string }) => !before.some((e: { id: string }) => e.id === o.id),
  );
  expect(style.day).toBe("2026-10-12");
  await select(manager, style.id);
  await expect(
    manager.locator(".notice").filter({ hasText: style.schedule_reason }),
  ).toBeVisible();
  await noOverflow(manager);
  await manager.screenshot({
    path: "../../tmp/browser-results/style-scheduled.png",
    fullPage: true,
  });
  const peer = await contexts[3].newPage();
  await peer.goto("/");
  await expect(
    peer.getByRole("heading", {
      name: "Your assigned deliveries",
      exact: true,
    }),
  ).toBeVisible();
  await driver.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    peer.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await driver.getByLabel("Username", { exact: true }).fill("manager");
  await driver
    .getByLabel("Password", { exact: true })
    .fill("WaypointDemo!2026");
  await driver.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    driver.getByRole("heading", { name: "Your deliveries", exact: true }),
  ).toBeVisible();
  await expect(
    driver.getByRole("heading", { name: "Proof on this device", exact: true }),
  ).toHaveCount(0);
  await expect(
    peer.getByRole("heading", { name: "Your deliveries", exact: true }),
  ).toBeVisible();
  await peer.getByRole("button", { name: "New order", exact: true }).click();
  await peer.getByLabel("Rice cartons quantity", { exact: true }).fill("1");
  await peer.getByRole("button", { name: "Review order", exact: true }).click();
  await peer.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(
    peer.getByRole("heading", { name: "Your deliveries", exact: true }),
  ).toBeVisible();
  for (const c of contexts) await c.close();
});
