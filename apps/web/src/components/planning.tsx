import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui/button";

interface QueueOrder {
  id: string;
  source_ref: string;
  outlet_name: string;
  brand_code: string;
  district: string;
  temperature: string;
  status: string;
  version: number;
  weight_kg: number;
  volume_m3: number;
  service_minutes: number;
  window_start: string;
  window_end: string;
  deferred_yesterday: boolean;
  days_since_last_served: number;
  consecutive_skips: number;
}
interface Vehicle {
  id: string;
  weight_kg: number;
  volume_m3: number;
  kind: string;
  refrigerated: boolean;
}
interface Stop {
  orderId: string;
  expectedVersion: number;
}
interface Trip {
  existingTripId: string | null;
  vehicleId: string;
  trip: number;
  loaderId: string;
  departureAt: string;
  stops: Stop[];
}
interface Deferred {
  orderId: string;
  expectedVersion: number;
  reason: string;
  nextDay: string;
}
interface Plan {
  day: string;
  expectedPlanVersion: number;
  trips: Trip[];
  deferred: Deferred[];
  reason: string;
}
interface Metrics {
  vehicleId: string;
  trip: number;
  weightKg: number;
  volumeM3: number;
  capacityKg: number;
  capacityM3: number;
  distanceKm: number;
  fuelL: number;
  returnAt: string;
  bookletMinutes: number;
  stops: {
    orderId: string;
    sequence: number;
    loadingSequence: number;
    arrivalAt: string;
    serviceStart: string;
    serviceEnd: string;
  }[];
}
interface Validation {
  valid: boolean;
  failures: { code: string; message: string; subject: string }[];
  trips: Metrics[];
}
interface Context {
  version: number;
  orders: QueueOrder[];
  vehicles: Vehicle[];
  trips: {
    id: string;
    vehicle_id: string;
    trip: number;
    loader_id: string;
    departure_at: string;
    stops: { order_id: string; version: number; status: string }[];
  }[];
  coordinatePolicy: string;
}
const time = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Colombo",
    hour: "2-digit",
    minute: "2-digit",
  });

export function PlanningBoard() {
  const judgeRefs = [
    "S1-000",
    "S1-004",
    "S1-002",
    "S1-001",
    "S1-023",
    "S1-024",
    "S1-025",
    "S1-078",
  ];
  const [day, setDay] = useState("2026-01-08"),
    [context, setContext] = useState<Context>(),
    [plan, setPlan] = useState<Plan>(),
    [validation, setValidation] = useState<Validation>(),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      setContext(await api<Context>(`/planning?day=${day}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    setPlan(undefined);
    setValidation(undefined);
    setSelected([]);
    void refresh();
  }, [day]);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(change: (p: Plan) => Plan) {
    if (plan) {
      setPlan(change(structuredClone(plan)));
      setValidation(undefined);
    }
  }
  function manual() {
    if (!context || !selected.length) return;
    setPlan({
      day,
      expectedPlanVersion: context.version,
      reason: "Dispatcher assisted allocation; road validation required.",
      trips: [
        {
          existingTripId: null,
          vehicleId: "VEH036",
          trip: 1,
          loaderId: "DEMO-LOADER",
          departureAt: `${day}T03:30:00+05:30`,
          stops: selected.map((id) => ({
            orderId: id,
            expectedVersion: context.orders.find((o) => o.id === id)!.version,
          })),
        },
      ],
      deferred: [],
    });
    setValidation(undefined);
  }
  const name = (id: string) => {
    const o = context?.orders.find((o) => o.id === id);
    return o ? `${o.source_ref} · ${o.outlet_name} · ${o.temperature}` : id;
  };
  return (
    <section className="panel" aria-label="Dataset multi-stop planning">
      <h2>Dataset multi-stop planning</h2>
      <label>
        Operating day{" "}
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </label>
      <p>
        Historical S1 judge simulation · plan v{context?.version ?? 0} · all
        times Asia/Colombo.
      </p>
      <p>{context?.coordinatePolicy}</p>
      {error && (
        <div role="alert" className="notice critical">
          {error}
        </div>
      )}
      <div className="button-row">
        <Button
          disabled={
            busy ||
            judgeRefs.some(
              (ref) =>
                !context?.orders.some(
                  (o) => o.source_ref === ref && o.status === "RECEIVED",
                ),
            )
          }
          onClick={() =>
            void run(async () => {
              const result = await api<{ plan: Plan; validation: Validation }>(
                "/planning/propose",
                {
                  day,
                  orderIds: context!.orders
                    .filter((o) => judgeRefs.includes(o.source_ref))
                    .map((o) => o.id),
                },
              );
              setPlan(result.plan);
              setValidation(result.validation);
            })
          }
        >
          Propose judge scenario
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await api<{ plan: Plan; validation: Validation }>(
                "/planning/propose",
                { day, orderIds: selected },
              );
              setPlan(result.plan);
              setValidation(result.validation);
            })
          }
        >
          Propose{" "}
          {selected.length
            ? `${selected.length} selected orders`
            : "all unallocated orders"}
        </Button>
        <Button disabled={busy || !selected.length} onClick={manual}>
          Assign selected manually
        </Button>
        <Button disabled={busy} onClick={() => void refresh()}>
          Refresh queue
        </Button>
      </div>
      <details open>
        <summary>Orders queue ({context?.orders.length ?? 0})</summary>
        <div style={{ overflowX: "auto", maxHeight: 360 }}>
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>Order / outlet</th>
                <th>Group</th>
                <th>Demand</th>
                <th>Window / service</th>
                <th>History</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {context?.orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${o.source_ref}`}
                      disabled={o.status !== "RECEIVED"}
                      checked={selected.includes(o.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, o.id]
                            : selected.filter((id) => id !== o.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    {o.source_ref}
                    <br />
                    {o.outlet_name}
                    <br />
                    {o.temperature}
                  </td>
                  <td>
                    {o.brand_code} / {o.district}
                  </td>
                  <td>
                    {o.weight_kg.toFixed(1)} kg
                    <br />
                    {o.volume_m3.toFixed(3)} m³
                  </td>
                  <td>
                    {o.window_start}–{o.window_end}
                    <br />
                    {o.service_minutes} min unloading
                  </td>
                  <td>
                    {o.deferred_yesterday
                      ? "Skipped previous day"
                      : "No previous-day skip"}
                    <br />
                    {o.days_since_last_served} days since service
                    <br />
                    {o.consecutive_skips} consecutive skips
                  </td>
                  <td>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {plan && (
        <>
          <label>
            Publication reason{" "}
            <input
              value={plan.reason}
              onChange={(e) => edit((p) => ({ ...p, reason: e.target.value }))}
            />
          </label>
          <Button
            disabled={busy}
            onClick={() =>
              edit((p) => {
                p.trips.push({
                  existingTripId: null,
                  vehicleId: "VEH036",
                  trip: 2,
                  loaderId: "DEMO-LOADER",
                  departureAt: `${day}T06:30:00+05:30`,
                  stops: [],
                });
                return p;
              })
            }
          >
            Add trip for manual transfer
          </Button>
          {plan.trips.map((trip, index) => {
            const metric = validation?.trips[index];
            return (
              <article className="panel" key={index}>
                <h3>Trip {index + 1}</h3>
                <label>
                  Vehicle{" "}
                  <select
                    aria-label="Vehicle"
                    value={trip.vehicleId}
                    onChange={(e) =>
                      edit((p) => {
                        p.trips[index].vehicleId = e.target.value;
                        return p;
                      })
                    }
                  >
                    {context?.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.id} · {v.kind} ·{" "}
                        {v.refrigerated ? "refrigerated" : "dry"} ·{" "}
                        {v.weight_kg} kg / {v.volume_m3} m³
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Daily route slot{" "}
                  <select
                    value={trip.trip}
                    onChange={(e) =>
                      edit((p) => {
                        p.trips[index].trip = Number(e.target.value);
                        return p;
                      })
                    }
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                  </select>
                </label>
                <label>
                  Departure (Colombo){" "}
                  <input
                    type="time"
                    value={time(trip.departureAt)}
                    onChange={(e) =>
                      edit((p) => {
                        p.trips[index].departureAt =
                          `${day}T${e.target.value}:00+05:30`;
                        return p;
                      })
                    }
                  />
                </label>
                {metric && (
                  <>
                    <p>
                      {metric.weightKg.toFixed(1)} / {metric.capacityKg} kg{" "}
                      <progress
                        aria-label="Weight capacity"
                        value={metric.weightKg}
                        max={metric.capacityKg}
                      />
                    </p>
                    <p>
                      {metric.volumeM3.toFixed(3)} / {metric.capacityM3} m³{" "}
                      <progress
                        aria-label="Volume capacity"
                        value={metric.volumeM3}
                        max={metric.capacityM3}
                      />
                    </p>
                    <p>
                      {metric.distanceKm.toFixed(1)} road km ·{" "}
                      {metric.fuelL.toFixed(2)} litres · return{" "}
                      {time(metric.returnAt)} · booklet budget{" "}
                      {metric.bookletMinutes} min
                    </p>
                  </>
                )}
                <ol>
                  {trip.stops.map((stop, position) => {
                    const schedule = metric?.stops[position];
                    return (
                      <li key={stop.orderId}>
                        {name(stop.orderId)}
                        <p>
                          Load position {trip.stops.length - position}
                          {schedule &&
                            ` · arrive ${time(schedule.arrivalAt)} · unload ${time(schedule.serviceStart)}–${time(schedule.serviceEnd)}`}
                        </p>
                        <Button
                          disabled={position === 0 || busy}
                          onClick={() =>
                            edit((p) => {
                              const s = p.trips[index].stops;
                              [s[position - 1], s[position]] = [
                                s[position],
                                s[position - 1],
                              ];
                              return p;
                            })
                          }
                        >
                          Move earlier
                        </Button>
                        <Button
                          disabled={position === trip.stops.length - 1 || busy}
                          onClick={() =>
                            edit((p) => {
                              const s = p.trips[index].stops;
                              [s[position + 1], s[position]] = [
                                s[position],
                                s[position + 1],
                              ];
                              return p;
                            })
                          }
                        >
                          Move later
                        </Button>
                        <Button
                          disabled={busy || !!trip.existingTripId}
                          onClick={() =>
                            edit((p) => {
                              const removed = p.trips[index].stops.splice(
                                position,
                                1,
                              )[0];
                              const next = new Date(day + "T12:00:00Z");
                              next.setUTCDate(next.getUTCDate() + 1);
                              p.deferred.push({
                                ...removed,
                                reason:
                                  "Dispatcher deferral: explain capacity, timing or access and the next action.",
                                nextDay: next.toISOString().slice(0, 10),
                              });
                              p.trips = p.trips.filter((t) => t.stops.length);
                              return p;
                            })
                          }
                        >
                          Defer this order
                        </Button>
                        <label>
                          Move to trip{" "}
                          <select
                            value={index}
                            onChange={(e) =>
                              edit((p) => {
                                const target = Number(e.target.value);
                                p.trips[target].stops.push(
                                  ...p.trips[index].stops.splice(position, 1),
                                );
                                p.trips = p.trips.filter((t) => t.stops.length);
                                return p;
                              })
                            }
                          >
                            {plan.trips.map((_, i) => (
                              <option key={i} value={i}>
                                {i + 1}
                              </option>
                            ))}
                          </select>
                        </label>
                      </li>
                    );
                  })}
                </ol>
              </article>
            );
          })}
          <h3>Deferred orders ({plan.deferred.length})</h3>
          {plan.deferred.map((d, i) => (
            <div key={d.orderId}>
              <strong>{name(d.orderId)}</strong>
              <label>
                Actionable reason{" "}
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
                Next operating day{" "}
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
          ))}
          {validation?.failures.map((f, i) => (
            <p className="notice critical" key={i}>
              {f.code} · {f.message} · {name(f.subject)}
            </p>
          ))}
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () =>
                setValidation(
                  await api<Validation>("/planning/validate", plan),
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
                await api("/planning/publish", plan);
                setPlan(undefined);
                setValidation(undefined);
                setSelected([]);
                await refresh();
              })
            }
          >
            Publish validated plan
          </Button>
        </>
      )}
      {context?.trips.map((t) => (
        <p key={t.id}>
          {t.vehicle_id} route {t.trip} · {t.id}{" "}
          <Button
            disabled={busy || t.stops.some((s) => s.status !== "SCHEDULED")}
            onClick={() => {
              setPlan({
                day,
                expectedPlanVersion: context.version,
                reason: "Dispatcher reorders an untouched published manifest.",
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
              setValidation(undefined);
            }}
          >
            Adjust untouched manifest
          </Button>
        </p>
      ))}
    </section>
  );
}
