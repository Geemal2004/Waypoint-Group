import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Catalog, Order } from "../lib/models";
import {
  Panel,
  Counter,
  Notice,
  Timeline,
  Receipt,
  brandLabel,
  statusLabel,
} from "./operations";
import { Button } from "./ui/button";
import { IssueConversation } from "./live-operations";
import {
  ArrowUpRight,
  Home,
  PackagePlus,
  Truck,
  History,
  Package,
  Clock3,
  CheckCircle2,
} from "lucide-react";
type Action = (path: string, body: unknown) => Promise<boolean>;
type Draft = {
  id: string;
  version: number;
  outlet_id: string;
  day: string;
  items: { productId: string; quantity: number }[];
};
export function StoreWorkspace({
  operatingDay,
  catalog,
  orders,
  action,
  busy,
}: {
  operatingDay?: string;
  catalog: Catalog;
  orders: Order[];
  action: Action;
  busy: boolean;
}) {
  const client = useQueryClient();
  const [outletId, setOutlet] = useState(
      catalog.outlets.find((o) => !o.demo)?.id || catalog.outlets[0]?.id || "",
    ),
    [tab, setTab] = useState("home"),
    [selected, setSelected] = useState(""),
    [temperature, setTemperature] = useState("AMBIENT"),
    [search, setSearch] = useState(""),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [review, setReview] = useState(false),
    [draftsByTemp, setDraftsByTemp] = useState<Record<string, Draft | null>>(
      {},
    ),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [reason, setReason] = useState(""),
    [amending, setAmending] = useState(false);
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const [day, setDay] = useState(
    catalog.operatingDays.find((d) => d.day > today)?.day || "",
  );
  const drafts = useQuery({
    queryKey: ["store-drafts"],
    queryFn: () => api<Draft[]>("/drafts"),
    enabled: navigator.onLine,
  });
  const outlet = catalog.outlets.find((o) => o.id === outletId),
    brand = outlet?.brand_code || "FRESH";
  useEffect(() => {
    document.documentElement.dataset.storeBrand = brand;
    return () => {
      delete document.documentElement.dataset.storeBrand;
    };
  }, [brand]);
  const products = catalog.products.filter(
      (p) =>
        (p.catalog_enabled ?? p.demo) &&
        p.brand_code === brand &&
        p.temperature === temperature,
    ),
    items = products.filter((p) => (counts[p.id] || 0) > 0);
  const visible = orders.filter((o) => o.outlet_id === outletId),
    active = visible.filter(
      (o) =>
        (!operatingDay || o.day === operatingDay) &&
        !["RECEIVED_AT_STORE", "CANCELLED"].includes(o.status),
    ),
    order = visible.find((o) => o.id === selected);
  const draft = draftsByTemp[temperature] || null;
  useEffect(() => {
    setDraftsByTemp({});
    setCounts({});
    setReview(false);
    setSelected("");
    setAmending(false);
    setTemperature("AMBIENT");
    setTab("home");
  }, [outletId]);
  const perform = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await fn();
      void client.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    const saved = await api<Draft>("/drafts", {
      id: draft?.id || null,
      expectedVersion: draft?.version || 0,
      outletId,
      day,
      items: items.map((p) => ({ productId: p.id, quantity: counts[p.id] })),
    });
    setDraftsByTemp((prev) => ({ ...prev, [temperature]: saved }));
    return saved;
  };
  const change = (operation: string) =>
    action(`/orders/${selected}/commands`, {
      commandId: crypto.randomUUID(),
      expectedVersion: order!.version,
      operation,
      reason,
      day: order!.day,
      items: items.map((p) => ({ productId: p.id, quantity: counts[p.id] })),
    });
  const open = (o: Order) => {
    setSelected(o.id);
    setTab(o.status === "DELIVERED" ? "receipt" : "tracking");
    setReason("");
    setAmending(false);
  };
  return (
    <div className={`manager-page store-workspace brand-${brand} task-${tab}`}>
      <div className="store-brand-header">
        <div>
          <span className="store-eyebrow">SHOP OWNER WORKSPACE</span>
          <span className="brand-rail">{brandLabel(brand)}</span>
        </div>
        <span className="badge">Store operations</span>
      </div>
      <div className="store-inner">
        <div className="store-toolbar">
          <label>
            Outlet
            <select
              aria-label="Outlet"
              value={outletId}
              onChange={(e) => setOutlet(e.target.value)}
            >
              {catalog.outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <nav className="role-tabs" aria-label="Store tasks">
            {[
              { id: "home", label: "Home", icon: Home },
              { id: "new", label: "New order", icon: PackagePlus },
              { id: "tracking", label: "Tracking", icon: Truck },
              { id: "history", label: "History", icon: History },
            ].map(({ id: t, label, icon: Icon }) => (
              <Button
                key={t}
                variant={tab === t ? "default" : "outline"}
                aria-current={
                  tab === t || (t === "tracking" && tab === "receipt")
                    ? "page"
                    : undefined
                }
                onClick={() => {
                  setTab(t);
                  setAmending(false);
                }}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </Button>
            ))}
          </nav>
        </div>
        {error && <Notice tone="critical">{error}</Notice>}
        {message && <Notice tone="success">{message}</Notice>}
        {tab === "new" || amending ? (
          <>
            <div className="page-heading">
              <h1>
                {review
                  ? "Review your delivery request"
                  : amending
                    ? "Amend this delivery"
                    : "Select products for delivery"}
              </h1>
              <p>
                {outlet?.name} ·{" "}
                {brand === "STYLE"
                  ? "mall receiving"
                  : brand === "TECH"
                    ? "protected delivery"
                    : "separate dry and cold loads"}
              </p>
            </div>
            <label>
              Requested operating day
              <select
                value={amending ? order?.day : day}
                disabled={amending}
                onChange={(e) => {
                  setDay(e.target.value);
                  setReview(false);
                }}
              >
                {catalog.operatingDays
                  .filter(
                    (d) => d.day >= today || (amending && d.day === order?.day),
                  )
                  .map((d) => (
                    <option key={d.day}>{d.day}</option>
                  ))}
              </select>
            </label>
            {!amending && brand === "FRESH" && (
              <div className="tabs">
                {[
                  ["AMBIENT", "Dry"],
                  ["CHILLED", "Chilled"],
                  ["FROZEN", "Frozen"],
                ].map(([t, label]) => (
                  <Button
                    key={t}
                    variant={temperature === t ? "default" : "outline"}
                    onClick={() => {
                      setTemperature(t);
                      setReview(false);
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            )}
            {!review && (
              <>
                <label className="search-label">
                  <img src="/design/2109-8-d30e6.svg" alt="" />
                  <input
                    aria-label="Search products"
                    value={search}
                    placeholder={
                      brand === "TECH"
                        ? "Search protected goods"
                        : "Search products"
                    }
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <div className="store-catalog-layout">
                  <div className="store-grid">
                    {products
                      .filter((p) =>
                        p.name.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((p) => (
                        <Panel key={p.id} className="product-row">
                          <div className="product-icon">
                            <img src="/design/2109-8-6772f.svg" alt="" />
                          </div>
                          <div className="product-copy">
                            <h3>{p.name}</h3>
                            <p>
                              {p.unit || "unit"} · {p.weight_kg} kg ·{" "}
                              {p.volume_m3} m³ each
                            </p>
                            <small>
                              {p.handling ||
                                "Follow the declared handling requirements"}
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
                  </div>
                  <aside
                    className="store-selection panel"
                    aria-label="Current order summary"
                  >
                    <span className="store-eyebrow">YOUR DELIVERY REQUEST</span>
                    <h2>Order summary</h2>
                    <p className="muted">
                      {day || "Choose an operating day"} ·{" "}
                      {temperature.toLowerCase()}
                    </p>
                    {items.length ? (
                      <ul>
                        {items.map((p) => (
                          <li key={p.id}>
                            <span>{p.name}</span>
                            <strong>
                              {counts[p.id]} {p.unit || "units"}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        Select quantities from the catalogue to build your
                        delivery request.
                      </p>
                    )}
                    <dl className="store-totals">
                      <div>
                        <dt>Product lines</dt>
                        <dd>{items.length}</dd>
                      </div>
                      <div>
                        <dt>Total weight</dt>
                        <dd>
                          {items
                            .reduce(
                              (n, p) => n + counts[p.id] * Number(p.weight_kg),
                              0,
                            )
                            .toFixed(1)}{" "}
                          kg
                        </dd>
                      </div>
                      <div>
                        <dt>Total volume</dt>
                        <dd>
                          {items
                            .reduce(
                              (n, p) => n + counts[p.id] * Number(p.volume_m3),
                              0,
                            )
                            .toFixed(2)}{" "}
                          m³
                        </dd>
                      </div>
                    </dl>
                    <p className="muted">
                      Review your selection before submitting it to dispatch.
                    </p>
                  </aside>
                </div>
                {products.length > 0 &&
                  !products.some((p) =>
                    p.name.toLowerCase().includes(search.toLowerCase()),
                  ) && (
                    <Notice>
                      No products match “{search}”. Try another search.
                    </Notice>
                  )}
                {!products.length && (
                  <Notice>
                    No reviewed catalogue products are available for this load.
                    Ask dispatch to provision products; source aggregate demand
                    cannot be ordered as a retail SKU.
                  </Notice>
                )}
              </>
            )}
            {review && (
              <Panel>
                <h2>
                  {temperature === "AMBIENT"
                    ? "Dry"
                    : temperature.toLowerCase()}{" "}
                  delivery
                </h2>
                {items.map((p) => (
                  <p key={p.id}>
                    {p.name} · {counts[p.id]} {p.unit || "units"}
                  </p>
                ))}
                <p>
                  {items
                    .reduce((n, p) => n + counts[p.id] * Number(p.weight_kg), 0)
                    .toFixed(1)}{" "}
                  kg ·{" "}
                  {items
                    .reduce((n, p) => n + counts[p.id] * Number(p.volume_m3), 0)
                    .toFixed(2)}{" "}
                  m³
                </p>
                <p>
                  Receiving {outlet?.window_start.slice(0, 5)}–
                  {outlet?.window_end.slice(0, 5)} ·{" "}
                  {outlet?.access === "VAN_ONLY"
                    ? "Van only"
                    : "Truck or van access"}
                </p>
                <p>
                  Submissions after 16:00 Colombo move to the next eligible
                  operating day. Dispatch confirms and road-validates the
                  allocation.
                </p>
                <Button variant="outline" onClick={() => setReview(false)}>
                  Edit selection
                </Button>
              </Panel>
            )}
            {items.length > 0 && (
              <details>
                <summary>Catalogue provenance</summary>
                {items.map((p) => (
                  <p key={p.id}>
                    {p.name}:{" "}
                    {p.provenance ||
                      "Supplemental judge catalogue; not verified source SKUs"}
                  </p>
                ))}
              </details>
            )}
            {amending && (
              <label>
                Amendment reason
                <textarea
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            <div className="sticky-action">
              <small>
                {items.length} products selected ·{" "}
                {review
                  ? "Review physical quantities before submission"
                  : "Dry and cold orders stay separate"}
              </small>
              <div className="tabs">
                {!amending && (
                  <Button
                    variant="outline"
                    disabled={saving || !navigator.onLine || !day}
                    onClick={() =>
                      perform(async () => {
                        await save();
                        setMessage(
                          "Draft saved to your account. It is not allocated.",
                        );
                      })
                    }
                  >
                    Save draft
                  </Button>
                )}
                <Button
                  disabled={
                    saving ||
                    busy ||
                    !items.length ||
                    !navigator.onLine ||
                    !day ||
                    (amending && !reason.trim())
                  }
                  onClick={() => {
                    if (!review) {
                      setReview(true);
                      return;
                    }
                    if (amending) {
                      void change("AMEND").then((ok) => {
                        if (ok) {
                          setAmending(false);
                          setReview(false);
                          setCounts({});
                          setMessage(
                            "Amendment accepted. Any published trip passed validation and received a new plan revision.",
                          );
                        }
                      });
                    } else
                      void perform(async () => {
                        const d = await save();
                        const submitted = await api<Order>(
                          `/drafts/${d.id}/submit`,
                          { expectedVersion: d.version },
                        );
                        setDraftsByTemp((prev) => ({
                          ...prev,
                          [temperature]: null,
                        }));
                        setCounts((prev) => {
                          const next = { ...prev };
                          for (const item of items) {
                            delete next[item.id];
                          }
                          return next;
                        });
                        setReview(false);
                        setDay(submitted.day);
                        localStorage.setItem(
                          "waypoint-operating-day",
                          submitted.day,
                        );
                        window.dispatchEvent(new Event("waypoint-day"));
                        setSelected(submitted.id);
                        setTab("tracking");
                        setMessage(
                          `Order ${submitted.reference} submitted for ${submitted.day}. Dispatch review is required.`,
                        );
                      });
                  }}
                >
                  {review
                    ? amending
                      ? "Validate and save amendment"
                      : "Submit reviewed order"
                    : "Review order"}
                </Button>
              </div>
            </div>
          </>
        ) : tab === "home" ? (
          <>
            <div className="page-heading store-home-heading">
              <div>
                <h1>Your store deliveries</h1>
                <p>
                  {outlet?.name} · receiving {outlet?.window_start.slice(0, 5)}–
                  {outlet?.window_end.slice(0, 5)}
                </p>
              </div>
              <Button onClick={() => setTab("new")}>
                <PackagePlus size={18} aria-hidden="true" />
                New order
              </Button>
            </div>
            <div className="store-summary">
              <Panel>
                <Truck
                  className="store-metric-icon"
                  size={22}
                  aria-hidden="true"
                />
                <small>Active deliveries</small>
                <strong>{active.length}</strong>
              </Panel>
              <Panel>
                <Package
                  className="store-metric-icon"
                  size={22}
                  aria-hidden="true"
                />
                <small>Receipt required</small>
                <strong>
                  {visible.filter((o) => o.status === "DELIVERED").length}
                </strong>
              </Panel>
              <Panel>
                <CheckCircle2
                  className="store-metric-icon"
                  size={22}
                  aria-hidden="true"
                />
                <small>Received deliveries</small>
                <strong>
                  {
                    visible.filter((o) => o.status === "RECEIVED_AT_STORE")
                      .length
                  }
                </strong>
              </Panel>
              <Panel>
                <Clock3
                  className="store-metric-icon"
                  size={22}
                  aria-hidden="true"
                />
                <small>Receiving window</small>
                <strong className="store-window">
                  {outlet?.window_start.slice(0, 5) || "—"}–
                  {outlet?.window_end.slice(0, 5) || "—"}
                </strong>
              </Panel>
            </div>
            <h2 className="store-section-heading">
              Upcoming deliveries <span>{active.length}</span>
            </h2>
            <div className="store-grid">
              {active
                .sort((a, b) => a.day.localeCompare(b.day))
                .map((o) => (
                  <button
                    className="order-row"
                    key={o.id}
                    onClick={() => open(o)}
                  >
                    <span>
                      <strong>
                        {o.source_ref || o.reference || o.outlet_id}
                      </strong>
                      <small>
                        {o.day} ·{" "}
                        {o.temperature === "AMBIENT"
                          ? "dry"
                          : o.temperature.toLowerCase()}
                      </small>
                    </span>
                    <span className={`badge status-${o.status}`}>
                      {o.confirmation_required && !o.confirmed_at
                        ? "Submitted"
                        : statusLabel(o.status)}
                    </span>
                    <ArrowUpRight
                      size={18}
                      className="store-order-arrow"
                      aria-hidden="true"
                    />
                  </button>
                ))}
            </div>
            {!active.length && (
              <Panel>
                No upcoming delivery. Start a new order from the reviewed
                catalogue.
              </Panel>
            )}
            <div className="store-grid">
              {(drafts.data || [])
                .filter((d) => d.outlet_id === outletId)
                .map((d) => (
                  <Panel key={d.id}>
                    <h3>Saved draft · {d.day}</h3>
                    <p>
                      {d.items.length} product lines · revision {d.version}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const temp =
                          catalog.products.find(
                            (p) => p.id === d.items[0]?.productId,
                          )?.temperature || "AMBIENT";
                        setDraftsByTemp((prev) => ({ ...prev, [temp]: d }));
                        setDay(d.day);
                        setCounts((prev) => ({
                          ...prev,
                          ...Object.fromEntries(
                            d.items.map((i) => [i.productId, i.quantity]),
                          ),
                        }));
                        setTemperature(temp);
                        setTab("new");
                        setReview(false);
                      }}
                    >
                      Resume draft
                    </Button>
                  </Panel>
                ))}
            </div>
          </>
        ) : (
          <>
            <div className="page-heading">
              <h1>
                {tab === "history"
                  ? "Delivery history"
                  : tab === "receipt"
                    ? "Confirm what you received"
                    : "Track your delivery"}
              </h1>
              <p>{outlet?.name} · shared order and handoff history</p>
            </div>
            {!order || tab === "history" ? (
              <>
                <div className="store-grid">
                  {visible
                    .filter(
                      (o) =>
                        tab === "history" ||
                        !["RECEIVED_AT_STORE", "CANCELLED"].includes(o.status),
                    )
                    .map((o) => (
                      <button
                        className="order-row"
                        key={o.id}
                        onClick={() => open(o)}
                      >
                        <span>
                          <strong>
                            {o.source_ref || o.reference || o.outlet_id}
                          </strong>
                          <small>
                            {o.day} · {o.temperature.toLowerCase()}
                          </small>
                        </span>
                        <span className={`badge status-${o.status}`}>
                          {statusLabel(o.status)}
                        </span>
                        <ArrowUpRight
                          size={18}
                          className="store-order-arrow"
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                </div>
                {!visible.length && (
                  <Panel>No deliveries recorded for this outlet.</Panel>
                )}
              </>
            ) : (
              <div className="store-detail">
                <div className="store-detail-main">
                  <Panel>
                    <h2>{order.source_ref || order.reference}</h2>
                    <span className="badge">
                      {order.confirmation_required && !order.confirmed_at
                        ? "Submitted · awaiting dispatch review"
                        : statusLabel(order.status)}
                    </span>
                    <p>
                      {order.day} ·{" "}
                      {order.temperature === "AMBIENT"
                        ? "Dry"
                        : order.temperature.toLowerCase()}{" "}
                      ·{" "}
                      {order.run
                        ? `${order.run.vehicle_id} · run ${order.run.trip} · plan v${order.run.plan_version}`
                        : "Awaiting allocation"}
                    </p>
                    <p>
                      Receiving {order.window_start.slice(0, 5)}–
                      {order.window_end.slice(0, 5)}
                    </p>
                    {order.lines.map((l) => (
                      <p key={l.id}>
                        {l.name} · {l.ordered} {l.unit || "units"} ordered
                        {l.loaded != null ? ` · ${l.loaded} loaded` : ""}
                        {l.delivered != null
                          ? ` · ${l.delivered} delivered`
                          : ""}
                      </p>
                    ))}
                    {order.schedule_reason && <p>{order.schedule_reason}</p>}
                  </Panel>
                  {order.deferrals.map((d, i) => (
                    <Notice key={i} tone="warning">
                      {d.reason} · next eligible {d.next_day} ·{" "}
                      {d.consecutive_skips} consecutive skips
                    </Notice>
                  ))}
                  {brand === "STYLE" && (
                    <Panel>
                      <h2>Mall access</h2>
                      <p>
                        {order.window_start.slice(0, 5)}–
                        {order.window_end.slice(0, 5)} outlet window
                      </p>
                      <p>
                        {order.access === "VAN_ONLY"
                          ? "Van access required."
                          : ""}{" "}
                        Use the outlet’s agreed receiving access. Gate passes
                        and dock bookings are not verified by Waypoint.
                      </p>
                    </Panel>
                  )}
                  {brand === "TECH" && (
                    <Panel>
                      <h2>Protected receiving</h2>
                      <p>
                        Inspect packaging and count each unit. Record damage
                        separately from quantities that were never loaded.
                      </p>
                    </Panel>
                  )}
                  {order.status === "DELIVERED" && (
                    <Receipt
                      key={order.id + order.version}
                      order={order}
                      action={action}
                      busy={busy}
                    />
                  )}
                  {["RECEIVED", "SCHEDULED"].includes(order.status) &&
                    !order.source_ref && (
                      <Panel>
                        <h2>Review a change</h2>
                        <label>
                          Reason
                          <textarea
                            value={reason}
                            maxLength={500}
                            onChange={(e) => setReason(e.target.value)}
                          />
                        </label>
                        <Button
                          variant="outline"
                          disabled={busy || !navigator.onLine}
                          onClick={() => {
                            setAmending(true);
                            setTemperature(order.temperature);
                            setCounts(
                              Object.fromEntries(
                                order.lines.map((l) => [
                                  l.product_id,
                                  l.ordered,
                                ]),
                              ),
                            );
                            setReview(false);
                            setDay(order.day);
                          }}
                        >
                          Amend quantities
                        </Button>
                        {order.status === "RECEIVED" && (
                          <Button
                            variant="outline"
                            disabled={
                              !reason.trim() || busy || !navigator.onLine
                            }
                            onClick={() => change("CANCEL")}
                          >
                            Cancel unallocated order
                          </Button>
                        )}
                        <p className="muted">
                          Published amendments are accepted only before any trip
                          stop begins loading and must pass all road and
                          allocation checks.
                        </p>
                      </Panel>
                    )}
                </div>
                <div className="store-detail-side">
                  <IssueConversation orderId={order.id} />
                  <details>
                    <summary>Delivery history</summary>
                    <Timeline order={order} />
                  </details>
                  <Button variant="outline" onClick={() => setSelected("")}>
                    Back to deliveries
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
