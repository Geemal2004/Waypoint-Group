import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Route,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { usePlanningBoard, type Plan, type Validation } from "./planning";
import { RoadMap } from "./road-map";
import { Button } from "./ui/button";
import { api } from "../lib/api";
import { brandLabel, statusLabel } from "./operations";
const time = (s: string) =>
  new Date(s).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Colombo",
    hour: "2-digit",
    minute: "2-digit",
  });
export function PlanningBoard({ day = "2026-01-08" }: { day?: string }) {
  const m = usePlanningBoard(day);
  const [search, setSearch] = useState(""),
    [brand, setBrand] = useState(""),
    [active, setActive] = useState(0),
    [showAll, setShowAll] = useState(false);
  const { context, plan, validation, selected, busy, edit, run } = m;
  const trip = plan?.trips[active],
    metric = validation?.trips[active];
  const queue =
    context?.orders.filter(
      (o) =>
        (showAll ||
          (o.status === "RECEIVED" &&
            (!o.confirmation_required || !!o.confirmed_at))) &&
        (!brand || o.brand_code === brand) &&
        `${o.source_ref || o.reference} ${o.outlet_name} ${o.district}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  async function propose(judge = false) {
    await run(async () => {
      const result = await api<{ plan: Plan; validation: Validation }>(
        "/planning/propose",
        {
          day,
          orderIds: judge
            ? context!.orders
                .filter((o) => m.judgeRefs.includes(o.source_ref))
                .map((o) => o.id)
            : selected,
        },
      );
      m.setPlan(result.plan);
      m.setValidation(result.validation);
      setActive(0);
    });
  }
  function move(position: number, direction: number) {
    edit((p) => {
      const stops = p.trips[active].stops;
      [stops[position], stops[position + direction]] = [
        stops[position + direction],
        stops[position],
      ];
      return p;
    });
  }
  return (
    <section
      className="planning-product"
      aria-label="Dataset multi-stop planning"
      data-figma-node="2292:45"
    >
      <div className="metrics compact-metrics">
        {[
          [
            "Assigned now",
            plan?.trips.reduce((n, t) => n + t.stops.length, 0) || 0,
            "in this draft",
          ],
          [
            "Needs a plan",
            context?.orders.filter((o) => o.status === "RECEIVED").length || 0,
            "whole orders",
          ],
          ["Deferred", plan?.deferred.length || 0, "reason and next day"],
          [
            "Constraint failures",
            validation?.failures.length || 0,
            validation?.valid
              ? "All checks pass"
              : "Validate before publishing",
          ],
        ].map(([label, n, detail]) => (
          <div className="panel metric-card" key={label}>
            <small>{label}</small>
            <div>
              <strong>{n}</strong>
              <span>{detail}</span>
            </div>
          </div>
        ))}
      </div>
      {m.error && (
        <div className="notice critical" role="alert">
          <strong>Planning could not finish</strong>
          <p>{m.error}</p>
          <small>
            No assignments were published. Refresh the current version, check
            the service, or adjust the proposal.
          </small>
        </div>
      )}
      <div className="planning-toolbar">
        <div>
          <h2>Assignment workspace</h2>
          <small>
            Plan v{context?.version ?? 0} · {day} · Asia/Colombo
          </small>
        </div>
        <div className="button-row">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void m.refresh()}
          >
            Refresh queue
          </Button>
          <Button
            variant="outline"
            disabled={
              busy ||
              m.judgeRefs.some(
                (ref) =>
                  !context?.orders.some(
                    (o) => o.source_ref === ref && o.status === "RECEIVED",
                  ),
              )
            }
            onClick={() => void propose(true)}
          >
            Propose judge scenario
          </Button>
          <Button disabled={busy || !context} onClick={() => void propose()}>
            Propose{" "}
            {selected.length
              ? `${selected.length} selected orders`
              : "all unallocated orders"}
          </Button>
        </div>
      </div>
      <div className="assignment-workspace">
        <section className="panel planning-orders">
          <div className="section-title">
            <h3>Confirmed orders</h3>
            <span className="badge">{queue.length} ready</span>
          </div>
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="Search planning orders"
              placeholder="Search store, order or district"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-row">
            <select
              aria-label="Brand filter"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              <option value="">All brands</option>
              {["FRESH", "STYLE", "TECH"].map((b) => (
                <option key={b} value={b}>
                  {brandLabel(b)}
                </option>
              ))}
            </select>
            <button
              className="text-button"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Active only" : "Include assigned"}
            </button>
          </div>
          <div className="table-scroll">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Order / delivery window</th>
                  <th>Demand</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((o) => (
                  <tr
                    key={o.id}
                    className={`brand-${o.brand_code} ${selected.includes(o.id) ? "selected" : ""}`}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${o.source_ref || o.reference}`}
                        disabled={
                          o.status !== "RECEIVED" ||
                          (!!o.confirmation_required && !o.confirmed_at)
                        }
                        checked={selected.includes(o.id)}
                        onChange={(e) =>
                          m.setSelected(
                            e.target.checked
                              ? [...selected, o.id]
                              : selected.filter((id) => id !== o.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <strong>{o.outlet_name}</strong>
                      <small>
                        {o.source_ref || o.reference} ·{" "}
                        {o.temperature.toLowerCase()}
                      </small>
                      <small>
                        {o.window_start.slice(0, 5)}–{o.window_end.slice(0, 5)}{" "}
                        · {o.service_minutes} min unloading
                      </small>
                      <small>
                        {o.consecutive_skips} consecutive skips ·{" "}
                        {o.days_since_last_served} days since service
                      </small>
                      {o.status !== "RECEIVED" && (
                        <span className="badge">{statusLabel(o.status)}</span>
                      )}
                    </td>
                    <td>
                      {o.weight_kg.toFixed(1)} kg
                      <small>{o.volume_m3.toFixed(3)} m³</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!context ? (
              <p role="status" className="empty-state">
                Loading planning orders…
              </p>
            ) : !queue.length ? (
              <p className="empty-state">
                No matching orders. Change filters or review published work.
              </p>
            ) : null}
          </div>
          <div className="panel-foot">
            <span>{selected.length} selected</span>
            <Button
              disabled={busy || !selected.length}
              onClick={() => {
                m.manual();
                setActive(0);
              }}
            >
              Assign selected manually
            </Button>
          </div>
        </section>
        <section className="panel trip-workspace">
          <div className="section-title">
            <h3>Vehicle run assignments</h3>
            <span className="badge">{plan?.trips.length || 0} draft trips</span>
          </div>
          <p className="subtle-text">
            Assignment → validation → publication. Changes require a fresh
            check.
          </p>
          <div className="trip-scroll">
            {plan?.trips.map((t, i) => {
              const first = context?.orders.find(
                  (o) => o.id === t.stops[0]?.orderId,
                ),
                v = context?.vehicles.find((v) => v.id === t.vehicleId),
                stats = validation?.trips[i];
              const kg = t.stops.reduce(
                  (n, s) =>
                    n +
                    (context?.orders.find((o) => o.id === s.orderId)
                      ?.weight_kg || 0),
                  0,
                ),
                volume = t.stops.reduce(
                  (n, s) =>
                    n +
                    (context?.orders.find((o) => o.id === s.orderId)
                      ?.volume_m3 || 0),
                  0,
                );
              return (
                <button
                  key={i}
                  className={`trip-card brand-${first?.brand_code || "FRESH"} ${active === i ? "selected" : ""}`}
                  onClick={() => setActive(i)}
                >
                  <div className="section-title">
                    <strong>
                      {brandLabel(first?.brand_code || "")}{" "}
                      {first?.temperature.toLowerCase()} · Run {i + 1}
                    </strong>
                    <Truck size={17} />
                  </div>
                  <small>
                    {t.vehicleId} · route slot {t.trip} · {t.stops.length} stops
                  </small>
                  <div className="utilization">
                    <span>
                      {v ? Math.round((kg / v.weight_kg) * 100) : 0}% weight
                    </span>
                    <span>
                      {v ? Math.round((volume / v.volume_m3) * 100) : 0}% volume
                    </span>
                  </div>
                  <p className="stop-path">
                    {t.stops
                      .map(
                        (s) =>
                          context?.orders.find((o) => o.id === s.orderId)
                            ?.outlet_name,
                      )
                      .join(" → ")}
                  </p>
                  <span className={`badge ${stats ? "" : "offline"}`}>
                    {stats && validation?.valid
                      ? "All checks pass"
                      : "Needs validation"}
                  </span>
                </button>
              );
            })}
            {!plan && (
              <div className="empty-state">
                <Route size={32} />
                <h3>Build tomorrow’s handoffs</h3>
                <p>
                  Select compatible orders and assign manually, or request an
                  assisted proposal.
                </p>
              </div>
            )}
          </div>
          {plan && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                edit((p) => {
                  p.trips.push({
                    existingTripId: null,
                    vehicleId: context?.vehicles[0]?.id || "",
                    trip: 2,
                    loaderId: "DEMO-LOADER",
                    departureAt: `${day}T06:30:00+05:30`,
                    stops: [],
                  });
                  setActive(p.trips.length - 1);
                  return p;
                })
              }
            >
              Add trip for manual transfer
            </Button>
          )}
          {!!context?.trips.length && (
            <details className="published-plans">
              <summary>Published runs ({context.trips.length})</summary>
              {context.trips.map((t) => (
                <div className="published-run" key={t.id}>
                  <span>
                    <strong>
                      {t.vehicle_id} · route {t.trip}
                    </strong>
                    <small>
                      {t.stops.length} stops · {time(t.departure_at)}
                    </small>
                  </span>
                  <Button
                    variant="outline"
                    disabled={
                      busy || t.stops.some((s) => s.status !== "SCHEDULED")
                    }
                    onClick={() => {
                      m.setPlan({
                        day,
                        expectedPlanVersion: context.version,
                        reason:
                          "Dispatcher updates an untouched published manifest.",
                        deferred: [],
                        trips: [
                          {
                            existingTripId: t.id,
                            vehicleId: t.vehicle_id,
                            trip: t.trip,
                            loaderId: t.loader_id,
                            departureAt: t.departure_at,
                            stops: t.stops.map((s) => ({
                              orderId: s.order_id,
                              expectedVersion: s.version,
                            })),
                          },
                        ],
                      });
                      m.setValidation(undefined);
                      setActive(0);
                    }}
                  >
                    Adjust untouched manifest
                  </Button>
                </div>
              ))}
            </details>
          )}
        </section>
        <section className="panel selected-trip">
          <div className="section-title">
            <h3>Selected run</h3>
            <ShieldCheck size={18} />
          </div>
          {trip ? (
            <>
              <div className="trip-settings">
                <label>
                  Vehicle
                  <select
                    aria-label="Vehicle"
                    value={trip.vehicleId}
                    disabled={!!trip.existingTripId}
                    onChange={(e) =>
                      edit((p) => {
                        p.trips[active].vehicleId = e.target.value;
                        return p;
                      })
                    }
                  >
                    {context?.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.id} · {v.kind} ·{" "}
                        {v.refrigerated ? "refrigerated" : "dry"}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    Daily route slot
                    <select
                      value={trip.trip}
                      disabled={!!trip.existingTripId}
                      onChange={(e) =>
                        edit((p) => {
                          p.trips[active].trip = Number(e.target.value);
                          return p;
                        })
                      }
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                    </select>
                  </label>
                  <label>
                    Departure (Colombo)
                    <input
                      type="time"
                      value={time(trip.departureAt)}
                      onChange={(e) =>
                        edit((p) => {
                          p.trips[active].departureAt =
                            `${day}T${e.target.value}:00+05:30`;
                          return p;
                        })
                      }
                    />
                  </label>
                </div>
              </div>
              {metric && (
                <>
                  <div className="capacity-bar">
                    <div>
                      <span>Weight</span>
                      <strong>
                        {metric.weightKg.toFixed(1)} / {metric.capacityKg} kg
                      </strong>
                    </div>
                    <progress
                      aria-label="Weight capacity"
                      value={metric.weightKg}
                      max={metric.capacityKg}
                    />
                  </div>
                  <div className="capacity-bar">
                    <div>
                      <span>Volume</span>
                      <strong>
                        {metric.volumeM3.toFixed(3)} / {metric.capacityM3} m³
                      </strong>
                    </div>
                    <progress
                      aria-label="Volume capacity"
                      value={metric.volumeM3}
                      max={metric.capacityM3}
                    />
                  </div>
                  <RoadMap
                    points={metric.stops.flatMap((s) => {
                      const o = context?.orders.find((o) => o.id === s.orderId);
                      return o && o.longitude != null && o.latitude != null
                        ? [
                            {
                              id: o.id,
                              label: o.outlet_name,
                              longitude: Number(o.longitude),
                              latitude: Number(o.latitude),
                              kind: "checkpoint" as const,
                              sequence: s.sequence,
                              supplemental: o.supplemental,
                            },
                          ]
                        : [];
                    })}
                    geometry={metric.geometry}
                    label="Selected trip road route"
                  />
                  <div className="route-facts">
                    <span>{metric.distanceKm.toFixed(1)} road km</span>
                    <span>{metric.fuelL.toFixed(2)} L fuel</span>
                    <span>Depot return {time(metric.returnAt)}</span>
                    <span>{metric.bookletMinutes} min budget</span>
                  </div>
                </>
              )}
              <ol className="ordered-checkpoints">
                {trip.stops.map((s, position) => {
                  const o = context?.orders.find((o) => o.id === s.orderId),
                    schedule = metric?.stops[position];
                  return (
                    <li key={s.orderId}>
                      <span className="checkpoint-number">{position + 1}</span>
                      <div>
                        <strong>{o?.outlet_name}</strong>
                        <small>
                          {o?.source_ref || o?.reference} · load position{" "}
                          {trip.stops.length - position}
                        </small>
                        <small>
                          {schedule
                            ? `Arrive ${time(schedule.arrivalAt)} · unload ${time(schedule.serviceStart)}–${time(schedule.serviceEnd)}`
                            : `Window ${o?.window_start.slice(0, 5)}–${o?.window_end.slice(0, 5)}`}
                        </small>
                        <div className="stop-actions">
                          <button
                            aria-label="Move earlier"
                            disabled={!position || busy}
                            onClick={() => move(position, -1)}
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button
                            aria-label="Move later"
                            disabled={
                              position === trip.stops.length - 1 || busy
                            }
                            onClick={() => move(position, 1)}
                          >
                            <ArrowDown size={16} />
                          </button>
                          <button
                            disabled={busy || !!trip.existingTripId}
                            onClick={() =>
                              edit((p) => {
                                const removed = p.trips[active].stops.splice(
                                    position,
                                    1,
                                  )[0],
                                  next = new Date(day + "T12:00:00Z");
                                next.setUTCDate(next.getUTCDate() + 1);
                                p.deferred.push({
                                  ...removed,
                                  reason:
                                    "Explain the constraint and the next action.",
                                  nextDay: next.toISOString().slice(0, 10),
                                });
                                return p;
                              })
                            }
                          >
                            Defer this order
                          </button>
                        </div>
                        {plan &&
                          plan.trips.length > 1 &&
                          !trip.existingTripId && (
                            <label>
                              Move to trip
                              <select
                                value={active}
                                onChange={(e) =>
                                  edit((p) => {
                                    p.trips[Number(e.target.value)].stops.push(
                                      ...p.trips[active].stops.splice(
                                        position,
                                        1,
                                      ),
                                    );
                                    return p;
                                  })
                                }
                              >
                                {plan.trips.map((_, i) => (
                                  <option key={i} value={i}>
                                    Run {i + 1}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <p className="empty-state">
              Select a draft trip to inspect its stops, route and constraints.
            </p>
          )}
          {validation?.failures.map((f, i) => (
            <div className="notice critical" key={i}>
              <strong>{f.code.replaceAll("_", " ")}</strong>
              <p>{f.message}</p>
              <small>{m.name(f.subject)}</small>
            </div>
          ))}
        </section>
      </div>
      {plan && (
        <>
          <section className="deferred-draft">
            <h3>Deferred orders ({plan.deferred.length})</h3>
            {plan.deferred.map((d, i) => (
              <div className="panel" key={d.orderId}>
                <strong>{m.name(d.orderId)}</strong>
                <div className="form-grid">
                  <label>
                    Actionable reason
                    <input
                      value={d.reason}
                      onChange={(e) =>
                        edit((p) => {
                          p.deferred[i].reason = e.target.value;
                          return p;
                        })
                      }
                    />
                  </label>
                  <label>
                    Next operating day
                    <input
                      type="date"
                      value={d.nextDay}
                      onChange={(e) =>
                        edit((p) => {
                          p.deferred[i].nextDay = e.target.value;
                          return p;
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ))}
          </section>
          {validation?.valid && (
            <section className="panel" aria-label="Publication review">
              <h3>Before publication</h3>
              <p>
                {plan.trips.length} trips ·{" "}
                {plan.trips.reduce((n, t) => n + t.stops.length, 0)} assigned
                orders · {plan.deferred.length} deferred orders · new plan
                version {plan.expectedPlanVersion + 1}
              </p>
              <p>
                The loader, driver and authorized stores will see this version
                and its stop order. Loading follows reverse delivery order.
                Delivery proof and store receipt remain separate.
              </p>
              <ul>
                {plan.trips.map((t, i) => (
                  <li key={i}>
                    <strong>
                      {t.vehicleId} · route {t.trip}
                    </strong>{" "}
                    · depart {time(t.departureAt)} · return{" "}
                    {time(validation.trips[i].returnAt)} ·{" "}
                    {validation.trips[i].fuelL.toFixed(2)} L
                    <ol>
                      {t.stops.map((s) => (
                        <li key={s.orderId}>{m.name(s.orderId)}</li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
              {!!plan.deferred.length && (
                <p>
                  Deferred orders keep their recorded reasons and skip history.
                  Their requested next days do not reserve a feasible trip;
                  review them for allocation on that day.
                </p>
              )}
              <small>
                Spring checks the current versions and every constraint again
                when you publish. Any edit requires validation again.
              </small>
            </section>
          )}
          <div className="planning-action-bar">
            <label>
              Publication reason
              <input
                value={plan.reason}
                onChange={(e) =>
                  edit((p) => ({ ...p, reason: e.target.value }))
                }
              />
            </label>
            <div className="button-row">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () =>
                    m.setValidation(
                      await (async () => {
                        const normalized = {
                          ...plan,
                          trips: plan.trips.filter((t) => t.stops.length),
                        };
                        m.setPlan(normalized);
                        setActive(0);
                        return api<Validation>(
                          "/planning/validate",
                          normalized,
                        );
                      })(),
                    ),
                  )
                }
              >
                Validate road routes
              </Button>
              <Button
                disabled={busy || !validation?.valid}
                onClick={() =>
                  void run(async () => {
                    await api("/planning/publish", {
                      ...plan,
                      trips: plan.trips.filter((t) => t.stops.length),
                    });
                    m.setPlan(undefined);
                    m.setValidation(undefined);
                    m.setSelected([]);
                    await m.refresh();
                  })
                }
              >
                <CheckCircle2 size={17} />
                Publish validated plan
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
