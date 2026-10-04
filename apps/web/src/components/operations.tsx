import { useEffect, useState, type ReactNode } from "react";
import {
  Package,
  Minus,
  Plus,
  Check,
  Camera,
  ArrowRight,
  RefreshCw,
  Route,
  ClipboardCheck,
  CloudUpload,
  History as HistoryIcon,
  Clock3,
  Truck,
  Thermometer,
  Wifi,
  WifiOff,
  TriangleAlert,
} from "lucide-react";
import { Button } from "./ui/button";
import { api } from "../lib/api";
import { useServiceOnline } from "../lib/connectivity";
import type { Account, Catalog, Order, Vehicle, Conflict } from "../lib/models";
import {
  offlineDb,
  type OutboxAction,
  type ProofDraft,
} from "../lib/offline-db";
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
import {
  driverActive,
  driverTripKey,
  driverTrips,
  driverSyncSummary,
  driverStep,
  driverStepTitle,
} from "../lib/driver-workspace";
import { useWakeLock } from "../lib/use-wake-lock";
import { useLocationSharing } from "../lib/use-location-sharing";

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
        inputMode="numeric"
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
    [drafts, setDrafts] = useState<ProofDraft[]>([]),
    [tab, setTab] = useState("journey");
  const [selectedTrip, setSelectedTrip] = useState("");
  const [savedStop, setSavedStop] = useState<Order | null>(null);
  const [arriving, setArriving] = useState(false);
  const online = useServiceOnline();
  useEffect(() => {
    setSelected("");
    setSelectedTrip("");
    setSavedStop(null);
    setTab("journey");
  }, [account.id, day]);
  useEffect(() => {
    let live = true;
    const read = () =>
      Promise.all([
        offlineDb.outbox.where("accountId").equals(account.id).toArray(),
        offlineDb.proofDrafts.where("accountId").equals(account.id).toArray(),
      ])
        .then(([actions, kept]) => {
          if (live) {
            setOutbox(
              actions.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)),
            );
            setDrafts(kept);
          }
        })
        .catch(() => {});
    void read();
    const timer = setInterval(read, 1500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [account.id]);
  const trips = driverTrips(orders, day);
  const trip =
    trips.find((t) => t.key === selectedTrip) ||
    trips.find((t) => t.stops.some(driverActive)) ||
    trips[0];
  const tripStops = trip?.stops || [];
  const active = tripStops
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
  const order =
      (tab === "history" ? orders : active).find((o) => o.id === selected) ||
      active[0],
    saved = outbox.find(
      (a) => a.entityId === order?.id && a.syncState !== "rejected",
    );
  useEffect(() => {
    if (tab === "sync" || tab === "history") return;
    if (order?.status === "ARRIVED") setTab("proof");
    else if (order?.status === "RELEASED" || order?.status === "IN_TRANSIT")
      setTab("journey");
  }, [order?.id, order?.status]);
  useEffect(() => setArriving(false), [order?.id, order?.status]);
  const sharing = useLocationSharing(account, order);
  const moving = sharing.moving;
  useEffect(() => {
    if (saved && order && !savedStop && tab === "proof") setSavedStop(order);
  }, [saved?.actionId, order?.id, tab]);
  const syncSummary = driverSyncSummary(outbox);
  const completed = tripStops.filter((o) =>
    ["DELIVERED", "RECEIVED_AT_STORE"].includes(o.status),
  );
  const confirmation =
    savedStop && outbox.find((a) => a.entityId === savedStop.id);
  const earlierStopsUnresolved =
    !!order &&
    ((order.tripStops || []).some(
      (s) =>
        s.sequence < (order.run?.stop_sequence || 1) &&
        !["DELIVERED", "RECEIVED_AT_STORE", "DEFERRED"].includes(s.status),
    ) ||
      tripStops.some(
        (s) =>
          (s.run?.stop_sequence || 1) < (order.run?.stop_sequence || 1) &&
          !["DELIVERED", "RECEIVED_AT_STORE", "DEFERRED"].includes(s.status),
      ));
  const loadNotReleased =
    !!order && (order.tripStops || []).some((s) => s.status !== "RELEASED");
  useWakeLock(
    tripStops.some((o) => ["IN_TRANSIT", "ARRIVED"].includes(o.status)),
  );
  const step = driverStep(order, !!savedStop, !!trip);
  const tripPicker = trips.length > 0 && (
    <Panel className="driver-trip-overview">
      {trips.length > 1 && (
        <>
          <h2>Your trips</h2>
          <div
            className="driver-choice-list"
            role="radiogroup"
            aria-label="Assigned trip"
          >
            {trips.map((t) => {
              const first = t.stops[0];
              const done = t.stops.filter((s) =>
                ["DELIVERED", "RECEIVED_AT_STORE"].includes(s.status),
              ).length;
              return (
                <label
                  key={t.key}
                  className={
                    "driver-choice" + (t.key === trip?.key ? " selected" : "")
                  }
                >
                  <input
                    type="radio"
                    name="driver-trip"
                    value={t.key}
                    checked={t.key === trip?.key}
                    onChange={() => {
                      setSelectedTrip(t.key);
                      setSelected("");
                      setSavedStop(null);
                      setTab("journey");
                    }}
                  />
                  <Truck size={28} aria-hidden="true" />
                  <span>
                    <strong>
                      {first.run?.vehicle_id} · trip {first.run?.trip}
                    </strong>
                    <small>
                      {first.day} · {done} of {t.stops.length} delivered
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}
      <h2>Trip stops</h2>
      <p className="driver-trip-progress">
        <strong>
          {completed.length} of {tripStops.length}
        </strong>{" "}
        stops delivered · {tripStops[0]?.temperature.toLowerCase()}
      </p>
      <progress
        aria-label="Trip delivery progress"
        value={completed.length}
        max={tripStops.length}
      />
      <ol
        className="driver-stop-list"
        role="radiogroup"
        aria-label="Assigned stop"
      >
        {tripStops.map((stop) => {
          const selectable = active.some((o) => o.id === stop.id);
          const sequence = stop.run?.stop_sequence || 1;
          const finished = ["DELIVERED", "RECEIVED_AT_STORE"].includes(
            stop.status,
          );
          return (
            <li
              key={stop.id}
              className={
                "driver-stop-row" +
                (stop.id === order?.id ? " selected" : "") +
                (selectable ? "" : " inactive")
              }
            >
              {selectable && (
                <input
                  type="radio"
                  name="driver-stop"
                  value={stop.id}
                  checked={stop.id === order?.id}
                  aria-label={`Stop ${sequence} · ${stop.outlet_name} · ${statusLabel(stop.status)}`}
                  onChange={() => {
                    setSelected(stop.id);
                    setSavedStop(null);
                  }}
                />
              )}
              <span className="driver-seq" aria-hidden="true">
                {finished ? <Check size={20} /> : sequence}
              </span>
              <span className="driver-stop-copy">
                <strong>{stop.outlet_name}</strong>
                <small>
                  {stop.window_start.slice(0, 5)}–{stop.window_end.slice(0, 5)}{" "}
                  · {stop.lines.reduce((n, l) => n + (l.loaded || 0), 0)} of{" "}
                  {stop.lines.reduce((n, l) => n + l.ordered, 0)} units
                </small>
                {stop.run?.partial_reason && (
                  <small className="driver-shortage">
                    <TriangleAlert size={16} aria-hidden="true" /> Approved
                    shortage: {stop.run.partial_reason}
                  </small>
                )}
              </span>
              <span className={"badge status-" + stop.status}>
                {statusLabel(stop.status)}
              </span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
  const tabs = [
    ["journey", "Journey", Route],
    ["proof", "Stop proof", ClipboardCheck],
    ["sync", "Sync", CloudUpload],
    ["history", "History", HistoryIcon],
  ] as const;
  return (
    <div className="driver-workspace">
      <div className="page-heading">
        <h1>
          {tab === "history"
            ? "Journey history"
            : tab === "sync"
              ? "Proof and sync"
              : tab === "proof" && step !== "arrived" && step !== "saved"
                ? "Record your current stop"
                : driverStepTitle[step]}
        </h1>
      </div>
      <nav className="role-tabs driver-bottom-nav" aria-label="Driver tasks">
        {tabs.map(([t, label, TabIcon]) => (
          <Button
            key={t}
            variant={tab === t ? "default" : "outline"}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => setTab(t)}
          >
            <TabIcon size={24} aria-hidden="true" />
            {label}
            {t === "sync" && syncSummary.waiting + syncSummary.review > 0 && (
              <span className="driver-nav-badge" aria-hidden="true">
                {syncSummary.waiting + syncSummary.review}
              </span>
            )}
          </Button>
        ))}
      </nav>
      <div
        className={
          "driver-sync-banner" +
          (syncSummary.review ? " review" : "") +
          (online ? "" : " offline")
        }
        role="status"
      >
        <span>
          {online ? (
            <Wifi size={22} aria-hidden="true" />
          ) : (
            <WifiOff size={22} aria-hidden="true" />
          )}
          {online ? "Online" : "Offline"}
        </span>
        <span>
          <CloudUpload size={22} aria-hidden="true" />
          {syncSummary.waiting
            ? `${syncSummary.waiting} stop${syncSummary.waiting === 1 ? "" : "s"} to send`
            : "No stops waiting to send"}
        </span>
        {syncSummary.review > 0 && (
          <span>
            <TriangleAlert size={22} aria-hidden="true" />
            {`${syncSummary.review} stop${syncSummary.review === 1 ? "" : "s"} need review`}
          </span>
        )}
      </div>
      {!online && (
        <Notice tone="warning">
          Service connection unavailable. Showing saved stops. Save delivery
          proof on this device; uploads retry automatically when the service
          returns.
        </Notice>
      )}
      {savedStop && tab !== "sync" && tab !== "history" && (
        <Panel className="driver-saved-confirmation">
          <h2>
            {confirmation?.syncState === "synced"
              ? "Delivery proof accepted"
              : confirmation &&
                  ["conflict", "rejected"].includes(confirmation.syncState)
                ? "Saved evidence needs review"
                : "Proof saved on this device"}
          </h2>
          <p>
            {savedStop.outlet_name} · stop {savedStop.run?.stop_sequence || 1}
          </p>
          <p>
            {confirmation?.message ||
              "Your photo and quantities are retained on this phone. Server acceptance is pending."}
          </p>
          <p>Store receipt is a separate confirmation.</p>
          <Button variant="outline" onClick={() => setTab("sync")}>
            Review saved proof
          </Button>
          {active.find((o) => o.id !== savedStop.id) && (
            <div className="driver-action-bar">
              <Button
                onClick={() => {
                  const next = active.find((o) => o.id !== savedStop.id)!;
                  setSelected(next.id);
                  setSavedStop(null);
                  setTab(next.status === "ARRIVED" ? "proof" : "journey");
                }}
              >
                View next stop <ArrowRight size={22} aria-hidden="true" />
              </Button>
            </div>
          )}
        </Panel>
      )}
      {tab === "history" && (
        <OrderChooser
          orders={orders.filter(
            (o) => !["RELEASED", "IN_TRANSIT", "ARRIVED"].includes(o.status),
          )}
          selected={selected}
          onSelect={setSelected}
        />
      )}
      {tab !== "sync" &&
        tab !== "history" &&
        !(order && !savedStop) &&
        tripPicker}
      {!active.length && tab === "journey" && (
        <Panel>
          {trip
            ? "No active stops in this trip. Review its stop summary and sync status."
            : "No released journey assigned. Dispatch and loading must complete the handoff first."}
        </Panel>
      )}
      {order && !savedStop && tab !== "sync" && tab !== "history" && (
        <>
          {tab === "journey" && (
            <>
              <Panel className="driver-stop-card">
                <p className="driver-eyebrow">
                  {order.id === active[0]?.id ? "Next stop" : "Selected stop"} ·
                  stop {order.run?.stop_sequence || 1}
                  {tripStops.length ? ` of ${tripStops.length}` : ""}
                </p>
                <h2>{order.outlet_name}</h2>
                <ul className="driver-facts">
                  <li>
                    <Clock3 size={26} aria-hidden="true" />
                    <span>
                      <small>Receiving window</small>
                      {order.window_start.slice(0, 5)}–
                      {order.window_end.slice(0, 5)}
                    </span>
                  </li>
                  <li>
                    <Truck size={26} aria-hidden="true" />
                    <span>
                      <small>Access</small>
                      {order.access === "VAN_ONLY"
                        ? "Van access only"
                        : "Truck or van access"}
                    </span>
                  </li>
                  <li>
                    <Package size={26} aria-hidden="true" />
                    <span>
                      <small>Released load</small>
                      {order.lines.reduce(
                        (n, l) => n + (l.loaded || 0),
                        0,
                      )}{" "}
                      units
                    </span>
                  </li>
                  <li>
                    <Thermometer size={26} aria-hidden="true" />
                    <span>
                      <small>Temperature</small>
                      {order.temperature.charAt(0) +
                        order.temperature.slice(1).toLowerCase()}
                    </span>
                  </li>
                </ul>
                <p className="driver-meta">
                  {order.run?.vehicle_name} · plan v{order.run?.plan_version}
                </p>
                {order.status === "RELEASED" && (
                  <>
                    <Notice>
                      Loader released this load. Review quantities before
                      acknowledging departure.
                    </Notice>
                    <ul className="driver-load-lines">
                      {order.lines.map((l) => (
                        <li key={l.id}>
                          <span>{l.name}</span>
                          <strong>
                            {l.loaded} / {l.ordered}
                          </strong>
                        </li>
                      ))}
                    </ul>
                    <div className="driver-action-bar">
                      <Button
                        disabled={busy || !online || loadNotReleased}
                        onClick={() =>
                          action(`/orders/${order.id}/start`, {
                            expectedVersion: order.version,
                          })
                        }
                      >
                        Acknowledge plan & start journey
                      </Button>
                    </div>
                    {loadNotReleased && (
                      <Notice>
                        Loading must release every stop before departure.
                      </Notice>
                    )}
                    {!online && (
                      <Notice>
                        Reconnect to acknowledge the load and start this trip.
                      </Notice>
                    )}
                  </>
                )}
                {order.status === "IN_TRANSIT" && (
                  <>
                    {moving ? (
                      <Notice tone="warning">
                        Vehicle is moving. Stop safely before recording arrival.
                      </Notice>
                    ) : (
                      <Notice>
                        Only use the app when parked. Follow the published stop
                        order.
                      </Notice>
                    )}
                    <div className="driver-action-bar">
                      <Button
                        disabled={
                          busy || !online || earlierStopsUnresolved || !!moving
                        }
                        onClick={() => setArriving(true)}
                      >
                        {moving
                          ? "Stop safely to record arrival"
                          : "I've arrived"}
                      </Button>
                    </div>
                    {earlierStopsUnresolved && (
                      <Notice>
                        Complete or explicitly defer earlier stops before
                        arriving here.
                      </Notice>
                    )}
                    {!online && (
                      <Notice>
                        Reconnect to confirm arrival. Any saved proof remains on
                        this device.
                      </Notice>
                    )}
                  </>
                )}
              </Panel>
              {arriving && order.status === "IN_TRANSIT" && (
                <ArriveSheet
                  order={order}
                  disabled={busy || !online || !!moving}
                  onCancel={() => setArriving(false)}
                  onConfirm={() => {
                    setArriving(false);
                    navigator.vibrate?.(40);
                    action(`/orders/${order.id}/arrive`, {
                      expectedVersion: order.version,
                    });
                  }}
                />
              )}
              {tripPicker}
              <DriverJourney
                account={account}
                order={order}
                sharing={sharing}
              />
              <IssueConversation orderId={order.id} />
            </>
          )}
          {tab === "proof" &&
            order.status === "ARRIVED" &&
            !saved &&
            moving && (
              <Notice tone="warning">
                Vehicle is moving. Your draft is kept on this phone; park safely
                to continue recording this delivery.
              </Notice>
            )}
          {tab === "proof" &&
            order.status === "ARRIVED" &&
            !saved &&
            !moving && (
              <DeliveryForm
                key={order.id + ":" + order.version}
                account={account}
                order={order}
                onSaved={() => {
                  setSavedStop(order);
                  setSelectedTrip(driverTripKey(order));
                  onSaved();
                }}
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
          {tab === "proof" && tripPicker}
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
          {drafts.map((draft) => {
            const currentOrder = orders.find((o) => o.id === draft.orderId);
            return currentOrder?.status === "DEFERRED" &&
              draft.expectedVersion !== currentOrder.version &&
              !outbox.some(
                (a) =>
                  a.entityId === draft.orderId && a.syncState !== "rejected",
              ) ? (
              <DeferredDraftReview
                key={draft.key}
                account={account}
                order={currentOrder}
                draft={draft}
                onSaved={onSaved}
              />
            ) : null;
          })}
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
    </div>
  );
}
function ArriveSheet({
  order,
  disabled,
  onCancel,
  onConfirm,
}: {
  order: Order;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onCancel]);
  return (
    <div className="driver-sheet-backdrop" onClick={onCancel}>
      <section
        className="driver-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-arrive-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="driver-eyebrow">
          Stop {order.run?.stop_sequence || 1} · confirm arrival
        </p>
        <h2 id="driver-arrive-title">{order.outlet_name}</h2>
        <p>Confirm you are parked safely at this outlet.</p>
        <Button autoFocus disabled={disabled} onClick={onConfirm}>
          Confirm arrival
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </section>
    </div>
  );
}
function DeferredDraftReview({
  account,
  order,
  draft,
  onSaved,
}: {
  account: Account;
  order: Order;
  draft: ProofDraft;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState("");
  useEffect(() => {
    if (!draft.photo) return;
    const url = URL.createObjectURL(draft.photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.photo]);
  return (
    <section
      aria-label="Retained draft for deferred stop"
      className="conflict-row"
    >
      <h3>{order.source_ref || order.reference} · unsent draft retained</h3>
      <p>
        Dispatch deferred this stop. Save the original evidence for dispatcher
        review; this does not confirm delivery or undo the deferral.
      </p>
      <ul>
        {order.lines.map((line) => (
          <li key={line.id}>
            {line.name}:{" "}
            {draft.quantities[line.id] ?? "Missing retained quantity"} retained
            · {line.loaded ?? 0} released
          </li>
        ))}
      </ul>
      <p>
        Issue: {draft.issue || "None recorded"} · original stop version{" "}
        {draft.expectedVersion} · current version {order.version}
      </p>
      {preview && (
        <img
          src={preview}
          alt="Retained draft evidence preview"
          className="proof-preview"
        />
      )}
      {!draft.photo && (
        <p>
          The draft has no photo. Keep it and ask dispatch to review this stop.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <Button
        disabled={busy || !draft.photo}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            if (
              Object.keys(draft.quantities).length !== order.lines.length ||
              order.lines.some(
                (line) => !Number.isInteger(draft.quantities[line.id]),
              )
            )
              throw new Error(
                "The order lines changed. Evidence is retained; ask dispatch to review before submission.",
              );
            // Preserve the captured version so Spring retains a conflict, never a silent rebase.
            await saveProof(
              account,
              { ...order, version: draft.expectedVersion },
              draft.quantities,
              draft.issue,
              new File([draft.photo!], draft.photoName || "proof.png", {
                type: draft.photo!.type,
              }),
              draft,
            );
            onSaved();
            void syncProofs(account.id);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Saving evidence…"
          : "Save retained draft for dispatcher review"}
      </Button>
    </section>
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
  const online = useServiceOnline();
  const counts = local.draft.quantities,
    issue = local.draft.issue,
    file = local.draft.photo;
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [reviewedLoad, setReviewedLoad] = useState(false);
  const [preview, setPreview] = useState("");
  const [mode, setMode] = useState<"count" | "photo" | "review" | null>(null);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (mode || local.state === "loading") return;
    setMode(file || local.stale ? "review" : "count");
  }, [local.state, local.stale, file, mode]);
  const short = order.lines.some((l) => counts[l.id] < (l.loaded || 0));
  const view = local.stale ? "review" : mode || "count";
  const locked =
    saving ||
    local.state === "loading" ||
    local.state === "error" ||
    local.stale;
  const delivered = order.lines.reduce((n, l) => n + (counts[l.id] || 0), 0),
    released = order.lines.reduce((n, l) => n + (l.loaded || 0), 0);
  const issues = [
    ["", "No new discrepancy"],
    ["Short at delivery", "Short at delivery"],
    ["Damaged product", "Damaged product"],
    ["Damaged packaging", "Damaged packaging"],
  ];
  return (
    <div className={"driver-delivery view-" + view}>
      <div className="driver-step-heading">
        <p className="driver-eyebrow">
          {view === "count"
            ? "Step 1 of 2 · Count"
            : view === "photo"
              ? "Step 2 of 2 · Photo and save"
              : "Review retained delivery"}
        </p>
        <h2>
          {view === "count"
            ? "What did you deliver?"
            : view === "photo"
              ? "Take a delivery photo"
              : "Check quantities and photo"}
        </h2>
      </div>
      <Notice
        tone={local.state === "error" || local.stale ? "warning" : "info"}
      >
        <small>
          {online
            ? "Proof is saved on this device before upload."
            : "Connection unavailable. Save proof now; sync retries when connectivity returns."}
        </small>
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
            retained. Compare the retained quantities below with the current
            released load. You can keep your photo and issue after reviewing.
          </p>
        )}
        {local.stale && (
          <div className="proof-draft-review">
            <label>
              <input
                type="checkbox"
                checked={reviewedLoad}
                onChange={(e) => setReviewedLoad(e.target.checked)}
              />
              I reviewed the retained quantities and photo against the current
              released load
            </label>
            <Button
              variant="outline"
              disabled={!reviewedLoad || saving || local.state !== "saved"}
              onClick={() => {
                try {
                  local.review();
                  setReviewedLoad(false);
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Keep evidence and use reviewed load
            </Button>
          </div>
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
      <fieldset disabled={locked} className="proof-draft-fields">
        {view === "count" && (
          <Button
            className="driver-all-delivered"
            onClick={() => {
              local.update({
                quantities: Object.fromEntries(
                  order.lines.map((l) => [l.id, l.loaded || 0]),
                ),
                issue: "",
              });
              setMode("photo");
            }}
          >
            <Check size={26} aria-hidden="true" /> All delivered as loaded
          </Button>
        )}
        {view !== "photo" && (
          <>
            {view === "count" && (
              <p className="driver-or">Or adjust what you delivered</p>
            )}
            {order.lines.map((l) => (
              <Panel className="product-row" key={l.id}>
                <div className="product-copy">
                  <h3>{l.name}</h3>
                  <p>
                    {l.loaded} released · {l.ordered - (l.loaded || 0)} known
                    not loaded
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
              <h3>
                {short ? "Why is it short? (required)" : "Delivery issue"}
              </h3>
              <div
                className="driver-choice-list driver-issue-list"
                role="radiogroup"
                aria-label="Delivery issue"
              >
                {issues.map(([value, label]) => (
                  <label
                    key={value || "none"}
                    className={
                      "driver-choice" + (issue === value ? " selected" : "")
                    }
                  >
                    <input
                      type="radio"
                      name={"delivery-issue-" + order.id}
                      value={value}
                      checked={issue === value}
                      onChange={() => local.update({ issue: value })}
                    />
                    <span>
                      <strong>{label}</strong>
                    </span>
                  </label>
                ))}
              </div>
            </Panel>
          </>
        )}
        {view === "photo" && (
          <Panel className="driver-delivery-summary">
            <p>
              <strong>
                {delivered} of {released}
              </strong>{" "}
              released units delivered
            </p>
            {issue && (
              <p className="driver-shortage">
                <TriangleAlert size={18} aria-hidden="true" /> {issue}
              </p>
            )}
            <Button variant="outline" onClick={() => setMode("count")}>
              Change quantities
            </Button>
          </Panel>
        )}
        {view !== "count" && (
          <Panel>
            <label className="photo-label driver-camera">
              <Camera size={32} aria-hidden="true" />
              {file ? "Retake photo" : "Take delivery photo"}
              <small>JPEG or PNG, up to 5 MB</small>
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
        )}
      </fieldset>
      {error && <Notice tone="critical">{error}</Notice>}
      <div className="sticky-action">
        {view === "count" ? (
          <>
            {short && !issue && (
              <small>Choose why it is short to continue</small>
            )}
            <Button
              disabled={locked || (short && !issue)}
              onClick={() => setMode("photo")}
            >
              Continue to photo <ArrowRight size={22} aria-hidden="true" />
            </Button>
          </>
        ) : (
          <>
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
                  setError(
                    e instanceof Error ? e.message : "Cannot save proof.",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving evidence…" : "Save proof on this device"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
