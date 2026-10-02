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

export const statusLabel = (value: string) =>
  ({
    RECEIVED: "Received",
    SCHEDULED: "Scheduled",
    LOADING: "Loading",
    RELEASED: "Released",
    IN_TRANSIT: "On the way",
    ARRIVED: "Arrived",
    DELIVERED: "Receipt required",
    RECEIVED_AT_STORE: "Receipt confirmed",
    DEFERRED: "Deferred",
  })[value] || value;
export const brandLabel = (value: string) =>
  ({ FRESH: "Fresh", STYLE: "Style", TECH: "Tech" })[value] || value;
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
    <div className="order-list">
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
              {o.day} · {o.temperature.toLowerCase()} · {o.id.slice(0, 8)}
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
export function Manager({
  catalog,
  orders,
  action,
  busy,
}: {
  catalog: Catalog;
  orders: Order[];
  action: Action;
  busy: boolean;
}) {
  const [outletId, setOutlet] = useState(catalog.outlets[0]?.id || "");
  const [tab, setTab] = useState("orders"),
    [temperature, setTemperature] = useState("AMBIENT"),
    [search, setSearch] = useState(""),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [review, setReview] = useState(false);
  const [day, setDay] = useState(
    catalog.operatingDays.find(
      (d) =>
        d.demo &&
        d.day > new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10),
    )?.day || "",
  );
  const [selected, setSelected] = useState("");
  const outlet = catalog.outlets.find((o) => o.id === outletId);
  const products = catalog.products.filter(
    (p) => p.brand_code === outlet?.brand_code && p.temperature === temperature,
  );
  const items = products.filter((p) => (counts[p.id] || 0) > 0);
  const visible = orders.filter((o) => o.outlet_id === outletId);
  const order = visible.find((o) => o.id === selected);
  return (
    <div className={"manager-page brand-" + outlet?.brand_code}>
      <div className="brand-header">
        <span className="brand-rail">
          {brandLabel(outlet?.brand_code || "")}
        </span>
        <span className="badge">Store manager</span>
      </div>
      <div className="page-heading">
        <h1>
          {tab === "new" ? "Select products for delivery" : "Your deliveries"}
        </h1>
        <p>
          Receiving window {outlet?.window_start.slice(0, 5)}–
          {outlet?.window_end.slice(0, 5)} · cutoff 16:00 Colombo
        </p>
      </div>
      <label>
        Outlet
        <select
          value={outletId}
          onChange={(e) => {
            setOutlet(e.target.value);
            setTemperature("AMBIENT");
            setCounts({});
            setSelected("");
            setReview(false);
          }}
        >
          {catalog.outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <div className="tabs">
        <Button
          variant={tab === "orders" ? "default" : "outline"}
          onClick={() => setTab("orders")}
        >
          Track deliveries
        </Button>
        <Button
          variant={tab === "new" ? "default" : "outline"}
          onClick={() => {
            setTab("new");
            setReview(false);
          }}
        >
          New order
        </Button>
      </div>
      {tab === "new" ? (
        <>
          <Notice>
            Synthetic products and operating days for the judge walkthrough. The
            server applies the cutoff and next eligible day; Style uses demo
            Mondays.
          </Notice>
          <label>
            Requested operating day
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              {catalog.operatingDays
                .filter((d) => d.demo)
                .map((d) => (
                  <option key={d.day}>{d.day}</option>
                ))}
            </select>
          </label>
          {outlet?.brand_code === "FRESH" && (
            <div className="tabs">
              {["AMBIENT", "CHILLED", "FROZEN"].map((t) => (
                <Button
                  key={t}
                  variant={t === temperature ? "default" : "outline"}
                  onClick={() => {
                    setTemperature(t);
                    setReview(false);
                  }}
                >
                  {t.toLowerCase()}
                </Button>
              ))}
            </div>
          )}
          <label className="search-label">
            <img src="/design/2109-8-d30e6.svg" alt="" />
            <input
              placeholder="Search products"
              aria-label="Search products"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {products
            .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
            .map((p) => (
              <Panel key={p.id} className="product-row">
                <div className="product-icon">
                  <img src="/design/2109-8-6772f.svg" alt="" />
                </div>
                <div className="product-copy">
                  <h3>{p.name}</h3>
                  <p>
                    {p.weight_kg} kg · {p.volume_m3} m³ per unit
                  </p>
                  <small>
                    {p.temperature === "AMBIENT"
                      ? outlet?.brand_code === "TECH"
                        ? "Fragile · keep upright · inspect packaging"
                        : "Keep dry"
                      : `${p.min_c} to ${p.max_c}°C · separate temperature load`}
                  </small>
                </div>
                <Counter
                  label={p.name}
                  value={counts[p.id] || 0}
                  max={100000}
                  onChange={(v) => {
                    setCounts({ ...counts, [p.id]: v });
                    setReview(false);
                  }}
                />
              </Panel>
            ))}
          {review && (
            <Panel>
              <h2>Review delivery request</h2>
              {items.map((p) => (
                <p key={p.id}>
                  {p.name} · {counts[p.id]} units
                </p>
              ))}
              <p>
                {items
                  .reduce((n, p) => n + p.weight_kg * counts[p.id], 0)
                  .toFixed(1)}{" "}
                kg ·{" "}
                {items
                  .reduce((n, p) => n + p.volume_m3 * counts[p.id], 0)
                  .toFixed(2)}{" "}
                m³
              </p>
              <p>
                Requested {day} · {temperature.toLowerCase()}
              </p>
            </Panel>
          )}
          <div className="sticky-action">
            <small>
              {items.length} products selected · temperatures stay separate
            </small>
            <Button
              disabled={!items.length || busy || !navigator.onLine}
              onClick={async () => {
                if (!review) {
                  setReview(true);
                  return;
                }
                const saved = await action("/orders", {
                  outletId,
                  day,
                  items: items.map((p) => ({
                    productId: p.id,
                    quantity: counts[p.id],
                  })),
                });
                if (saved) {
                  setCounts({});
                  setReview(false);
                  setTab("orders");
                }
              }}
            >
              {review ? "Place order" : "Review order"} <ArrowRight size={18} />
            </Button>
          </div>
        </>
      ) : (
        <>
          <OrderChooser
            orders={visible}
            selected={selected}
            onSelect={setSelected}
          />
          {order && (
            <>
              <Timeline order={order} />
              <Notice>{order.schedule_reason}</Notice>
              {order.deferrals.map((d, i) => (
                <Notice key={i} tone="warning">
                  Deferred: {d.reason} · next eligible {d.next_day}. Decision
                  retained in the timeline.
                </Notice>
              ))}
              {order.status === "DELIVERED" && (
                <Receipt
                  key={order.id + ":" + order.version}
                  order={order}
                  action={action}
                  busy={busy}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
function Receipt({
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
  orders,
  vehicles,
  catalog,
  conflicts,
  action,
  busy,
}: {
  orders: Order[];
  vehicles: Vehicle[];
  catalog: Catalog;
  conflicts: Conflict[];
  action: Action;
  busy: boolean;
}) {
  const [selected, setSelected] = useState(""),
    [vehicleId, setVehicle] = useState("DEMO-DRY"),
    [reason, setReason] = useState(""),
    [trip, setTrip] = useState(1),
    [departure, setDeparture] = useState("05:30"),
    [back, setBack] = useState("07:30"),
    [fuel, setFuel] = useState(10),
    [nextDay, setNextDay] = useState("");
  const order = orders.find((o) => o.id === selected),
    vehicle = vehicles.find((v) => v.id === vehicleId);
  const kg = order?.lines.reduce((n, l) => n + l.ordered * l.weight_kg, 0) || 0,
    m3 = order?.lines.reduce((n, l) => n + l.ordered * l.volume_m3, 0) || 0;
  return (
    <>
      <div className="page-heading">
        <p>Operations / Planning</p>
        <h1>Plan the next handoff</h1>
        <p>
          Review capacity, preserve exceptions and publish an assigned load.
        </p>
      </div>
      <div className="metrics">
        {[
          ["Orders", orders.length],
          [
            "Awaiting plan",
            orders.filter((o) => o.status === "RECEIVED").length,
          ],
          [
            "Loading holds",
            orders.filter(
              (o) =>
                o.status === "LOADING" &&
                o.loadingIssues.length &&
                !o.run?.partial_approved_by,
            ).length,
          ],
          ["Conflicts", conflicts.filter((c) => c.state === "OPEN").length],
        ].map(([label, value]) => (
          <Panel key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </Panel>
        ))}
      </div>
      <div className="planning-grid">
        <Panel>
          <h2>Order queue</h2>
          <OrderChooser
            orders={orders}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              setReason("");
              setNextDay("");
              const o = orders.find((x) => x.id === id);
              setDeparture(o?.brand_code === "FRESH" ? "05:30" : "09:00");
              setBack(o?.brand_code === "FRESH" ? "07:30" : "11:00");
            }}
          />
        </Panel>
        <div>
          {order ? (
            <>
              <Panel>
                <div className="section-title">
                  <h2>{order.outlet_name}</h2>
                  <span className="badge">
                    {statusLabel(order.status)} · v{order.version}
                  </span>
                </div>
                <p>
                  {order.day} · {order.temperature.toLowerCase()} ·{" "}
                  {order.access === "VAN_ONLY"
                    ? "Van access only"
                    : "Truck or van access"}
                </p>
                <p>
                  Receiving window {order.window_start.slice(0, 5)}–
                  {order.window_end.slice(0, 5)}
                </p>
                {order.lines.map((l) => (
                  <p key={l.id}>
                    {l.name} · {l.ordered} ordered
                    {l.loaded !== null ? ` · ${l.loaded} loaded` : ""}
                  </p>
                ))}
              </Panel>
              {order.status === "RECEIVED" && (
                <Panel>
                  <h2>Candidate vehicle</h2>
                  <label>
                    Vehicle
                    <select
                      value={vehicleId}
                      onChange={(e) => setVehicle(e.target.value)}
                    >
                      {vehicles
                        .filter((v) => v.demo)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                            {v.refrigerated ? " · refrigerated" : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Capacity
                    label="Weight"
                    value={kg}
                    max={Number(vehicle?.weight_kg) || 1}
                    unit="kg"
                  />
                  <Capacity
                    label="Volume"
                    value={m3}
                    max={Number(vehicle?.volume_m3) || 1}
                    unit="m³"
                  />
                  <p>
                    Weekly allowance {vehicle?.weekly_fuel_l} L · server checks
                    all reservations.
                  </p>
                  <Notice tone="warning">
                    Synthetic one-stop publication. Departure and return are
                    declared reservations; road routing and arrival feasibility
                    are pending source coordinates.
                  </Notice>
                  <div className="form-grid">
                    <label>
                      Trip
                      <select
                        value={trip}
                        onChange={(e) => setTrip(Number(e.target.value))}
                      >
                        <option>1</option>
                        <option>2</option>
                      </select>
                    </label>
                    <label>
                      Declared fuel (L)
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={fuel}
                        onChange={(e) => setFuel(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      Departure · Colombo
                      <input
                        type="time"
                        value={departure}
                        onChange={(e) => setDeparture(e.target.value)}
                      />
                    </label>
                    <label>
                      Depot return · Colombo
                      <input
                        type="time"
                        value={back}
                        onChange={(e) => setBack(e.target.value)}
                      />
                    </label>
                  </div>
                  <label>
                    Publication reason
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={500}
                    />
                  </label>
                  <Button
                    disabled={busy || !reason.trim() || !navigator.onLine}
                    onClick={() =>
                      action(`/orders/${order.id}/publish`, {
                        expectedVersion: order.version,
                        vehicleId,
                        loaderId: "DEMO-LOADER",
                        trip,
                        departureAt: new Date(
                          `${order.day}T${departure}:00+05:30`,
                        ).toISOString(),
                        returnAt: new Date(
                          `${order.day}T${back}:00+05:30`,
                        ).toISOString(),
                        estimatedFuelL: fuel,
                        reason,
                      })
                    }
                  >
                    Publish assigned load
                  </Button>
                </Panel>
              )}
              {order.status === "LOADING" && order.loadingIssues.length > 0 && (
                <Panel>
                  <h2>Partial load requires a decision</h2>
                  {order.loadingIssues.map((i, n) => (
                    <p key={n}>
                      {i.quantity} units · {i.reason.toLowerCase()}
                    </p>
                  ))}
                  {order.run?.partial_approved_by ? (
                    <Notice tone="success">
                      Partial release approved · {order.run.partial_reason}
                    </Notice>
                  ) : (
                    <>
                      <label>
                        Approval reason
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          maxLength={500}
                        />
                      </label>
                      <Button
                        disabled={busy || !reason.trim()}
                        onClick={() =>
                          action(`/orders/${order.id}/approve-partial`, {
                            expectedVersion: order.version,
                            reason,
                          })
                        }
                      >
                        Approve partial release
                      </Button>
                    </>
                  )}
                </Panel>
              )}
              {!["DELIVERED", "RECEIVED_AT_STORE", "DEFERRED"].includes(
                order.status,
              ) && (
                <Panel>
                  <h2>Defer this stop</h2>
                  <label>
                    Reason
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={500}
                    />
                  </label>
                  <label>
                    Next eligible day
                    <select
                      value={nextDay}
                      onChange={(e) => setNextDay(e.target.value)}
                    >
                      <option value="">Choose operating day</option>
                      {catalog.operatingDays
                        .filter((d) => d.demo && d.day > order.day)
                        .map((d) => (
                          <option key={d.day}>{d.day}</option>
                        ))}
                    </select>
                  </label>
                  <Button
                    variant="outline"
                    disabled={busy || !reason.trim() || !nextDay}
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
                </Panel>
              )}
              <Timeline order={order} />
            </>
          ) : (
            <Panel>
              Select an order to review its physical requirements and handoffs.
            </Panel>
          )}
        </div>
        <div>
          <Panel>
            <h2>Operating policies</h2>
            <p>Both kg and m³ capacity must pass.</p>
            <p>
              Fresh chilled and frozen loads stay separate. A compatible
              refrigerated setpoint is required.
            </p>
            <p>
              At most two trips, with a synthetic 30-minute reload allowance.
            </p>
            <p>
              Protected Tech handling and mall access carry into loading and
              receiving.
            </p>
          </Panel>
          <Panel>
            <h2>Conflict review</h2>
            {conflicts.length === 0 ? (
              <p>No delivery conflicts.</p>
            ) : (
              conflicts.map((c) => (
                <div className="conflict-row" key={c.id}>
                  <strong>
                    {c.order_id.slice(0, 8)} · {c.state.toLowerCase()}
                  </strong>
                  <p>Local proof and server decision are retained.</p>
                  <a
                    href={`/api/v1/sync-conflicts/${c.id}/evidence`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View retained evidence
                  </a>
                  {c.state === "OPEN" && (
                    <>
                      <label>
                        Resolution reason
                        <textarea
                          maxLength={500}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </label>
                      <Button
                        disabled={busy || !reason.trim()}
                        onClick={() =>
                          action(`/sync-conflicts/${c.id}/resolve`, {
                            expectedVersion: orders.find(
                              (o) => o.id === c.order_id,
                            )?.version,
                            acceptDelivery: true,
                            reason,
                          })
                        }
                      >
                        Accept verified delivery
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy || !reason.trim()}
                        onClick={() =>
                          action(`/sync-conflicts/${c.id}/resolve`, {
                            expectedVersion: orders.find(
                              (o) => o.id === c.order_id,
                            )?.version,
                            acceptDelivery: false,
                            reason,
                          })
                        }
                      >
                        Keep server decision
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
    </>
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
  orders,
  action,
  busy,
}: {
  orders: Order[];
  action: Action;
  busy: boolean;
}) {
  const [selected, setSelected] = useState("");
  const order = orders.find((o) => o.id === selected);
  return (
    <>
      <div className="page-heading">
        <p>Dock / Assigned loading</p>
        <h1>Load the assigned delivery</h1>
        <p>
          Count what physically enters the vehicle. Keep missing and damaged
          quantities visible.
        </p>
      </div>
      <OrderChooser
        orders={orders}
        selected={selected}
        onSelect={setSelected}
      />
      {order && (
        <>
          <LoadingForm
            key={order.id + ":" + order.version}
            order={order}
            action={action}
            busy={busy}
          />
          <Timeline order={order} />
        </>
      )}
    </>
  );
}
function LoadingForm({
  order,
  action,
  busy,
}: {
  order: Order;
  action: Action;
  busy: boolean;
}) {
  const [counts, setCounts] = useState(
      Object.fromEntries(order.lines.map((l) => [l.id, l.loaded ?? l.ordered])),
    ),
    [reason, setReason] = useState("NONE");
  const shortage = order.lines.reduce(
    (n, l) => n + l.ordered - counts[l.id],
    0,
  );
  const kg = order.lines.reduce((n, l) => n + counts[l.id] * l.weight_kg, 0),
    m3 = order.lines.reduce((n, l) => n + counts[l.id] * l.volume_m3, 0);
  return (
    <div className="loading-grid">
      <div>
        <Panel>
          <h2>
            {order.run?.vehicle_name} · plan v{order.run?.plan_version}
          </h2>
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
          One stop in this milestone. Multi-stop reverse loading is pending
          routing integration.
        </p>
        <p>Departure locks the loading record.</p>
      </Panel>
    </div>
  );
}
export function Driver({
  account,
  orders,
  action,
  busy,
  onSaved,
}: {
  account: Account;
  orders: Order[];
  action: Action;
  busy: boolean;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState(""),
    [outbox, setOutbox] = useState<OutboxAction[]>([]);
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
  const order = orders.find((o) => o.id === selected),
    saved = outbox.find(
      (a) => a.entityId === selected && a.syncState !== "rejected",
    );
  return (
    <>
      <div className="page-heading">
        <h1>Your assigned deliveries</h1>
        <p>{account.depot} · acknowledge the released plan before departure.</p>
      </div>
      <OrderChooser
        orders={orders}
        selected={selected}
        onSelect={setSelected}
      />
      {order && (
        <>
          <Panel>
            <h2>{order.outlet_name}</h2>
            <p>
              {order.run?.vehicle_name} · {order.temperature.toLowerCase()} ·
              plan v{order.run?.plan_version}
            </p>
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
                  Record arrival when safely stopped. Road navigation and live
                  tracking are pending.
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
          {order.status === "ARRIVED" && !saved && (
            <DeliveryForm
              key={order.id + ":" + order.version}
              account={account}
              order={order}
              onSaved={onSaved}
            />
          )}
          <Timeline order={order} />
        </>
      )}
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
                {a.entityId.slice(0, 8)} ·{" "}
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
  const [counts, setCounts] = useState(
      Object.fromEntries(order.lines.map((l) => [l.id, l.loaded || 0])),
    ),
    [issue, setIssue] = useState(""),
    [file, setFile] = useState<File>(),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
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
            onChange={(v) => setCounts({ ...counts, [l.id]: v })}
          />
        </Panel>
      ))}
      <Panel>
        <label>
          Delivery issue
          <select value={issue} onChange={(e) => setIssue(e.target.value)}>
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
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </label>
        {file && (
          <p>
            {file.name} · {(file.size / 1024).toFixed(0)} KB selected
          </p>
        )}
        <small>
          Photo evidence is retained with this action. Receiver signatures are
          pending.
        </small>
      </Panel>
      {error && <Notice tone="critical">{error}</Notice>}
      <div className="sticky-action">
        <small>Saved locally before any confirmation</small>
        <Button
          disabled={saving || !file || (short && !issue)}
          onClick={async () => {
            setSaving(true);
            setError("");
            try {
              await saveProof(account, order, counts, issue, file!);
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
