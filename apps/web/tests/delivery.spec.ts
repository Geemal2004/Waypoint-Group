import { test, expect, type Page, type Browser } from "@playwright/test";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
async function login(p: Page, user: string) {
  await p.goto("/");
  await p.getByLabel("Username", { exact: true }).fill(user);
  await p
    .getByLabel("Password", { exact: true })
    .fill(process.env.JUDGE_PASSWORD || "WaypointDemo!2026");
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    p.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
}
async function call(p: Page, path: string, body?: unknown) {
  return p.evaluate(
    async ({ path, body }) => {
      const csrf = await (await fetch("/api/v1/auth/csrf")).json();
      const r = await fetch("/api/v1" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          [csrf.headerName]: csrf.token,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw Error(`${r.status}: ${JSON.stringify(data)}`);
      return data;
    },
    { path, body },
  );
}
async function roles(browser: Browser) {
  const contexts = [],
    pages = [];
  for (const [i, user] of [
    "manager",
    "dispatcher",
    "loader",
    "driver",
  ].entries()) {
    const c = await browser.newContext({
      viewport: { width: i === 1 ? 1440 : 390, height: i === 1 ? 900 : 844 },
    });
    contexts.push(c);
    const p = await c.newPage();
    await login(p, user);
    pages.push(p);
  }
  return { contexts, pages };
}
async function noOverflow(p: Page) {
  expect(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
}
async function assigned(p: Page, label: string, id: string) {
  if (await p.evaluate(() => navigator.onLine)) {
    const order = await call(p, `/orders/${id}`);
    await p.getByLabel("Operating day", { exact: true }).fill(order.day);
  }
  await expect(
    p.getByLabel(label, { exact: true }).locator(`option[value="${id}"]`),
  ).toHaveCount(1);
  await p.getByLabel(label, { exact: true }).selectOption(id);
}
async function proof(p: Page) {
  await p
    .getByLabel("Delivery photo", { exact: true })
    .setInputFiles({ name: "proof.png", mimeType: "image/png", buffer: png });
  await expect(
    p.getByAltText("Selected delivery evidence preview"),
  ).toBeVisible();
  await p
    .getByRole("button", { name: "Save proof on this device", exact: true })
    .click();
  await p.getByRole("button", { name: "Sync", exact: true }).click();
}
async function store(p: Page, outlet: string, ref: string) {
  const selected = (await call(p, "/orders")).find(
    (o: any) => (o.source_ref || o.reference) === ref,
  );
  if (selected)
    await p.getByLabel("Operating day", { exact: true }).fill(selected.day);
  await p.getByLabel("Outlet", { exact: true }).selectOption(outlet);
  await p.getByRole("button", { name: "Home", exact: true }).click();
  await p.getByRole("button").filter({ hasText: ref }).click();
}
async function manual(p: Page, refs: string[], vehicle: string) {
  const board = p.getByRole("region", { name: "Dataset multi-stop planning" });
  for (const ref of refs)
    await board.getByLabel(`Select ${ref}`, { exact: true }).check();
  await board
    .getByRole("button", { name: "Assign selected manually", exact: true })
    .click();
  await board.getByLabel("Vehicle", { exact: true }).selectOption(vehicle);
  await board
    .getByRole("button", { name: "Validate road routes", exact: true })
    .click();
  await expect(
    board.getByRole("button", { name: "Publish validated plan", exact: true }),
  ).toBeEnabled();
  await board
    .getByRole("button", { name: "Publish validated plan", exact: true })
    .click();
  await expect(
    board.getByRole("button", { name: "Publish validated plan", exact: true }),
  ).toHaveCount(0);
}

test("source multi-stop online handoff, approved shortage and durable offline conflict recovery", async ({
  browser,
}) => {
  const sourceFirst = process.env.JUDGE_SOURCE_FIRST || "S1-008";
  const sourceSecond = process.env.JUDGE_SOURCE_SECOND || "S1-006";
  const sourceVehicle = process.env.JUDGE_SOURCE_VEHICLE || "VEH008";
  test.setTimeout(300000);
  const { contexts, pages } = await roles(browser);
  const [m, d, l, v] = pages;
  try {
    const context = await call(d, "/planning?day=2026-01-08"),
      first = context.orders.find((o: any) => o.source_ref === sourceFirst),
      second = context.orders.find((o: any) => o.source_ref === sourceSecond);
    test.skip(
      !context.orders.some((o: any) => o.source_ref?.startsWith("S1-")),
      "Private S1 inputs are absent; run this scenario in the private judge environment",
    );
    expect(
      first,
      "Prepare private S1 and reset the isolated judge database",
    ).toBeTruthy();
    expect(first.status).toBe("RECEIVED");
    expect(second.status).toBe("RECEIVED");
    await manual(d, [sourceFirst, sourceSecond], sourceVehicle);
    await assigned(l, "Assigned load", first.id);
    await expect(
      l.getByRole("heading", {
        name: "Load in reverse delivery order",
        exact: true,
      }),
    ).toBeVisible();
    await noOverflow(l);
    for (const [o, i] of [
      [first, 0],
      [second, 1],
    ] as const) {
      await assigned(l, "Assigned load", o.id);
      const detail = await call(l, `/orders/${o.id}`);
      await l
        .getByLabel(`Loaded ${detail.lines[0].name} quantity`, { exact: true })
        .fill(String(detail.lines[0].ordered - (i === 0 ? 1 : 0)));
      if (i === 0)
        await l.getByLabel("Loading exception").selectOption("SHORTAGE");
      await l
        .getByRole("button", {
          name: "Acknowledge plan & save loading check",
          exact: true,
        })
        .click();
      if (i === 0) {
        await expect(
          l.getByText(
            "Release held · dispatcher must approve the partial load.",
          ),
        ).toBeVisible();
        await d
          .getByRole("button", { name: "Orders / cutoff", exact: true })
          .click();
        await d.getByRole("button", { name: sourceFirst, exact: true }).click();
        await d
          .getByLabel("Decision reason")
          .fill(
            "One source unit missing; preserve the known shortage through every handoff.",
          );
        await d
          .getByRole("button", { name: "Approve reduced load", exact: true })
          .click();
      }
      await l
        .getByRole("button", { name: "Release load to driver", exact: true })
        .click();
    }
    await assigned(v, "Assigned stop", first.id);
    await v
      .getByRole("button", {
        name: "Acknowledge plan & start journey",
        exact: true,
      })
      .click();
    await v
      .getByRole("button", {
        name: "Confirm arrival · safely stopped",
        exact: true,
      })
      .click();
    await proof(v);
    await expect(
      v.getByText(`${sourceFirst} · Accepted by server`, { exact: true }),
    ).toBeVisible();
    await store(m, first.outlet_id, sourceFirst);
    await m
      .getByRole("button", { name: "Confirm received", exact: true })
      .click();
    await expect
      .poll(async () => {
        const receipt = await call(m, `/orders/${first.id}`);
        return receipt.lines[0].received;
      })
      .toBe((await call(m, `/orders/${first.id}`)).lines[0].ordered - 1);
    await v.getByRole("button", { name: "Journey", exact: true }).click();
    await assigned(v, "Assigned stop", second.id);
    await v
      .getByRole("button", {
        name: "Confirm arrival · safely stopped",
        exact: true,
      })
      .click();
    await expect(v.getByLabel("Delivery photo", { exact: true })).toBeVisible();
    await v.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await v.reload();
    await assigned(v, "Assigned stop", second.id);
    await expect(v.getByLabel("Delivery photo", { exact: true })).toBeVisible();
    await contexts[3].setOffline(true);
    await v.reload();
    await assigned(v, "Assigned stop", second.id);
    await proof(v);
    await v.reload();
    await v.getByRole("button", { name: "Sync", exact: true }).click();
    await expect(
      v.getByText(`${sourceSecond} · Saved on device · pending sync`, {
        exact: true,
      }),
    ).toBeVisible();
    await noOverflow(v);
    const latest = await call(d, `/orders/${second.id}`);
    await call(d, `/orders/${second.id}/defer`, {
      expectedVersion: latest.version,
      nextDay: "2026-01-09",
      reason:
        "Same stop deferred while its proof was offline; retain evidence.",
    });
    await contexts[3].setOffline(false);
    await expect(
      v.getByText(`${sourceSecond} · Conflict needs review`, { exact: true }),
    ).toBeVisible();
    await d.getByRole("button", { name: "History", exact: true }).click();
    await d
      .getByLabel("Resolution reason")
      .fill(
        "Verified the retained physical photo. Recover delivery and retain the deferral history.",
      );
    await d
      .getByRole("button", { name: "Accept verified delivery", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await call(d, "/sync-conflicts")).find(
            (c: any) => c.order_id === second.id,
          )?.state,
      )
      .toBe("ACCEPTED");
    await v.getByRole("button", { name: "Retry sync", exact: true }).click();
    await expect(
      v.getByText(`${sourceSecond} · Accepted by server`, { exact: true }),
    ).toBeVisible();
    await store(m, second.outlet_id, sourceSecond);
    await m
      .getByRole("button", { name: "Confirm received", exact: true })
      .click();
    expect((await call(m, `/orders/${second.id}`)).deferrals).toHaveLength(1);
    await noOverflow(m);
    await noOverflow(d);
  } finally {
    for (const c of contexts) await c.close();
  }
});

test("reviewed store drafts produce a versioned multi-stop road journey with live issues and telemetry", async ({
  browser,
}) => {
  test.setTimeout(300000);
  const { contexts, pages } = await roles(browser);
  const [m, d, l, v] = pages;
  try {
    const catalog = await call(m, "/catalog");
    test.skip(
      !catalog.outlets.some((o: any) => o.id === "OUT001"),
      "Private source network and prepared OSRM are required for this scenario",
    );
    const day = process.env.JUDGE_OPERATING_DAY || "2026-10-06",
      rescheduleDay = process.env.JUDGE_RESCHEDULE_DAY || "2026-10-07",
      created = [];
    for (const [outlet, qty] of [
      ["OUT001", 10],
      ["OUT002", 4],
    ] as const) {
      await m.getByLabel("Outlet", { exact: true }).selectOption(outlet);
      await m.getByRole("button", { name: "New order", exact: true }).click();
      await m.getByLabel("Requested operating day").selectOption(day);
      await m
        .getByLabel("Rice cartons quantity", { exact: true })
        .fill(String(qty));
      await m.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(
        m.getByText("Draft saved to your account. It is not allocated."),
      ).toBeVisible();
      await m
        .getByRole("button", { name: "Review order", exact: true })
        .click();
      const submission = m.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          /\/api\/v1\/drafts\/[^/]+\/submit$/.test(
            new URL(response.url()).pathname,
          ) &&
          response.status() === 200,
      );
      await m
        .getByRole("button", { name: "Submit reviewed order", exact: true })
        .click();
      await expect(m.getByText(/Order WP-.*submitted/)).toBeVisible();
      created.push(await (await submission).json());
    }
    for (const o of created) expect(o.confirmed_at).toBeNull();
    await d.getByLabel("Operating day", { exact: true }).fill(day);
    await d
      .getByRole("button", { name: "Orders / cutoff", exact: true })
      .click();
    for (const o of created) {
      await d.getByRole("button", { name: o.reference, exact: true }).click();
      await d
        .getByLabel("Decision reason")
        .fill("Reviewed store quantities, dry load and outlet window.");
      await d
        .getByRole("button", { name: "Confirm reviewed order", exact: true })
        .click();
      await expect
        .poll(async () => (await call(d, `/orders/${o.id}`)).confirmed_at)
        .not.toBeNull();
    }
    await d.getByRole("button", { name: "Planning", exact: true }).click();
    await manual(
      d,
      created.map((o) => o.reference),
      "VEH037",
    );
    const before = await call(m, `/orders/${created[0].id}`);
    await expect(
      call(m, `/orders/${before.id}/commands`, {
        commandId: crypto.randomUUID(),
        expectedVersion: before.version,
        operation: "AMEND",
        reason: "Excess demand must roll back the whole amendment",
        day,
        items: [{ productId: "DEMO-RICE", quantity: 10000 }],
      }),
    ).rejects.toThrow(/422/);
    const rejected = await call(m, `/orders/${before.id}`);
    expect(rejected.version).toBe(before.version);
    expect(rejected.lines[0].ordered).toBe(10);
    expect(rejected.run.plan_version).toBe(before.run.plan_version);
    await expect(
      call(m, `/orders/${before.id}/commands`, {
        commandId: crypto.randomUUID(),
        expectedVersion: before.version - 1,
        operation: "AMEND",
        reason: "Stale amendment must be rejected",
        day,
        items: [{ productId: "DEMO-RICE", quantity: 11 }],
      }),
    ).rejects.toThrow(/409/);

    await call(m, `/orders/${before.id}/commands`, {
      commandId: crypto.randomUUID(),
      expectedVersion: before.version,
      operation: "AMEND",
      reason: "One additional carton reviewed before loading",
      day,
      items: [{ productId: "DEMO-RICE", quantity: 11 }],
    });
    expect(
      (await call(m, `/orders/${before.id}`)).run.plan_version,
    ).toBeGreaterThan(before.run.plan_version);
    for (const o of created) {
      await assigned(l, "Assigned load", o.id);
      await expect(
        l.getByLabel("Loaded Rice cartons quantity", { exact: true }),
      ).toHaveValue(String(o.id === created[0].id ? 11 : 4));
      await l
        .getByRole("button", {
          name: "Acknowledge plan & save loading check",
          exact: true,
        })
        .click();
      await l
        .getByRole("button", { name: "Release load to driver", exact: true })
        .click();
    }
    await assigned(v, "Assigned stop", created[0].id);
    await v
      .getByRole("button", {
        name: "Acknowledge plan & start journey",
        exact: true,
      })
      .click();
    await v.getByText("Demo location simulator", { exact: true }).click();
    await v
      .getByRole("button", {
        name: "Send labelled judge position",
        exact: true,
      })
      .click();
    await expect(
      v.getByText("SIMULATED judge waypoint accepted", { exact: true }).first(),
    ).toBeVisible();
    await v
      .getByLabel("Message", { exact: true })
      .fill(
        "Receiving access is busy; waiting safely near the configured waypoint.",
      );
    await v
      .getByRole("button", { name: "Send issue message", exact: true })
      .click();
    await d.getByRole("button", { name: "Live control", exact: true }).click();
    await expect(
      d.getByText(/60 source vehicles · 120 source outlets/),
    ).toBeVisible();
    await d.getByRole("button").filter({ hasText: "VEH037" }).click();
    await expect(
      d.getByText(
        "Receiving access is busy; waiting safely near the configured waypoint.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(d.getByText(/SIMULATED/).first()).toBeVisible();
    await expect(
      d.getByRole("status").filter({ hasText: "Updates: Live" }),
    ).toBeVisible();
    for (const o of created) {
      await v.getByRole("button", { name: "Journey", exact: true }).click();
      await assigned(v, "Assigned stop", o.id);
      await v
        .getByRole("button", {
          name: "Confirm arrival · safely stopped",
          exact: true,
        })
        .click();
      await proof(v);
      await expect(
        v.getByText(`${o.reference} · Accepted by server`, { exact: true }),
      ).toBeVisible();
      await store(m, o.outlet_id, o.reference);
      await m
        .getByRole("button", { name: "Confirm received", exact: true })
        .click();
      await expect
        .poll(async () => (await call(m, `/orders/${o.id}`)).status)
        .toBe("RECEIVED_AT_STORE");
    }
    const draft = await call(m, "/drafts", {
      expectedVersion: 0,
      outletId: "OUT001",
      day,
      items: [{ productId: "DEMO-RICE", quantity: 10000 }],
    });
    let excess = await call(m, `/drafts/${draft.id}/submit`, {
      expectedVersion: draft.version,
    });
    excess = await call(d, `/orders/${excess.id}/commands`, {
      commandId: crypto.randomUUID(),
      expectedVersion: excess.version,
      operation: "CONFIRM",
      reason: "Whole-order excess demand reviewed",
    });
    const proposed = await call(d, "/planning/propose", {
      day,
      orderIds: [excess.id],
    });
    expect(proposed.plan.trips).toHaveLength(0);
    expect(proposed.plan.deferred).toHaveLength(1);
    await call(d, "/planning/publish", proposed.plan);
    const deferred = await call(d, `/orders/${excess.id}`);
    await call(d, `/orders/${excess.id}/commands`, {
      commandId: crypto.randomUUID(),
      expectedVersion: deferred.version,
      operation: "RESCHEDULE",
      reason: "Retain stock demand for a later reviewed allocation",
      day: rescheduleDay,
    });
    expect((await call(d, `/orders/${excess.id}`)).rescheduledTo).toHaveLength(
      1,
    );
    await noOverflow(d);
  } finally {
    for (const c of contexts) await c.close();
  }
});

test("public regression fixture retains offline proof and resolves a same-stop conflict", async ({
  browser,
}) => {
  test.skip(
    process.env.PUBLIC_CI_FIXTURES !== "true",
    "Enable PUBLIC_CI_FIXTURES only against an isolated public-fixture database",
  );
  const { contexts, pages } = await roles(browser);
  const [m, d, l, v] = pages;
  try {
    const day = "2026-10-10";
    let order = await call(m, "/orders", {
      outletId: "DEMO-FRESH",
      day,
      items: [{ productId: "DEMO-RICE", quantity: 4 }],
    });
    order = await call(d, `/orders/${order.id}/publish`, {
      expectedVersion: order.version,
      vehicleId: "DEMO-VAN",
      loaderId: "DEMO-LOADER",
      trip: 1,
      departureAt: `${day}T00:00:00Z`,
      returnAt: `${day}T02:00:00Z`,
      estimatedFuelL: 5,
      reason:
        "Public CI regression fixture; no operational road feasibility claim",
    });
    order = await call(l, `/orders/${order.id}/loading`, {
      expectedVersion: order.version,
      lines: [{ lineId: order.lines[0].id, quantity: 4 }],
      reason: "NONE",
    });
    order = await call(l, `/orders/${order.id}/release`, {
      expectedVersion: order.version,
    });
    order = await call(v, `/orders/${order.id}/start`, {
      expectedVersion: order.version,
    });
    order = await call(v, `/orders/${order.id}/arrive`, {
      expectedVersion: order.version,
    });
    await v.reload();
    await assigned(v, "Assigned stop", order.id);
    await expect(v.getByLabel("Delivery photo", { exact: true })).toBeVisible();
    await v.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await v.reload();
    await assigned(v, "Assigned stop", order.id);
    await expect(v.getByLabel("Delivery photo", { exact: true })).toBeVisible();
    await contexts[3].setOffline(true);
    await v.reload();
    await assigned(v, "Assigned stop", order.id);
    await proof(v);
    await v.reload();
    await v.getByRole("button", { name: "Sync", exact: true }).click();
    await expect(
      v.getByText(`${order.reference} · Saved on device · pending sync`, {
        exact: true,
      }),
    ).toBeVisible();
    await call(d, `/orders/${order.id}/defer`, {
      expectedVersion: order.version,
      nextDay: "2026-10-12",
      reason:
        "CI same-stop conflict while physical proof remains on the device",
    });
    await contexts[3].setOffline(false);
    await expect(
      v.getByText(`${order.reference} · Conflict needs review`, {
        exact: true,
      }),
    ).toBeVisible();
    const conflict = (await call(d, "/sync-conflicts")).find(
      (c: any) => c.order_id === order.id,
    );
    expect(conflict).toBeTruthy();
    await d.getByRole("button", { name: "History", exact: true }).click();
    await d
      .getByLabel("Resolution reason")
      .fill("CI verified retained evidence; preserve deferral history");
    await d
      .getByRole("button", { name: "Accept verified delivery", exact: true })
      .click();
    await v.getByRole("button", { name: "Retry sync", exact: true }).click();
    await expect(
      v.getByText(`${order.reference} · Accepted by server`, { exact: true }),
    ).toBeVisible();
    await store(m, order.outlet_id, order.reference);
    await m
      .getByRole("button", { name: "Confirm received", exact: true })
      .click();
    await expect
      .poll(async () => (await call(m, `/orders/${order.id}`)).status)
      .toBe("RECEIVED_AT_STORE");
    expect((await call(m, `/orders/${order.id}`)).deferrals).toHaveLength(1);
    await noOverflow(v);
  } finally {
    for (const c of contexts) await c.close();
  }
});

test("Style schedule, protected Tech receipt, night mode and cross-tab account isolation", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const { contexts, pages } = await roles(browser);
  const [m, d, l, v] = pages;
  try {
    await m.getByLabel("Outlet", { exact: true }).selectOption("DEMO-STYLE");
    await m.getByRole("button", { name: "New order", exact: true }).click();
    await m.getByLabel("Requested operating day").selectOption("2026-10-07");
    await m
      .getByLabel("Hanging garment cartons quantity", { exact: true })
      .fill("3");
    await m.getByRole("button", { name: "Review order", exact: true }).click();
    const submission = m.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/api\/v1\/drafts\/[^/]+\/submit$/.test(
          new URL(response.url()).pathname,
        ) &&
        response.status() === 200,
    );
    await m
      .getByRole("button", { name: "Submit reviewed order", exact: true })
      .click();
    await expect(m.getByText(/submitted for 2026-10-12/)).toBeVisible();
    const submitted = await (await submission).json();
    await store(m, "DEMO-STYLE", submitted.reference);
    await expect(
      m.getByRole("heading", { name: "Mall access", exact: true }),
    ).toBeVisible();
    await m
      .getByRole("button", { name: "Use night theme", exact: true })
      .click();
    await expect(m.locator("html")).toHaveAttribute("data-theme", "night");
    await noOverflow(m);
    // Retain the original supplementary Tech workflow regression via its legacy API.
    let o = await call(m, "/orders", {
      outletId: "DEMO-TECH",
      day: "2026-10-09",
      items: [{ productId: "DEMO-TV", quantity: 2 }],
    });
    o = await call(d, `/orders/${o.id}/publish`, {
      expectedVersion: o.version,
      vehicleId: "DEMO-DRY",
      loaderId: "DEMO-LOADER",
      trip: 1,
      departureAt: "2026-10-09T03:30:00Z",
      returnAt: "2026-10-09T05:30:00Z",
      estimatedFuelL: 10,
      reason:
        "Legacy protected receiving regression; no road feasibility claim",
    });
    o = await call(l, `/orders/${o.id}/loading`, {
      expectedVersion: o.version,
      lines: [{ lineId: o.lines[0].id, quantity: 2 }],
      reason: "NONE",
    });
    o = await call(l, `/orders/${o.id}/release`, {
      expectedVersion: o.version,
    });
    o = await call(v, `/orders/${o.id}/start`, { expectedVersion: o.version });
    await call(v, `/orders/${o.id}/arrive`, { expectedVersion: o.version });
    await v.reload();
    await assigned(v, "Assigned stop", o.id);
    await proof(v);
    await expect(
      v.getByText(`${o.reference} · Accepted by server`, { exact: true }),
    ).toBeVisible();
    await store(m, o.outlet_id, o.reference);
    await m.getByLabel("Receiving issue").selectOption("Damaged packaging");
    await m
      .getByRole("button", { name: "Confirm received", exact: true })
      .click();
    await expect
      .poll(async () => (await call(m, `/orders/${o.id}`)).receipt?.issue)
      .toBe("Damaged packaging");
    const peer = await contexts[3].newPage();
    await peer.goto("/");
    await expect(
      peer.getByRole("button", { name: "Sync", exact: true }),
    ).toBeVisible();
    await v.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      peer.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await v.getByLabel("Username", { exact: true }).fill("manager");
    await v
      .getByLabel("Password", { exact: true })
      .fill(process.env.JUDGE_PASSWORD || "WaypointDemo!2026");
    await v.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      peer.getByRole("button", { name: "New order", exact: true }),
    ).toBeVisible();
    await expect(
      v.getByRole("heading", { name: "Proof on this device", exact: true }),
    ).toHaveCount(0);
  } finally {
    for (const c of contexts) await c.close();
  }
});
