import {
  test,
  expect,
  type Page,
  type Browser,
  type Route,
} from "@playwright/test";
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
  await expect(
    board.getByRole("region", { name: "Publication review" }),
  ).toBeVisible();
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
      // Maximum-length reviewed reasons remain valid during automatic republication.
      reason: "One additional carton reviewed before loading".padEnd(500, "."),
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
    // A real server-side arrival increments the stop version before any form edit.
    await v.reload();
    await assigned(v, "Assigned stop", order.id);
    await expect(v.getByLabel("Delivery photo", { exact: true })).toHaveCount(
      0,
    );
    const beforeArrival = order.version;
    order = await call(v, `/orders/${order.id}/arrive`, {
      expectedVersion: order.version,
    });
    expect(order.version).toBeGreaterThan(beforeArrival);
    await expect(
      v.getByLabel("Delivered Rice cartons quantity", { exact: true }),
    ).toBeEnabled();
    await expect(
      v.getByLabel("Delivered Rice cartons quantity", { exact: true }),
    ).toHaveValue("4");
    await expect(
      v.getByText(/The stop changed since this draft was recorded/),
    ).toHaveCount(0);
    await expect(v.getByLabel("Delivery photo", { exact: true })).toBeVisible();
    await v.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    const driverAccount = await v.evaluate(() =>
      localStorage.getItem("waypoint-active-account"),
    );
    await v.addInitScript(() => {
      const get = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function (key) {
        const request = get.call(this, key);
        if (
          this.name === "proofDrafts" &&
          !localStorage.getItem("waypoint-account-guard-tested")
        ) {
          request.addEventListener(
            "success",
            () => {
              localStorage.setItem("waypoint-account-guard-tested", "true");
              localStorage.setItem(
                "waypoint-active-account",
                "changed-during-draft-open",
              );
            },
            { once: true },
          );
        }
        return request;
      };
    });
    await v.reload();
    await expect(
      v.getByText(
        "Account changed. Reopen this workspace with the same driver. Your local evidence is retained.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      v.getByText("Opening your local proof draft…", { exact: true }),
    ).toHaveCount(0);
    await v.evaluate(
      (id) => localStorage.setItem("waypoint-active-account", id!),
      driverAccount,
    );
    await v.reload();
    await assigned(v, "Assigned stop", order.id);
    await expect(v.getByLabel("Delivery photo", { exact: true })).toBeVisible();
    // No server command changes an arrived order's version, so the poll simulates one.
    const ordersList = (url: URL) => url.pathname === "/api/v1/orders";
    const bumpVersion = async (route: Route) => {
      const response = await route.fetch();
      const json = (await response.json()).map((o: any) =>
        o.id === order.id
          ? {
              ...o,
              version: o.version + 1,
              lines: o.lines.map((l: any) => ({ ...l, name: "Probe cartons" })),
            }
          : o,
      );
      await route.fulfill({ response, json });
    };
    await contexts[3].route(ordersList, bumpVersion);
    const probe = v.getByLabel("Delivered Probe cartons quantity", {
      exact: true,
    });
    await expect(probe).toBeEnabled();
    await expect(probe).toHaveValue("4");
    await expect(
      v.getByText(/The stop changed since this draft was recorded/),
    ).toHaveCount(0);
    await expect(
      v.getByRole("button", { name: "Discard local draft", exact: true }),
    ).toHaveCount(0);
    await contexts[3].unroute(ordersList, bumpVersion);
    await expect(
      v.getByLabel("Delivered Rice cartons quantity", { exact: true }),
    ).toBeEnabled();
    await contexts[3].setOffline(true);
    await v.reload();
    await assigned(v, "Assigned stop", order.id);
    await v
      .getByLabel("Delivered Rice cartons quantity", { exact: true })
      .fill("3");
    await v
      .getByLabel("Delivery issue", { exact: true })
      .selectOption("Short at delivery");
    await v.getByLabel("Delivery photo", { exact: true }).setInputFiles({
      name: "draft-proof.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(
      v.getByText("Draft saved on this device · not submitted", {
        exact: true,
      }),
    ).toBeVisible();
    // Emulate a retained draft from an older stop version; never rebase it silently.
    await v.evaluate(async () => {
      const request = indexedDB.open("waypoint-offline");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction("proofDrafts", "readwrite");
      const all = tx.objectStore("proofDrafts").getAll();
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        all.onsuccess = () => {
          const kept = all.result[0];
          tx.objectStore("proofDrafts").put({
            ...kept,
            expectedVersion: kept.expectedVersion - 1,
          });
        };
      });
      db.close();
    });
    await v.reload();
    await assigned(v, "Assigned stop", order.id);
    await expect(
      v.getByText(/The stop changed since this draft was recorded/),
    ).toBeVisible();
    await expect(
      v.getByRole("button", { name: "Save proof on this device", exact: true }),
    ).toBeDisabled();
    await expect(
      v.getByAltText("Selected delivery evidence preview"),
    ).toBeVisible();
    const recover = v.getByRole("button", {
      name: "Keep evidence and use reviewed load",
      exact: true,
    });
    await expect(recover).toBeDisabled();
    await v
      .getByRole("checkbox", {
        name: "I reviewed the retained quantities and photo against the current released load",
        exact: true,
      })
      .check();
    await recover.click();
    await expect(
      v.getByText("Draft saved on this device · not submitted", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      v.getByLabel("Delivered Rice cartons quantity", { exact: true }),
    ).toHaveValue("3");
    await expect(
      v.getByAltText("Selected delivery evidence preview"),
    ).toBeVisible();
    const reviewed = await v.evaluate(async () => {
      const request = indexedDB.open("waypoint-offline");
      const db = await new Promise<IDBDatabase>((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
      const read = db
        .transaction("proofDrafts")
        .objectStore("proofDrafts")
        .getAll();
      const drafts = await new Promise<any[]>((resolve) => {
        read.onsuccess = () => resolve(read.result);
      });
      const kept = drafts[0];
      const bytes = Array.from(new Uint8Array(await kept.photo.arrayBuffer()));
      db.close();
      return {
        bytes,
        name: kept.photoName,
        issue: kept.issue,
        version: kept.expectedVersion,
      };
    });
    expect(reviewed).toEqual({
      bytes: Array.from(png),
      name: "draft-proof.png",
      issue: "Short at delivery",
      version: order.version,
    });
    await expect(
      v.getByText("Draft saved on this device · not submitted", {
        exact: true,
      }),
    ).toBeVisible();
    await v.reload();
    await assigned(v, "Assigned stop", order.id);
    await expect(
      v.getByLabel("Delivered Rice cartons quantity", { exact: true }),
    ).toHaveValue("3");
    await expect(v.getByLabel("Delivery issue", { exact: true })).toHaveValue(
      "Short at delivery",
    );
    await expect(
      v.getByAltText("Selected delivery evidence preview"),
    ).toBeVisible();
    await v.getByRole("button", { name: "Sync", exact: true }).click();
    await expect(
      v.getByText("No proof saved on this device yet."),
    ).toBeVisible();
    await v.getByRole("button", { name: "Stop proof", exact: true }).click();
    await expect(
      v.getByAltText("Selected delivery evidence preview"),
    ).toBeVisible();
    // A real server deferral changes an unsent draft's stop before final save.
    await call(d, `/orders/${order.id}/defer`, {
      expectedVersion: order.version,
      nextDay: "2026-10-12",
      reason:
        "CI same-stop deferral while unsent physical evidence remains on the device",
    });
    await contexts[3].setOffline(false);
    await v.getByRole("button", { name: "Sync", exact: true }).click();
    const retainedDraft = v.getByRole("region", {
      name: "Retained draft for deferred stop",
    });
    await expect(retainedDraft).toBeVisible();
    await expect(
      retainedDraft.getByAltText("Retained draft evidence preview"),
    ).toBeVisible();
    await expect(retainedDraft).toContainText("Short at delivery");
    await contexts[3].setOffline(true);
    await retainedDraft
      .getByRole("button", {
        name: "Save retained draft for dispatcher review",
        exact: true,
      })
      .click();
    await v.reload();
    await v.getByRole("button", { name: "Sync", exact: true }).click();
    await expect(
      v.getByText(`${order.reference} · Saved on device · pending sync`, {
        exact: true,
      }),
    ).toBeVisible();
    const localState = await v.evaluate(async () => {
      const request = indexedDB.open("waypoint-offline");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction(
        ["proofDrafts", "outbox", "attachments"],
        "readonly",
      );
      const retained = Promise.all(
        ["outbox", "attachments"].map(
          (name) =>
            new Promise<any[]>((resolve, reject) => {
              const read = tx.objectStore(name).getAll();
              read.onsuccess = () => resolve(read.result);
              read.onerror = () => reject(read.error);
            }),
        ),
      );
      const counts = await Promise.all(
        ["proofDrafts", "outbox", "attachments"].map(
          (name) =>
            new Promise<number>((resolve, reject) => {
              const count = tx.objectStore(name).count();
              count.onsuccess = () => resolve(count.result);
              count.onerror = () => reject(count.error);
            }),
        ),
      );
      const [actions, attachments] = await retained;
      db.close();
      return {
        counts,
        version: actions[0].expectedVersion,
        lines: actions[0].payload.lines,
        issue: actions[0].payload.issue,
        bytes: Array.from(
          new Uint8Array(await attachments[0].blob.arrayBuffer()),
        ),
      };
    });
    expect(localState).toEqual({
      counts: [0, 1, 1],
      version: order.version,
      lines: [{ lineId: order.lines[0].id, quantity: 3 }],
      issue: "Short at delivery",
      bytes: Array.from(png),
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
    expect((await call(m, `/orders/${order.id}`)).lines[0].received).toBe(3);
    await noOverflow(v);
  } finally {
    for (const c of contexts) await c.close();
  }
});

test("offline database upgrade preserves earlier proof actions and attachments", async ({
  browser,
  baseURL,
}) => {
  test.skip(
    process.env.PUBLIC_CI_FIXTURES !== "true",
    "Isolated public-fixture acceptance only",
  );
  const context = await browser.newContext();
  const p = await context.newPage();
  try {
    const root = new URL("/", baseURL).href;
    await p.route(root, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Storage upgrade fixture</title>",
      }),
    );
    await p.goto(root);
    await p.evaluate(async () => {
      // Dexie schema version 2 maps to native IndexedDB version 20.
      const request = indexedDB.open("waypoint-offline", 20);
      request.onupgradeneeded = () => {
        const db = request.result;
        const outbox = db.createObjectStore("outbox", { keyPath: "actionId" });
        for (const name of ["accountId", "entityId", "capturedAt"])
          outbox.createIndex(name, name);
        outbox.createIndex("[accountId+syncState]", ["accountId", "syncState"]);
        const attachments = db.createObjectStore("attachments", {
          keyPath: "id",
        });
        for (const name of ["accountId", "actionId"])
          attachments.createIndex(name, name);
        db.createObjectStore("cache", { keyPath: "key" }).createIndex(
          "accountId",
          "accountId",
        );
        outbox.add({
          actionId: "v2-retained-proof",
          accountId: "DEMO-DRIVER",
          actionType: "DELIVERY_PROOF",
          entityId: "v2-fixture-stop",
          expectedVersion: 1,
          payload: {},
          capturedAt: "2026-10-04T00:00:00Z",
          syncState: "rejected",
          retryCount: 0,
          message: "Earlier evidence retained through storage upgrade",
        });
        attachments.add({
          id: "v2-retained-proof",
          actionId: "v2-retained-proof",
          accountId: "DEMO-DRIVER",
          blob: new Blob(["v2-proof-bytes"], { type: "image/png" }),
        });
      };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
    });
    await p.unroute(root);
    await login(p, "driver");
    await p.getByRole("button", { name: "Sync", exact: true }).click();
    await expect(
      p.getByText("Earlier evidence retained through storage upgrade", {
        exact: true,
      }),
    ).toBeVisible();
    const retained = await p.evaluate(async () => {
      const request = indexedDB.open("waypoint-offline");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction("attachments", "readonly");
      const read = tx.objectStore("attachments").get("v2-retained-proof");
      const attachment = await new Promise<any>((resolve, reject) => {
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
      const result = {
        version: db.version,
        draftStore: db.objectStoreNames.contains("proofDrafts"),
        bytes: await attachment.blob.text(),
      };
      db.close();
      return result;
    });
    expect(retained).toEqual({
      version: 30,
      draftStore: true,
      bytes: "v2-proof-bytes",
    });
  } finally {
    await context.close();
  }
});

test("publication review follows validation and disappears after a draft edit", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const p = await context.newPage();
  let published: any;
  try {
    // UI contract fixtures only: real road/constraint validation is covered by integration tests.
    await p.route("**/api/v1/planning?*", (route) =>
      route.fulfill({
        json: {
          version: 0,
          trips: [],
          coordinatePolicy: "UI test fixture",
          vehicles: [
            {
              id: "DEMO-VAN",
              weight_kg: 300,
              volume_m3: 3,
              kind: "VAN",
              refrigerated: false,
            },
          ],
          orders: ["A", "B"].map((ref) => ({
            id: `fixture-${ref}`,
            reference: `CI-${ref}`,
            source_ref: "",
            outlet_name: `CI outlet ${ref}`,
            brand_code: "FRESH",
            district: "Colombo",
            temperature: "AMBIENT",
            status: "RECEIVED",
            version: 0,
            weight_kg: 80,
            volume_m3: 0.16,
            service_minutes: 15,
            window_start: "05:00",
            window_end: "08:00",
            consecutive_skips: 0,
            days_since_last_served: 1,
          })),
        },
      }),
    );
    await p.route("**/api/v1/planning/validate", (route) =>
      route.fulfill({
        json: {
          valid: true,
          failures: [],
          trips: [
            {
              vehicleId: "DEMO-VAN",
              trip: 1,
              weightKg: 160,
              volumeM3: 0.32,
              capacityKg: 300,
              capacityM3: 3,
              distanceKm: 10,
              fuelL: 2.5,
              returnAt: "2026-01-08T06:00:00+05:30",
              bookletMinutes: 140,
              geometry: {
                type: "LineString",
                coordinates: [
                  [79.865, 6.94],
                  [79.868, 6.95],
                ],
              },
              stops: ["A", "B"].map((ref, i) => ({
                orderId: `fixture-${ref}`,
                sequence: i + 1,
                loadingSequence: 2 - i,
                arrivalAt: "2026-01-08T05:00:00+05:30",
                serviceStart: "2026-01-08T05:00:00+05:30",
                serviceEnd: "2026-01-08T05:15:00+05:30",
              })),
            },
          ].flatMap((metric) => [
            { ...metric, vehicleId: "DEMO-OTHER", fuelL: 7.25 },
            { ...metric, trip: 2, fuelL: 9.75 },
            metric,
          ]),
        },
      }),
    );
    await p.route("**/api/v1/planning/publish", (route) => {
      published = route.request().postDataJSON();
      return route.fulfill({ json: { version: 1 } });
    });
    await login(p, "dispatcher");
    const board = p.getByRole("region", {
      name: "Dataset multi-stop planning",
    });
    for (const ref of ["A", "B"])
      await board.getByLabel(`Select CI-${ref}`, { exact: true }).check();
    await board
      .getByRole("button", { name: "Assign selected manually", exact: true })
      .click();
    await board.getByLabel("Vehicle", { exact: true }).selectOption("DEMO-VAN");
    const publish = board.getByRole("button", {
      name: "Publish validated plan",
      exact: true,
    });
    await expect(publish).toBeDisabled();
    await board
      .getByRole("button", { name: "Validate road routes", exact: true })
      .click();
    const review = board.getByRole("region", { name: "Publication review" });
    await expect(review).toContainText("2 assigned orders");
    await expect(review).toContainText("2.50 L");
    await expect(board.getByText("2.50 L fuel", { exact: true })).toBeVisible();
    await expect(review).not.toContainText("7.25 L");
    await expect(review).not.toContainText("9.75 L");
    await expect(review).toContainText("CI-A");
    await expect(review).toContainText("CI-B");
    await board
      .getByLabel("Publication reason", { exact: true })
      .fill("Reviewed quantities and handoff order");
    await expect(review).toHaveCount(0);
    await expect(publish).toBeDisabled();
    expect(published).toBeUndefined();
    await board.getByLabel("Publication reason", { exact: true }).fill("   ");
    await board
      .getByRole("button", { name: "Validate road routes", exact: true })
      .click();
    await expect(publish).toBeDisabled();
    await expect(
      board.getByText("Enter a publication reason of 1–500 characters.", {
        exact: true,
      }),
    ).toBeVisible();
    await board
      .getByLabel("Publication reason", { exact: true })
      .fill("Reviewed quantities and handoff order");
    await board
      .getByRole("button", { name: "Validate road routes", exact: true })
      .click();
    await expect(review).toBeVisible();
    await publish.click();
    await expect
      .poll(() => published?.trips[0]?.stops.map((s: any) => s.orderId))
      .toEqual(["fixture-A", "fixture-B"]);
    await expect(review).toHaveCount(0);
  } finally {
    await context.close();
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
