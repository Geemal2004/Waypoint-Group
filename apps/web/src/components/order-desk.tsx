import { useState } from "react";
import type { Catalog, Order } from "../lib/models";
import { Button } from "./ui/button";
import { IssueConversation } from "./live-operations";
import { Timeline, statusLabel } from "./operations";
type Action = (path: string, body: unknown) => Promise<boolean>;
export function OrderDesk({
  orders,
  day,
  catalog,
  deferred = false,
  action,
  busy,
}: {
  orders: Order[];
  day: string;
  catalog: Catalog;
  deferred?: boolean;
  action: Action;
  busy: boolean;
}) {
  const [search, setSearch] = useState(""),
    [brand, setBrand] = useState(""),
    [status, setStatus] = useState(""),
    [selected, setSelected] = useState(""),
    [reason, setReason] = useState(""),
    [nextDay, setNextDay] = useState("");
  const rows = orders.filter(
    (o) =>
      o.day === day &&
      (!deferred || o.status === "DEFERRED") &&
      (!brand || o.brand_code === brand) &&
      (!status || o.status === status) &&
      `${o.reference} ${o.source_ref} ${o.outlet_name} ${o.outlet_id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const order = orders.find((o) => o.id === selected);
  const command = (operation: string) =>
    action(`/orders/${selected}/commands`, {
      commandId: crypto.randomUUID(),
      expectedVersion: order!.version,
      operation,
      reason,
      day: nextDay || null,
    });
  return (
    <>
      <div className="page-heading design-heading">
        <p className="eyebrow">
          Operations / {deferred ? "deferred demand" : "orders and cutoff"}
        </p>
        <h1>
          {deferred
            ? "Give deferred orders a next step"
            : "Review store orders before allocation"}
        </h1>
        <p>
          {day} service · {rows.length} orders · 16:00 Colombo submission cutoff
        </p>
      </div>
      <section className="panel filter-bar">
        <label>
          Search orders
          <input
            placeholder="Order reference or outlet"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Brand
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">All brands</option>
            {["FRESH", "STYLE", "TECH"].map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        {!deferred && (
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All states</option>
              {[
                "RECEIVED",
                "SCHEDULED",
                "LOADING",
                "RELEASED",
                "IN_TRANSIT",
                "ARRIVED",
                "DELIVERED",
                "RECEIVED_AT_STORE",
                "DEFERRED",
                "CANCELLED",
              ].map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      <div className="order-desk">
        <section className="panel table-scroll">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order / outlet</th>
                <th>Load</th>
                <th>Physical demand</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr className={o.id === selected ? "selected" : ""} key={o.id}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelected(o.id);
                        setReason("");
                        setNextDay(o.deferrals.at(-1)?.next_day || "");
                      }}
                    >
                      {o.source_ref || o.reference || o.outlet_id}
                    </button>
                    <p>{o.outlet_name}</p>
                  </td>
                  <td>
                    {o.temperature === "AMBIENT"
                      ? "Dry"
                      : o.temperature.toLowerCase()}
                  </td>
                  <td>
                    {o.lines
                      .reduce((n, l) => n + l.ordered * Number(l.weight_kg), 0)
                      .toFixed(1)}{" "}
                    kg
                    <br />
                    {o.lines
                      .reduce((n, l) => n + l.ordered * Number(l.volume_m3), 0)
                      .toFixed(2)}{" "}
                    m³
                  </td>
                  <td>
                    <span className="badge">
                      {o.status === "RECEIVED" &&
                      o.confirmation_required &&
                      !o.confirmed_at
                        ? "Submitted · review required"
                        : o.status === "RECEIVED"
                          ? "Confirmed"
                          : statusLabel(o.status)}
                    </span>
                    {o.status === "DEFERRED" && (
                      <p>
                        {o.deferrals.at(-1)?.consecutive_skips || 0} consecutive
                        skips
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p>No orders match these filters on this operating day.</p>
          )}
        </section>
        <section className="panel">
          {order ? (
            <>
              <h2>{order.outlet_name}</h2>
              <p>
                {order.source_ref || order.reference} · revision {order.version}
              </p>
              <p>
                Receiving {order.window_start.slice(0, 5)}–
                {order.window_end.slice(0, 5)} ·{" "}
                {order.access === "VAN_ONLY"
                  ? "Van only"
                  : "Truck or van access"}
              </p>
              {order.lines.map((l) => (
                <p key={l.id}>
                  {l.name}: {l.ordered} {l.unit || "units"} ordered
                  {l.loaded != null ? `, ${l.loaded} loaded` : ""}
                </p>
              ))}
              {order.deferrals.map((d, i) => (
                <article className="notice warning" key={i}>
                  <p>{d.reason}</p>
                  <p>
                    Next eligible {d.next_day} · {d.consecutive_skips}{" "}
                    consecutive skips
                  </p>
                </article>
              ))}
              {(order.status === "DEFERRED" ||
                order.status === "RECEIVED" ||
                order.status === "LOADING") && (
                <label>
                  Decision reason
                  <textarea
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Record the review or next action"
                  />
                </label>
              )}
              {order.status === "RECEIVED" &&
                order.confirmation_required &&
                !order.confirmed_at && (
                  <Button
                    disabled={busy || !reason.trim() || !navigator.onLine}
                    onClick={() => command("CONFIRM")}
                  >
                    Confirm reviewed order
                  </Button>
                )}
              {order.status === "LOADING" &&
                order.loadingIssues.length > 0 &&
                !order.run?.partial_approved_by && (
                  <>
                    <p className="notice warning">
                      Loading hold:{" "}
                      {order.loadingIssues.reduce(
                        (n, i) => n + Number(i.quantity),
                        0,
                      )}{" "}
                      units missing or damaged.
                    </p>
                    <Button
                      disabled={busy || !reason.trim() || !navigator.onLine}
                      onClick={() =>
                        action(`/orders/${order.id}/approve-partial`, {
                          expectedVersion: order.version,
                          reason,
                        })
                      }
                    >
                      Approve reduced load
                    </Button>
                  </>
                )}
              {[
                "RECEIVED",
                "SCHEDULED",
                "LOADING",
                "IN_TRANSIT",
                "ARRIVED",
              ].includes(order.status) && (
                <details>
                  <summary>Record a delivery deferral</summary>
                  {["SCHEDULED", "IN_TRANSIT", "ARRIVED"].includes(
                    order.status,
                  ) && (
                    <label>
                      Deferral reason
                      <textarea
                        maxLength={500}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                  )}
                  <label>
                    Next eligible day
                    <select
                      value={nextDay}
                      onChange={(e) => setNextDay(e.target.value)}
                    >
                      <option value="">Choose operating day</option>
                      {catalog.operatingDays
                        .filter(
                          (d) => d.day > order.day && d.demo === order.demo,
                        )
                        .map((d) => (
                          <option key={d.day}>{d.day}</option>
                        ))}
                    </select>
                  </label>
                  <Button
                    variant="outline"
                    disabled={
                      busy || !reason.trim() || !nextDay || !navigator.onLine
                    }
                    onClick={() =>
                      action(`/orders/${order.id}/defer`, {
                        expectedVersion: order.version,
                        reason,
                        nextDay,
                      })
                    }
                  >
                    Record deferral
                  </Button>
                </details>
              )}
              {order.status === "DEFERRED" &&
                (order.rescheduledTo?.length ? (
                  <p className="notice success">
                    Replacement {order.rescheduledTo[0].reference} scheduled for{" "}
                    {order.rescheduledTo[0].day}. Original evidence is retained.
                  </p>
                ) : (
                  <>
                    <label>
                      Next operating day
                      <select
                        value={nextDay}
                        onChange={(e) => setNextDay(e.target.value)}
                      >
                        <option value="">Choose a later eligible day</option>
                        {catalog.operatingDays
                          .filter((d) => d.day > order.day)
                          .map((d) => (
                            <option key={d.day}>{d.day}</option>
                          ))}
                      </select>
                    </label>
                    <Button
                      disabled={
                        busy || !reason.trim() || !nextDay || !navigator.onLine
                      }
                      onClick={() => command("RESCHEDULE")}
                    >
                      Create linked replacement order
                    </Button>
                  </>
                ))}
              <IssueConversation orderId={order.id} />
              <details>
                <summary>Delivery history and technical identifiers</summary>
                <p>
                  Order {order.id} · plan {order.run?.plan_id || "unallocated"}
                </p>
                <Timeline order={order} />
              </details>
            </>
          ) : (
            <>
              <h2>Select an order</h2>
              <p>
                {deferred
                  ? "Review the recorded constraint, skip history and next eligible date."
                  : "Review physical requirements, confirm submitted requests and resolve loading holds."}
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
