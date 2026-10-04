import { useEffect, useState, type ReactNode } from "react";
import {
  Package,
  Minus,
  Plus,
  Check,
  Camera,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "./ui/button";
import { api } from "../lib/api";
import type { Account, Catalog, Order, Vehicle, Conflict } from "../lib/models";
import { offlineDb, type OutboxAction } from "../lib/offline-db";
import { saveProof, syncProofs } from "../lib/sync";
import { useProofDraft } from "../lib/proof-draft";
import { PlanningBoard } from "./planning-workspace";
import {
  NetworkScreen,
  DriverJourney,
  IssueConversation,
} from "./live-operations";
import { OrderDesk } from "./order-desk";
import { Administration } from "./administration";
import { OperationsHistory } from "./operations-history";

export const statusLabel = (value: string) =>
  ({
    RECEIVED: "Confirmed",
    SCHEDULED: "Scheduled",
    LOADING: "Loading",
    RELEASED: "Released",
    IN_TRANSIT: "On the way",
    ARRIVED: "Arrived",
    DELIVERED: "Receipt required",
    RECEIVED_AT_STORE: "Receipt confirmed",
    DEFERRED: "Deferred",
    CANCELLED: "Cancelled",
  })[value] || value;
export const brandLabel = (value: string) =>
  ({ FRESH: "Fresh", STYLE: "Style", TECH: "Tech" })[value] || value;
function TripManifest({
  order,
  loading = false,
}: {
  order: Order;
  loading?: boolean;
}) {
  if (!order.run?.route_trip_id) return null;
  const stops = [...(order.tripStops || [])].sort((a, b) =>
    loading ? a.loading_sequence - b.loading_sequence : a.sequence - b.sequence,
  );
  return (
    <div className="notice info">
      <p>
        {order.run.vehicle_id} · run {order.run.trip} · plan v
        {order.run.plan_version}
      </p>
      <p>
        {loading
          ? "Load in reverse delivery order"
          : "Follow the published stop order"}
      </p>
      <ol>
        {stops.map((s) => (
          <li key={s.stop_id}>
            {s.outlet_name || s.outlet_id} · stop {s.sequence} · load{" "}
            {s.loading_sequence} · {statusLabel(s.status)} ·{" "}
            {s.order_id === order.id
              ? "selected order"
              : s.source_ref || s.reference || s.outlet_id}
          </li>
        ))}
      </ol>
    </div>
  );
}
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={"panel " + className}>{children}</section>;
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "success" | "critical";
}) {
  return <div className={"notice " + tone}>{children}</div>;
}
export function Counter({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="counter">
      <button
        aria-label={"Decrease " + label}
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={18} />
      </button>
      <input
        aria-label={label + " quantity"}
        type="number"
        min="0"
        max={max}
        value={value}
        onChange={(e) =>
          onChange(
            Math.max(0, Math.min(max, Math.trunc(Number(e.target.value) || 0))),
          )
        }
      />
      <button
        aria-label={"Increase " + label}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={18} />
      </button>
    </div>
  );
}
export function Timeline({ order }: { order: Order }) {
  return (
    <Panel>
      <h3>{order.outlet_name}</h3>
      <span className={"badge status-" + order.status}>
        {statusLabel(order.status)}
      </span>
      <ol className="timeline">
        {order.timeline.map((e, i) => (
          <li key={i}>
            <Check size={13} />
            <div>
              <strong>{e.event.replaceAll("_", " ").toLowerCase()}</strong>
              <p>{e.details}</p>
              <small>
                {new Date(e.accepted_at).toLocaleString("en-GB", {
                  timeZone: "Asia/Colombo",
                })}{" "}
                · Colombo
              </small>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
type Action = (path: string, body: unknown) => Promise<boolean>;
export function OrderChooser({
  orders,
  selected,
  onSelect,
}: {
  orders: Order[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="order-list"
      style={{ maxHeight: "70vh", overflowY: "auto", padding: 4 }}
    >
      {orders.map((o) => (
        <button
          key={o.id}
          className={
            "order-row brand-" +
            o.brand_code +
            (selected === o.id ? " selected" : "")
          }
          onClick={() => onSelect(o.id)}
        >
          <span>
            <strong>{o.outlet_name}</strong>
            <small>
              {o.day} · {o.temperature.toLowerCase()} ·{" "}
              {o.source_ref || o.reference || o.outlet_id}
              {o.run?.stop_sequence
                ? ` · stop ${o.run.stop_sequence} / load ${o.run.loading_sequence}`
                : ""}
            </small>
          </span>
          <span className={"badge status-" + o.status}>
            {statusLabel(o.status)}
          </span>
        </button>
      ))}
      {!orders.length && <Panel>No orders assigned to this account yet.</Panel>}
    </div>
  );
}
export { StoreWorkspace as Manager } from "./store-workspace";
export function Receipt({
  order,
  action,
  busy,
}: {
  order: Order;
  action: Action;
  busy: boolean;
}) {
  const [counts, setCounts] = useState(
    Object.fromEntries(order.lines.map((l) => [l.id, l.expected_receiving])),
  );
  const [issue, setIssue] = useState("");
  return (
    <>
      <h2>Check this delivery</h2>
      <Notice>
        Driver proof and store receipt remain distinct. Confirm the delivered
        quantities; known loading shortages are already retained.
      </Notice>
      <a
        className="evidence-link"
        href={`/api/v1/orders/${order.id}/proof`}
        target="_blank"
        rel="noreferrer"
      >
        View delivery photo
      </a>
      {order.lines.map((l) => (
        <Panel className="product-row" key={l.id}>
          <div className="product-copy">
            <h3>{l.name}</h3>
            <p>
              Ordered {l.ordered} · loaded {l.loaded} · delivered {l.delivered}
            </p>
            {l.ordered > (l.loaded || 0) && (
              <small>
                Not loaded: {l.ordered - (l.loaded || 0)} · known shortage
              </small>
            )}
          </div>
          <Counter
            label={"Received " + l.name}
            value={counts[l.id]}
            max={l.expected_receiving}
            onChange={(v) => setCounts({ ...counts, [l.id]: v })}
          />
        </Panel>
      ))}
      <label>
        Receiving issue
        <select value={issue} onChange={(e) => setIssue(e.target.value)}>
          <option value="">No new discrepancy</option>
          <option>Short at receiving</option>
          <option>Damaged packaging</option>
          <option>Damaged product</option>
        </select>
      </label>
      <Button
        disabled={busy || !navigator.onLine}
        onClick={() =>
          action(`/orders/${order.id}/receive`, {
            expectedVersion: order.version,
            lines: order.lines.map((l) => ({
              lineId: l.id,
              quantity: counts[l.id],
            })),
            issue,
          })
        }
      >
        Confirm received
      </Button>
    </>
  );
}
export function Dispatcher({
  screen = "orders",
  day = "2026-01-08",
  orders,
  vehicles,
  catalog,
  conflicts,
  action,
  busy,
}: {
  screen?: string;
  day?: string;
  orders: Order[];
  vehicles: Vehicle[];
  catalog: Catalog;
  conflicts: Conflict[];
  action: Action;
  busy: boolean;
}) {
  if (screen === "planning")
    return (
      <>
        <div className="page-heading design-heading">
          <p className="eyebrow">Planning / assisted allocation</p>
          <h1>Assign store orders to vehicle runs</h1>
          <p>
            {day} service ·{" "}
            {orders.find((o) => o.day === day)?.run?.vehicle_id
              ? "Published handoffs and editable proposals"
              : "Review whole-order assignments before publication"}
          </p>
        </div>
        <PlanningBoard day={day} />
      </>
    );
  if (screen === "live" || screen === "fleet")
    return (
      <NetworkScreen day={day} orders={orders} fleetOnly={screen === "fleet"} />
    );
  if (screen === "orders" || screen === "deferrals")
    return (
      <OrderDesk
        orders={orders}
        day={day}
        catalog={catalog}
        deferred={screen === "deferrals"}
        action={action}
        busy={busy}
      />
    );
  if (screen === "administration") return <Administration />;
  return (
    <OperationsHistory
      orders={orders}
      conflicts={conflicts}
      action={action}
      busy={busy}
    />
  );
}
function Capacity({
  label,
  value,
  max,
  unit,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
}) {
  return (
    <div className="capacity">
      <div>
        <strong>{label}</strong>
        <span>
          {value.toFixed(2)} / {max} {unit}
        </span>
      </div>
      <meter
        min={0}
        max={max}
        value={Math.min(value, max)}
        aria-label={label + " capacity"}
      />
      {value > max && (
        <small className="error-text">
          Exceeds capacity · publication will be blocked
        </small>
      )}
    </div>
  );
}
export function Loader({
  day,
  orders,
  action,
  busy,
}: {
  day?: string;
  orders: Order[];
  action: Action;
  busy: boolean;
}) {
  const [selected, setSelected] = useState(""),
    [tab, setTab] = useState("active");
  const active = orders
    .filter(
      (o) =>
        (!day || o.day === day) && ["SCHEDULED", "LOADING"].includes(o.status),
    )
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        (a.run?.loading_sequence || 1) - (b.run?.loading_sequence || 1),
    );
  const order = orders.find((o) => o.id === selected) || active[0];
  const tripOrders = order
    ? active.filter((o) =>
        order.run?.route_trip_id
          ? o.run?.route_trip_id === order.run.route_trip_id
          : o.id === order.id,
      )
    : [];
  useEffect(() => {
    if (tab === "active" && selected && !active.some((o) => o.id === selected))
      setSelected("");
  }, [orders, selected, tab, day]);
  return (
    <>
      <div className="page-heading">
        <p>Dock / Assigned loading</p>
        <h1>
          {tab === "history" ? "Loading history" : "Load the assigned delivery"}
        </h1>
        <p>
          Count what physically enters the vehicle. Keep missing and damaged
          quantities visible.
        </p>
      </div>
      <nav className="role-tabs" aria-label="Loading tasks">
        <Button
          variant={tab === "active" ? "default" : "outline"}
          onClick={() => {
            setTab("active");
            setSelected("");
          }}
        >
          Active loads
        </Button>
        <Button
          variant={tab === "history" ? "default" : "outline"}
          onClick={() => {
            setTab("history");
            setSelected("");
          }}
        >
          History
        </Button>
      </nav>
      {tab === "active" ? (
        <>
          <label>
            Assigned load
            <select
              aria-label="Assigned load"
              value={order?.id || ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {active.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.run?.vehicle_id} · run {o.run?.trip} · {o.day} · load
                  position {o.run?.loading_sequence || 1} ·{" "}
                  {o.source_ref || o.reference || o.outlet_id}
                </option>
              ))}
            </select>
          </label>
          {tripOrders.length > 1 && (
            <section className="panel">
              <h2>Load in reverse delivery order</h2>
              <ol className="loading-stop-list">
                {tripOrders.map((o) => (
                  <li key={o.id}>
                    <button
                      className={
                        "fleet-row" + (order?.id === o.id ? " selected" : "")
                      }
                      onClick={() => setSelected(o.id)}
                    >
                      <strong>
                        Load {o.run?.loading_sequence} · {o.outlet_name}
                      </strong>
                      <span>
                        Stop {o.run?.stop_sequence} ·{" "}
                        {o.source_ref || o.reference} · {statusLabel(o.status)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {!active.length && (
            <Panel>
              No active loads assigned. Published work will appear here.
            </Panel>
          )}
        </>
      ) : (
        <OrderChooser
          orders={orders.filter(
            (o) => !["SCHEDULED", "LOADING"].includes(o.status),
          )}
          selected={selected}
          onSelect={setSelected}
        />
      )}
      {order && tab === "active" && (
        <>
          <LoadingForm
            key={order.id + ":" + order.version}
            order={order}
            action={action}
            busy={busy}
            orders={orders}
          />
          <details>
            <summary>Loading history and plan identifiers</summary>
            <p>
              Order {order.id} · plan {order.run?.plan_id}
            </p>
            <Timeline order={order} />
          </details>
        </>
      )}
      {tab === "history" && selected && order && <Timeline order={order} />}
    </>
  );
}
function LoadingForm({
  order,
  action,
  busy,
  orders,
}: {
  order: Order;
  action: Action;
  busy: boolean;
  orders: Order[];
}) {
  const [counts, setCounts] = useState(
      Object.fromEntries(order.lines.map((l) => [l.id, l.loaded ?? l.ordered])),
    ),
    [reason, setReason] = useState("NONE");
  const shortage = order.lines.reduce(
    (n, l) => n + l.ordered - counts[l.id],
    0,
  );
  const manifest = orders.filter((o) =>
    order.run?.route_trip_id
      ? o.run?.route_trip_id === order.run.route_trip_id
      : o.id === order.id,
  );
  const kg = manifest.reduce(
      (n, o) =>
        n +
        o.lines.reduce(
          (sum, l) =>
            sum +
            (o.id === order.id ? counts[l.id] : (l.loaded ?? l.ordered)) *
              Number(l.weight_kg),
          0,
        ),
      0,
    ),
    m3 = manifest.reduce(
      (n, o) =>
        n +
        o.lines.reduce(
          (sum, l) =>
            sum +
            (o.id === order.id ? counts[l.id] : (l.loaded ?? l.ordered)) *
              Number(l.volume_m3),
          0,
        ),
      0,
    );
  return (
    <div className="loading-grid">
      <div>
        <Panel>
          <h2>
            {order.run?.vehicle_name} · plan v{order.run?.plan_version}
          </h2>
          <TripManifest order={order} loading />
          <p>
            {order.temperature.toLowerCase()} · {order.outlet_name}
          </p>
          {order.lines.map((l) => (
            <div className="product-row" key={l.id}>
              <Package size={28} />
              <div className="product-copy">
                <h3>{l.name}</h3>
                <p>
                  {l.ordered} ordered · {l.weight_kg} kg each
                </p>
                <small>
                  {l.temperature === "AMBIENT"
                    ? "Keep dry / inspect protected goods"
                    : `${l.min_c} to ${l.max_c}°C`}
                </small>
              </div>
              {order.status === "SCHEDULED" ? (
                <Counter
                  label={"Loaded " + l.name}
                  value={counts[l.id]}
                  max={l.ordered}
                  onChange={(v) => setCounts({ ...counts, [l.id]: v })}
                />
              ) : (
                <strong>{l.loaded ?? "—"} loaded</strong>
              )}
            </div>
          ))}
        </Panel>
        {order.status === "SCHEDULED" && (
          <Panel>
            <label>
              Loading exception
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="NONE">All quantities present</option>
                <option value="SHORTAGE">Missing stock</option>
                <option value="DAMAGE">Damaged stock</option>
              </select>
            </label>
            {shortage > 0 && (
              <Notice tone="warning">
                {shortage} units not loaded. Dispatcher approval is required
                before release.
              </Notice>
            )}
            <Button
              className="loader-save-action"
              disabled={
                busy || !navigator.onLine || (shortage > 0 && reason === "NONE")
              }
              onClick={() =>
                action(`/orders/${order.id}/loading`, {
                  expectedVersion: order.version,
                  lines: order.lines.map((l) => ({
                    lineId: l.id,
                    quantity: counts[l.id],
                  })),
                  reason,
                })
              }
            >
              Acknowledge plan & save loading check
            </Button>
          </Panel>
        )}
        {order.status === "LOADING" && (
          <Panel>
            {order.loadingIssues.length > 0 &&
            !order.run?.partial_approved_by ? (
              <Notice tone="warning">
                Release held · dispatcher must approve the partial load.
              </Notice>
            ) : (
              <>
                <Notice tone="success">
                  {order.run?.partial_approved_by
                    ? "Approved partial load. Known shortages remain in the record."
                    : "Loading check complete. Ready for final release."}
                </Notice>
                <Button
                  className="loader-save-action"
                  disabled={busy || !navigator.onLine}
                  onClick={() =>
                    action(`/orders/${order.id}/release`, {
                      expectedVersion: order.version,
                    })
                  }
                >
                  Release load to driver
                </Button>
              </>
            )}
          </Panel>
        )}
      </div>
      <Panel>
        <h2>Load manifest</h2>
        <Capacity
          label="Weight"
          value={kg}
          max={Number(order.run?.capacity_kg) || 1}
          unit="kg"
        />
        <Capacity
          label="Volume"
          value={m3}
          max={Number(order.run?.capacity_m3) || 1}
          unit="m³"
        />
        <p>
          {manifest.length} ordered stops. Capacity includes reserved quantities
          at unchecked stops and entered physical counts at this stop.
        </p>
        <p>Departure locks the loading record.</p>
      </Panel>
    </div>
  );
}
export function Driver({
  day,
  account,
  orders,
  action,
  busy,
  onSaved,
}: {
  day?: string;
  account: Account;
  orders: Order[];
  action: Action;
  busy: boolean;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState(""),
    [outbox, setOutbox] = useState<OutboxAction[]>([]),
    [tab, setTab] = useState("journey");
  useEffect(() => {
    let live = true;
    const read = () =>
      offlineDb.outbox
        .where("accountId")
        .equals(account.id)
        .toArray()
        .then((v) => {
          if (live) setOutbox(v);
        });
    void read();
    const timer = setInterval(read, 1500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [account.id]);
  const active = orders
    .filter(
      (o) =>
        (!day || o.day === day) &&
        ["RELEASED", "IN_TRANSIT", "ARRIVED"].includes(o.status),
    )
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        (a.run?.stop_sequence || 1) - (b.run?.stop_sequence || 1),
    );
  useEffect(() => {
    if (tab !== "history" && selected && !active.some((o) => o.id === selected))
      setSelected("");
  }, [day, orders, selected, tab]);
  const order = orders.find((o) => o.id === selected) || active[0],
    saved = outbox.find(
      (a) => a.entityId === order?.id && a.syncState !== "rejected",
    );
  useEffect(() => {
    if (tab === "sync" || tab === "history") return;
    if (order?.status === "ARRIVED") setTab("proof");
    else if (order?.status === "RELEASED" || order?.status === "IN_TRANSIT")
      setTab("journey");
  }, [order?.id, order?.status]);
  return (
    <>
      <div className="page-heading">
        <h1>
          {tab === "history"
            ? "Journey history"
            : tab === "proof"
              ? "Record your current stop"
              : tab === "sync"
                ? "Proof and sync"
                : "Your assigned journey"}
        </h1>
        <p>{account.depot} · acknowledge the released plan before departure.</p>
      </div>
      <nav className="role-tabs" aria-label="Driver tasks">
        {[
          ["journey", "Journey"],
          ["proof", "Stop proof"],
          ["sync", "Sync"],
          ["history", "History"],
        ].map(([t, label]) => (
          <Button
            key={t}
            variant={tab === t ? "default" : "outline"}
            onClick={() => setTab(t)}
          >
            {label}
          </Button>
        ))}
      </nav>
      <div className="driver-sync-banner" role="status">
        {outbox.filter((a) => a.syncState !== "synced").length} proof action(s)
        pending or needing attention · {navigator.onLine ? "Online" : "Offline"}
      </div>
      {tab === "history" ? (
        <OrderChooser
          orders={orders.filter(
            (o) => !["RELEASED", "IN_TRANSIT", "ARRIVED"].includes(o.status),
          )}
          selected={selected}
          onSelect={setSelected}
        />
      ) : (
        tab !== "sync" && (
          <label>
            Assigned stop
            <select
              aria-label="Assigned stop"
              value={order?.id || ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {active.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.run?.vehicle_id} · stop {o.run?.stop_sequence || 1} ·{" "}
                  {o.outlet_name} · {o.source_ref || o.reference}
                </option>
              ))}
            </select>
          </label>
        )
      )}
      {!active.length && tab === "journey" && (
        <Panel>
          No released journey assigned. Dispatch and loading must complete the
          handoff first.
        </Panel>
      )}
      {order && tab !== "sync" && tab !== "history" && (
        <>
          <div hidden={tab !== "journey"}>
            <DriverJourney account={account} order={order} />
          </div>
          {tab === "journey" && (
            <>
              <Panel>
                <h2>{order.outlet_name}</h2>
                <p>
                  {order.run?.vehicle_name} · {order.temperature.toLowerCase()}{" "}
                  · plan v{order.run?.plan_version}
                </p>
                <TripManifest order={order} />
                <p>
                  Receiving window {order.window_start.slice(0, 5)}–
                  {order.window_end.slice(0, 5)}
                </p>
                {order.status === "RELEASED" && (
                  <>
                    <Notice>
                      Loader released this load. Review quantities before
                      acknowledging departure.
                    </Notice>
                    {order.lines.map((l) => (
                      <p key={l.id}>
                        {l.name} · {l.loaded} loaded / {l.ordered} ordered
                      </p>
                    ))}
                    <Button
                      disabled={busy || !navigator.onLine}
                      onClick={() =>
                        action(`/orders/${order.id}/start`, {
                          expectedVersion: order.version,
                        })
                      }
                    >
                      Acknowledge plan & start journey
                    </Button>
                  </>
                )}
                {order.status === "IN_TRANSIT" && (
                  <>
                    <Notice>
                      Record arrival when safely stopped. Follow the published
                      stop order.
                    </Notice>
                    <Button
                      disabled={busy || !navigator.onLine}
                      onClick={() =>
                        action(`/orders/${order.id}/arrive`, {
                          expectedVersion: order.version,
                        })
                      }
                    >
                      Confirm arrival · safely stopped
                    </Button>
                  </>
                )}
              </Panel>
              <IssueConversation orderId={order.id} />
            </>
          )}
          {tab === "proof" && order.status === "ARRIVED" && !saved && (
            <DeliveryForm
              key={order.id + ":" + order.version}
              account={account}
              order={order}
              onSaved={onSaved}
            />
          )}
          {tab === "proof" && saved && (
            <Notice tone={saved.syncState === "synced" ? "success" : "warning"}>
              {saved.syncState === "synced"
                ? "Delivery proof accepted by the server. Store receipt is still separate."
                : "Proof saved on this device. Open Sync to review upload progress."}
            </Notice>
          )}
          {tab === "proof" && order.status !== "ARRIVED" && !saved && (
            <Notice>
              Confirm arrival at this stop before recording delivered
              quantities.
            </Notice>
          )}
          <details>
            <summary>Journey history and shared identifiers</summary>
            <p>
              Order {order.id} · plan {order.run?.plan_id}
            </p>
            <Timeline order={order} />
          </details>
        </>
      )}
      {tab === "history" && selected && order && <Timeline order={order} />}
      {tab === "sync" && (
        <Panel>
          <div className="section-title">
            <h2>Proof on this device</h2>
            <Button
              variant="outline"
              disabled={!navigator.onLine}
              onClick={async () => {
                await syncProofs(account.id, true);
                onSaved();
              }}
            >
              <RefreshCw size={16} /> Retry sync
            </Button>
          </div>
          {!outbox.length ? (
            <p>No proof saved on this device yet.</p>
          ) : (
            outbox.map((a) => (
              <div className="conflict-row" key={a.actionId}>
                <strong>
                  {orders.find((o) => o.id === a.entityId)?.source_ref ||
                    orders.find((o) => o.id === a.entityId)?.reference ||
                    "Saved delivery"}{" "}
                  ·{" "}
                  {a.syncState === "synced"
                    ? "Accepted by server"
                    : a.syncState === "conflict"
                      ? "Conflict needs review"
                      : a.syncState === "rejected"
                        ? "Needs attention"
                        : "Saved on device · pending sync"}
                </strong>
                <p>
                  {a.message ||
                    "Photo and quantities are retained together on this device."}
                </p>
                <small>
                  Captured{" "}
                  {new Date(a.capturedAt).toLocaleString("en-GB", {
                    timeZone: "Asia/Colombo",
                  })}{" "}
                  · action {a.actionId.slice(0, 8)}
                </small>
                {a.syncState === "conflict" && (
                  <Notice tone="warning">
                    Your proof and the changed server plan are both kept.
                    Dispatcher review is required; this is not receipt
                    confirmation.
                  </Notice>
                )}
                {a.syncState === "rejected" && (
                  <Notice tone="critical">
                    Evidence remains saved. Reconnect and ask the dispatcher to
                    review this stop.
                  </Notice>
                )}
              </div>
            ))
          )}
        </Panel>
      )}
    </>
  );
}
function DeliveryForm({
  account,
  order,
  onSaved,
}: {
  account: Account;
  order: Order;
  onSaved: () => void;
}) {
  const local = useProofDraft(account.id, order);
  const counts = local.draft.quantities,
    issue = local.draft.issue,
    file = local.draft.photo;
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const short = order.lines.some((l) => counts[l.id] < (l.loaded || 0));
  return (
    <>
      <div className="page-heading">
        <h2>Record what arrived</h2>
        <p>Safely parked · count physical quantities at this stop.</p>
      </div>
      <Notice>
        {navigator.onLine
          ? "Proof is saved on this device before upload."
          : "Connection unavailable. Save proof now; sync retries when connectivity returns."}
      </Notice>
      <Notice
        tone={local.state === "error" || local.stale ? "warning" : "info"}
      >
        <span role="status">
          {local.state === "loading"
            ? "Opening your local proof draft…"
            : local.state === "saving"
              ? "Saving draft on this device…"
              : local.state === "saved"
                ? "Draft saved on this device · not submitted"
                : "Quantity, issue and photo changes are saved as a local draft."}
        </span>
        {local.error && <p role="alert">{local.error}</p>}
        {local.stale && (
          <p>
            The stop changed since this draft was recorded. Your draft is
            retained. Review the current load, then discard the draft to start
            again.
          </p>
        )}
        {(local.state === "saved" ||
          local.stale ||
          local.state === "error") && (
          <Button
            variant="outline"
            disabled={saving || local.state === "saving"}
            onClick={async () => {
              try {
                await local.discard();
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Discard local draft
          </Button>
        )}
      </Notice>
      <fieldset
        disabled={saving || local.state === "loading" || local.stale}
        className="proof-draft-fields"
      >
        {order.lines.map((l) => (
          <Panel className="product-row" key={l.id}>
            <div className="product-copy">
              <h3>{l.name}</h3>
              <p>
                {l.loaded} released · {l.ordered - (l.loaded || 0)} known not
                loaded
              </p>
            </div>
            <Counter
              label={"Delivered " + l.name}
              value={counts[l.id]}
              max={l.loaded || 0}
              onChange={(v) =>
                local.update({ quantities: { ...counts, [l.id]: v } })
              }
            />
          </Panel>
        ))}
        <Panel>
          <label>
            Delivery issue
            <select
              value={issue}
              onChange={(e) => local.update({ issue: e.target.value })}
            >
              <option value="">No new discrepancy</option>
              <option>Short at delivery</option>
              <option>Damaged product</option>
              <option>Damaged packaging</option>
            </select>
          </label>
          <label className="photo-label">
            <Camera size={22} /> Delivery photo · JPEG or PNG, up to 5 MB
            <input
              aria-label="Delivery photo"
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (!selected) return;
                if (
                  !["image/jpeg", "image/png"].includes(selected.type) ||
                  selected.size > 5 * 1024 * 1024 ||
                  !selected.size
                ) {
                  setError("Choose a JPEG or PNG photo up to 5 MB.");
                  e.target.value = "";
                  return;
                }
                setError("");
                local.update({ photo: selected, photoName: selected.name });
              }}
            />
          </label>
          {file && (
            <>
              <img
                className="proof-preview"
                src={preview}
                alt="Selected delivery evidence preview"
              />
              <p>
                {local.draft.photoName} · {(file.size / 1024).toFixed(0)} KB
                selected
              </p>
            </>
          )}
          <small>
            Photo and physical quantities are retained together. Store receipt
            is a separate confirmation.
          </small>
        </Panel>
      </fieldset>
      {error && <Notice tone="critical">{error}</Notice>}
      <div className="sticky-action">
        <small>Saved locally before any confirmation</small>
        <Button
          disabled={
            saving ||
            local.state !== "saved" ||
            local.stale ||
            !file ||
            (short && !issue)
          }
          onClick={async () => {
            setSaving(true);
            setError("");
            try {
              await local.flush();
              await saveProof(
                account,
                order,
                counts,
                issue,
                new File([file!], local.draft.photoName || "proof.png", {
                  type: file!.type,
                }),
              );
              onSaved();
              void syncProofs(account.id);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Cannot save proof.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving evidence…" : "Save proof on this device"}
        </Button>
      </div>
    </>
  );
}
