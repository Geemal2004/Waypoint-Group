import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Navigation } from "lucide-react";
import { api } from "../lib/api";
import { cachedRead } from "../lib/sync";
import type { LocationSharing } from "../lib/use-location-sharing";
import type { Account, Order } from "../lib/models";
import { RoadMap, type MapPoint, type RoadGeometry } from "./road-map";
import { Button } from "./ui/button";

type Position = {
  vehicleId: string;
  longitude: number;
  latitude: number;
  accuracy: number;
  capturedAt: string;
  receivedAt: string;
  stale?: boolean;
  simulated?: boolean;
  poorAccuracy?: boolean;
  unavailable?: boolean;
};
type Stop = {
  order_id: string;
  outlet_id: string;
  outlet_name: string;
  reference: string;
  source_ref?: string;
  sequence: number;
  status: string;
  longitude: number | null;
  latitude: number | null;
  supplemental: boolean;
  service_start_at: string;
  service_end_at: string;
};
type Trip = {
  timing?: {
    state: string;
    message: string;
    estimatedArrival?: string;
    serviceEnd?: string;
  };
  id: string;
  vehicle_id: string;
  trip: number;
  plan_version: number;
  geometry: RoadGeometry;
  stops: Stop[];
  departure_at: string;
  return_at: string;
  weight_kg: number;
  volume_m3: number;
  distance_km: number;
  fuel_l: number;
};
type FleetVehicle = {
  id: string;
  name: string;
  depot_code: string;
  kind: string;
  refrigerated: boolean;
  available: boolean;
  demo: boolean;
  driver_name: string;
  driver_phone: string | null;
  weight_kg: number;
  volume_m3: number;
  weekly_fuel_l: number;
  reserved_fuel_l: number;
  location: Position;
};
type NetworkOutlet = {
  id: string;
  name: string;
  brand_code: string;
  district: string;
  depot_code: string;
  longitude: number | null;
  latitude: number | null;
  access: string;
  window_start: string;
  window_end: string;
  demo: boolean;
  supplemental: boolean;
};
type Network = {
  vehicles: FleetVehicle[];
  outlets: NetworkOutlet[];
  depots: {
    code: string;
    name: string;
    longitude: number | null;
    latitude: number | null;
    supplemental: boolean;
  }[];
  trips: Trip[];
  serverTime: string;
};
const readable = (o: Order) => o.source_ref || o.reference || o.outlet_id;
const time = (s: string) =>
  new Date(s).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Colombo",
    hour: "2-digit",
    minute: "2-digit",
  });

export function IssueConversation({ orderId }: { orderId: string }) {
  const client = useQueryClient();
  const [body, setBody] = useState(""),
    [category, setCategory] = useState("GENERAL"),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false);
  const q = useQuery({
    queryKey: ["messages", orderId],
    queryFn: () =>
      api<
        {
          id: string;
          category: string;
          body: string;
          sender: string;
          created_at: string;
        }[]
      >(`/orders/${orderId}/messages`),
    refetchInterval: 5000,
  });
  const [command, setCommand] = useState(() => crypto.randomUUID());
  return (
    <section className="panel conversation">
      <h2>Delivery conversation</h2>
      <p>
        Share a delay, access problem or physical discrepancy with the assigned
        team.
      </p>
      {q.error && (
        <p role="alert">Messages unavailable. Reconnect to send an issue.</p>
      )}
      {q.data?.map((m) => (
        <article key={m.id}>
          <strong>
            {m.sender} · {m.category.toLowerCase()}
          </strong>
          <p>{m.body}</p>
          <small>{time(m.created_at)} Colombo</small>
        </article>
      ))}
      <label>
        Issue category
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setCommand(crypto.randomUUID());
          }}
        >
          {[
            "GENERAL",
            "DELAY",
            "ACCESS",
            "DAMAGE",
            "TEMPERATURE",
            "SHORTAGE",
          ].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Message
        <textarea
          maxLength={1000}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setCommand(crypto.randomUUID());
          }}
          placeholder="Describe what the team needs to act on"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <Button
        disabled={!body.trim() || sending || !navigator.onLine}
        onClick={async () => {
          setSending(true);
          setError("");
          try {
            await api(`/orders/${orderId}/messages`, {
              commandId: command,
              category,
              body,
            });
            setBody("");
            setCommand(crypto.randomUUID());
            void client.invalidateQueries({ queryKey: ["messages", orderId] });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSending(false);
          }
        }}
      >
        Send issue message
      </Button>
    </section>
  );
}

export function NetworkScreen({
  day,
  orders,
  fleetOnly = false,
}: {
  day: string;
  orders: Order[];
  fleetOnly?: boolean;
}) {
  const q = useQuery({
    queryKey: ["network", day],
    queryFn: () => api<Network>(`/live/network?day=${day}`),
    refetchInterval: 15000,
  });
  const [positions, setPositions] = useState<Position[]>([]),
    [depot, setDepot] = useState(""),
    [brand, setBrand] = useState(""),
    [district, setDistrict] = useState(""),
    [kind, setKind] = useState(""),
    [risk, setRisk] = useState(""),
    [runState, setRunState] = useState(""),
    [tripSelection, setTripSelection] = useState(""),
    [selection, setSelection] = useState(""),
    [includeDemo, setIncludeDemo] = useState(false),
    [showAllOutlets, setShowAllOutlets] = useState(false);
  useEffect(() => {
    const f = (e: Event) => setPositions((e as CustomEvent<Position[]>).detail);
    window.addEventListener("waypoint-locations", f);
    return () => window.removeEventListener("waypoint-locations", f);
  }, []);
  const network = q.data;
  if (!network)
    return (
      <section className="panel">
        <h1>{fleetOnly ? "Fleet overview" : "Live control"}</h1>
        <p role={q.error ? "alert" : "status"}>
          {q.error
            ? (q.error as Error).message
            : "Loading the authorized network…"}
        </p>
        <Button variant="outline" onClick={() => q.refetch()}>
          Retry network
        </Button>
      </section>
    );
  const getPosition = (v: FleetVehicle) =>
    positions.find((p) => p.vehicleId === v.id) || v.location;
  const state = (v: FleetVehicle) => {
    const p = getPosition(v);
    return !v.available
      ? "Unavailable"
      : network.trips.some(
            (t) => t.vehicle_id === v.id && t.timing?.state === "WINDOW_RISK",
          )
        ? "Window risk"
        : p.unavailable
          ? "Location unavailable"
          : !p.capturedAt
            ? "Unreported"
            : p.stale || Date.now() - Date.parse(p.capturedAt) > 90000
              ? "Stale"
              : p.accuracy > 100
                ? "Poor accuracy"
                : network.trips.some(
                      (t) =>
                        t.vehicle_id === v.id &&
                        t.stops.some((s) =>
                          ["IN_TRANSIT", "ARRIVED"].includes(s.status),
                        ),
                    )
                  ? "Active"
                  : "Idle";
  };
  const runStatus = (v: FleetVehicle) => {
    const stops = network.trips
      .filter((t) => t.vehicle_id === v.id)
      .flatMap((t) => t.stops);
    return !stops.length
      ? "Unassigned"
      : stops.some((s) => ["IN_TRANSIT", "ARRIVED"].includes(s.status))
        ? "Active"
        : stops.every((s) =>
              [
                "DELIVERED",
                "RECEIVED_AT_STORE",
                "DEFERRED",
                "CANCELLED",
              ].includes(s.status),
            )
          ? "Completed"
          : "Scheduled";
  };
  const outlets = network.outlets.filter(
    (o) =>
      (includeDemo || !o.demo) &&
      (!depot || o.depot_code === depot) &&
      (!brand || o.brand_code === brand) &&
      (!district || o.district === district),
  );
  const vehicles = network.vehicles.filter(
    (v) =>
      (includeDemo || !v.demo) &&
      (!depot || v.depot_code === depot) &&
      (!kind || v.kind === kind) &&
      (fleetOnly || !risk || state(v) === risk) &&
      (!runState || runStatus(v) === runState) &&
      (fleetOnly ||
        (!brand && !district) ||
        network.trips.some(
          (t) =>
            t.vehicle_id === v.id &&
            t.stops.some((s) => outlets.some((o) => o.id === s.outlet_id)),
        )),
  );
  const vehicle = network.vehicles.find((v) => v.id === selection),
    outlet = network.outlets.find((o) => o.id === selection),
    trip =
      network.trips.find(
        (t) =>
          t.vehicle_id === selection &&
          (tripSelection
            ? String(t.id) === tripSelection
            : t.stops.some(
                (s) =>
                  !["DELIVERED", "RECEIVED_AT_STORE", "DEFERRED"].includes(
                    s.status,
                  ),
              )),
      ) || network.trips.find((t) => t.vehicle_id === selection);
  const visibleOutlets = outlets.filter(
    (o) =>
      showAllOutlets ||
      o.id === selection ||
      (trip
        ? trip.stops.some((s) => s.outlet_id === o.id)
        : network.trips.some(
            (t) =>
              vehicles.some((v) => v.id === t.vehicle_id) &&
              t.stops.some((s) => s.outlet_id === o.id),
          )),
  );
  const points: MapPoint[] = [
    ...network.depots
      .filter(
        (d) =>
          (!depot || d.code === depot) &&
          d.longitude != null &&
          d.latitude != null,
      )
      .map((d) => ({
        id: d.code,
        label: d.name,
        longitude: Number(d.longitude),
        latitude: Number(d.latitude),
        kind: "depot" as const,
        supplemental: d.supplemental,
      })),
    ...visibleOutlets
      .filter((o) => o.longitude != null && o.latitude != null)
      .map((o) => ({
        id: o.id,
        label: o.name,
        longitude: Number(o.longitude),
        latitude: Number(o.latitude),
        kind: "outlet" as const,
        supplemental: o.supplemental,
      })),
    ...vehicles
      .filter((v) => {
        const p = getPosition(v);
        return p.longitude != null && p.latitude != null;
      })
      .map((v) => {
        const p = getPosition(v);
        return {
          id: v.id,
          label: `${v.id} · ${state(v)}${p.simulated ? " · SIMULATED" : ""}`,
          longitude: Number(p.longitude),
          latitude: Number(p.latitude),
          kind: "vehicle" as const,
          accuracy: p.accuracy,
          stale: state(v) === "Stale",
        };
      }),
  ];
  if (fleetOnly)
    return (
      <>
        <div className="page-heading design-heading">
          <p className="eyebrow">Operations / fleet</p>
          <h1>Know your available fleet</h1>
          <p>Vehicle readiness, drivers and capacity for {day} service.</p>
        </div>
        <section className="panel filter-bar">
          <label>
            Depot
            <select value={depot} onChange={(e) => setDepot(e.target.value)}>
              <option value="">All authorized depots</option>
              {network.depots.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Vehicle
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All kinds</option>
              <option>VAN</option>
              <option>TRUCK</option>
            </select>
          </label>
          <label>
            Run state
            <select
              value={runState}
              onChange={(e) => setRunState(e.target.value)}
            >
              <option value="">All run states</option>
              {["Unassigned", "Scheduled", "Active", "Completed"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={includeDemo}
              onChange={(e) => setIncludeDemo(e.target.checked)}
            />
            Include supplemental fixtures
          </label>
        </section>
        <section className="panel">
          <h2>
            {vehicles.length} vehicles ·{" "}
            {vehicles.filter((v) => v.available).length} available ·{" "}
            {vehicles.filter((v) => !v.available).length} unavailable
          </h2>
          <p className="muted">
            Availability is recorded fleet readiness. Run state shows
            assignments on the selected day.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Vehicle / depot</th>
                  <th>Readiness</th>
                  <th>Driver</th>
                  <th>Capability</th>
                  <th>Weight capacity</th>
                  <th>Volume capacity</th>
                  <th>Weekly fuel reserved / budget</th>
                  <th>Daily assignments</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.id}</strong>
                      <br />
                      {v.name}
                      <br />
                      {v.depot_code}
                    </td>
                    <td>
                      <span className="badge">
                        {v.available ? "Available" : "Unavailable"}
                      </span>
                    </td>
                    <td>{v.driver_name || "Unassigned"}</td>
                    <td>
                      {v.kind} · {v.refrigerated ? "Refrigerated" : "Dry"}
                    </td>
                    <td>{Number(v.weight_kg).toFixed(0)} kg</td>
                    <td>{Number(v.volume_m3).toFixed(1)} m³</td>
                    <td>
                      {Number(v.reserved_fuel_l).toFixed(1)} /{" "}
                      {Number(v.weekly_fuel_l).toFixed(1)} L
                    </td>
                    <td>
                      {runStatus(v)} ·{" "}
                      {
                        network.trips.filter((t) => t.vehicle_id === v.id)
                          .length
                      }{" "}
                      trips
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!vehicles.length && <p>No vehicles match these filters.</p>}
        </section>
      </>
    );
  return (
    <>
      <div className="page-heading design-heading">
        <p className="eyebrow">
          Operations / {fleetOnly ? "fleet" : "live control"}
        </p>
        <h1>
          {fleetOnly
            ? "Know your available fleet"
            : "Keep every handoff in view"}
        </h1>
        <p>
          {day} service · {network.vehicles.filter((v) => !v.demo).length}{" "}
          source vehicles · {network.outlets.filter((o) => !o.demo).length}{" "}
          source outlets
        </p>
      </div>
      <section className="panel filter-bar">
        <label>
          Depot
          <select value={depot} onChange={(e) => setDepot(e.target.value)}>
            <option value="">All authorized depots</option>
            {network.depots.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
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
        <label>
          District
          <select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
          >
            <option value="">All districts</option>
            {[...new Set(network.outlets.map((o) => o.district))]
              .sort()
              .map((d) => (
                <option key={d}>{d}</option>
              ))}
          </select>
        </label>
        <label>
          Vehicle
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All kinds</option>
            <option>VAN</option>
            <option>TRUCK</option>
          </select>
        </label>
        <label>
          Run state
          <select
            value={runState}
            onChange={(e) => setRunState(e.target.value)}
          >
            <option value="">All run states</option>
            {["Unassigned", "Scheduled", "Active", "Completed"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Reporting
          <select value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option value="">All states</option>
            {[
              "Active",
              "Idle",
              "Unreported",
              "Stale",
              "Poor accuracy",
              "Window risk",
              "Unavailable",
              "Location unavailable",
            ].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={includeDemo}
            onChange={(e) => setIncludeDemo(e.target.checked)}
          />{" "}
          Include supplemental fixtures
        </label>
      </section>
      <section className="panel">
        <h2>Delivery operations</h2>
        <p>
          {
            network.trips.filter((t) =>
              vehicles.some((v) => v.id === t.vehicle_id),
            ).length
          }{" "}
          published trips ·{" "}
          {vehicles.filter((v) => runStatus(v) === "Active").length} vehicles on
          active runs ·{" "}
          {vehicles.filter((v) => state(v) === "Window risk").length} vehicles
          with window risk
        </p>
        <label className="check-label">
          <input
            type="checkbox"
            checked={showAllOutlets}
            onChange={(e) => setShowAllOutlets(e.target.checked)}
          />
          Show all outlets on map
        </label>
        <p className="muted">
          The map focuses on published delivery outlets, or the selected
          vehicle’s trip. Use Find outlet when map pins overlap.
        </p>
        <label>
          Find outlet
          <select
            value={outlet?.id || ""}
            onChange={(e) => {
              setSelection(e.target.value);
              setTripSelection("");
            }}
          >
            <option value="">Select an outlet</option>
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {o.district}
              </option>
            ))}
          </select>
        </label>
      </section>
      <div className="network-grid">
        <section className="panel">
          <RoadMap
            points={points}
            geometry={trip?.geometry}
            onSelect={setSelection}
            label="Authorized depot, outlet and reported vehicle road map"
          />
          <p className="muted">
            Outlet pins use approximate district waypoints, not verified shop
            addresses. Zoom in or use Find outlet to distinguish nearby shops.
            Vehicles without reported coordinates remain in the fleet list.
            Planned routes use OSRM; no position or road route is inferred.
          </p>
          <div className="fleet-list">
            {vehicles.map((v) => (
              <button
                className={
                  "fleet-row" + (selection === v.id ? " selected" : "")
                }
                key={v.id}
                onClick={() => {
                  setSelection(v.id);
                  setTripSelection("");
                }}
              >
                <strong>{v.id}</strong>
                <span>
                  {v.depot_code} · {v.kind.toLowerCase()} ·{" "}
                  {v.refrigerated ? "cold" : "dry"}
                </span>
                <span className="badge">{state(v)}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="panel network-detail">
          {vehicle ? (
            <>
              <label>
                Daily trip
                <select
                  value={trip?.id || ""}
                  onChange={(e) => setTripSelection(e.target.value)}
                >
                  {network.trips
                    .filter((t) => t.vehicle_id === selection)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        Trip {t.trip} · plan v{t.plan_version}
                      </option>
                    ))}
                  {!trip && <option value="">No published trip</option>}
                </select>
              </label>
              <h2>
                {vehicle.id} · {vehicle.name}
              </h2>
              <p>
                {vehicle.driver_name} · {state(vehicle)}
              </p>
              {vehicle.driver_phone ? (
                <a className="button-link" href={`tel:${vehicle.driver_phone}`}>
                  Call assigned driver
                </a>
              ) : (
                <p className="muted">
                  No authorized driver telephone number on record.
                </p>
              )}
              <Capacity
                label="Weight"
                used={trip?.weight_kg || 0}
                max={vehicle.weight_kg}
                unit="kg"
              />
              <Capacity
                label="Volume"
                used={trip?.volume_m3 || 0}
                max={vehicle.volume_m3}
                unit="m³"
              />
              <Capacity
                label="Weekly reserved fuel"
                used={vehicle.reserved_fuel_l}
                max={vehicle.weekly_fuel_l}
                unit="L"
              />
              {getPosition(vehicle).capturedAt ? (
                <p>
                  Captured {time(getPosition(vehicle).capturedAt)} · accepted{" "}
                  {time(getPosition(vehicle).receivedAt)} · ±
                  {Math.round(getPosition(vehicle).accuracy)} m
                  {getPosition(vehicle).simulated ? " · SIMULATED" : ""}
                </p>
              ) : (
                <p>Location has not been reported.</p>
              )}
              {trip ? (
                <>
                  <h3>
                    Run {trip.trip} · plan v{trip.plan_version}
                  </h3>
                  {trip.timing && (
                    <p
                      className={
                        trip.timing.state === "WINDOW_RISK"
                          ? "notice warning"
                          : "muted"
                      }
                    >
                      {trip.timing.estimatedArrival
                        ? `Road arrival estimate ${time(trip.timing.estimatedArrival)}. `
                        : ""}
                      {trip.timing.message}
                    </p>
                  )}
                  <p>
                    {time(trip.departure_at)} departure · {time(trip.return_at)}{" "}
                    planned return · {Number(trip.distance_km).toFixed(1)} road
                    km · {Number(trip.fuel_l).toFixed(1)} L
                  </p>
                  <ol className="stop-list">
                    {trip.stops.map((s) => (
                      <li key={s.order_id}>
                        <button
                          className="text-button"
                          onClick={() => setSelection(s.outlet_id)}
                        >
                          {s.sequence}. {s.outlet_name}
                        </button>
                        <p>
                          {s.source_ref || s.reference} ·{" "}
                          {s.status.toLowerCase()} · planned{" "}
                          {time(s.service_start_at)}–{time(s.service_end_at)}
                        </p>
                        <IssueConversation orderId={s.order_id} />
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p>No published run on this operating day.</p>
              )}
            </>
          ) : outlet ? (
            <>
              <h2>{outlet.name}</h2>
              <p>
                {outlet.id} · {outlet.brand_code} · {outlet.district}
              </p>
              <p>
                {outlet.access === "VAN_ONLY"
                  ? "Van access only"
                  : "Truck or van access"}{" "}
                · receiving {outlet.window_start.slice(0, 5)}–
                {outlet.window_end.slice(0, 5)}
              </p>
              {outlet.supplemental && (
                <p className="muted">
                  Supplemental district waypoint; actual outlet coordinates are
                  unverified.
                </p>
              )}
              {orders
                .filter((o) => o.outlet_id === outlet.id && o.day === day)
                .map((o) => (
                  <article key={o.id}>
                    <h3>
                      {readable(o)} · {o.status.toLowerCase()}
                    </h3>
                    {o.deferrals.map((d, i) => (
                      <p key={i}>
                        {d.reason} · skipped {d.consecutive_skips} consecutive
                        day(s)
                      </p>
                    ))}
                    <IssueConversation orderId={o.id} />
                  </article>
                ))}
            </>
          ) : (
            <>
              <h2>Select a vehicle or outlet</h2>
              <p>
                Review assignments, reporting freshness, constraints and team
                messages.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
function Capacity({
  label,
  used,
  max,
  unit,
}: {
  label: string;
  used: number;
  max: number;
  unit: string;
}) {
  return (
    <div className="capacity">
      <p>
        {label}
        <span>
          {Number(used).toFixed(1)} / {Number(max).toFixed(1)} {unit}
        </span>
      </p>
      <progress value={used} max={max} />
    </div>
  );
}

type Journey = {
  judgeSimulatorEnabled?: boolean;
  vehicleId: string;
  destination: {
    longitude: number | null;
    latitude: number | null;
    supplemental: boolean;
  };
  trip: Partial<Trip>;
  stops: Stop[];
  location: Position;
  timing?: {
    state: string;
    message: string;
    estimatedArrival?: string;
    serviceEnd?: string;
  };
};
export function DriverJourney({
  account,
  order,
  sharing,
}: {
  account: Account;
  order: Order;
  sharing: LocationSharing;
}) {
  const { reporting, setReporting, status, setStatus, position } = sharing;
  const q = useQuery({
    queryKey: [account.id, `/orders/${order.id}/journey`],
    queryFn: () =>
      cachedRead<Journey>(account.id, `/orders/${order.id}/journey`),
    enabled: !!order.run,
    networkMode: "always",
    refetchInterval: navigator.onLine ? 15000 : false,
  });
  const journey = q.data;
  if (!journey)
    return (
      <section className="panel">
        <p>
          {q.error
            ? "Road journey unavailable. Published stop order remains below."
            : "Loading your published road journey…"}
        </p>
      </section>
    );
  const points: MapPoint[] = journey.stops
    .filter((s) => s.longitude != null && s.latitude != null)
    .map((s) => ({
      id: s.order_id,
      label: `${s.sequence}. ${s.outlet_name}`,
      longitude: Number(s.longitude),
      latitude: Number(s.latitude),
      kind: "checkpoint",
      sequence: s.sequence,
      completed: ["DELIVERED", "RECEIVED_AT_STORE"].includes(s.status),
      supplemental: s.supplemental,
    }));
  const p = position || journey.location;
  if (p?.longitude != null)
    points.push({
      id: journey.vehicleId,
      label: "Last captured vehicle location",
      longitude: p.longitude,
      latitude: p.latitude,
      kind: "vehicle",
      accuracy: p.accuracy,
      stale: Date.now() - Date.parse(p.capturedAt) > 90000,
    });
  return (
    <section className="panel driver-journey">
      <h2>Your road journey</h2>
      {journey.destination.longitude != null &&
      journey.destination.latitude != null ? (
        <a
          className="button-link driver-navigate"
          href={`https://www.google.com/maps/dir/?api=1&destination=${journey.destination.latitude},${journey.destination.longitude}&travelmode=driving`}
          target="_blank"
          rel="noreferrer"
        >
          <Navigation size={24} aria-hidden="true" />
          Navigate to this stop
        </a>
      ) : (
        <p>No destination coordinates available.</p>
      )}
      {journey.trip.geometry ? (
        <RoadMap
          points={points}
          geometry={journey.trip.geometry}
          label="Published road route and ordered delivery checkpoints"
        />
      ) : (
        <p>No road geometry exists for this legacy fixture.</p>
      )}
      {journey.timing && (
        <p
          className={
            journey.timing.state === "WINDOW_RISK" ? "notice warning" : "muted"
          }
        >
          {journey.timing.estimatedArrival
            ? `Road estimate ${time(journey.timing.estimatedArrival)} arrival · ${time(journey.timing.serviceEnd!)} service end. `
            : ""}
          {journey.timing.message}
        </p>
      )}
      {journey.destination.supplemental && (
        <small>
          Supplemental judge waypoint; confirm the actual outlet address before
          travel.
        </small>
      )}
      {["IN_TRANSIT", "ARRIVED"].includes(order.status) && (
        <>
          <div className="driver-location-row">
            <span
              className={
                "driver-chip " +
                (!reporting
                  ? "paused"
                  : position && position.accuracy > 100
                    ? "weak"
                    : "sharing")
              }
            >
              <MapPin size={20} aria-hidden="true" />
              {!reporting
                ? "Location paused"
                : position && position.accuracy > 100
                  ? "Weak GPS"
                  : "Sharing location"}
            </span>
            <Button
              variant="outline"
              onClick={() => {
                setReporting(!reporting);
                if (reporting)
                  setStatus(
                    "Reporting stopped; last accepted position will expire",
                  );
              }}
            >
              {reporting ? "Stop sharing" : "Share location"}
            </Button>
          </div>
          <p role="status" className="driver-meta">
            {status}
          </p>
          <details>
            <summary>Location details</summary>
            {p?.capturedAt && (
              <p className="muted">
                Captured {time(p.capturedAt)} · ±{Math.round(p.accuracy)} m{" "}
                {p.accuracy > 100 && "· Poor accuracy "}
                {Date.now() - Date.parse(p.capturedAt) > 90000 &&
                  "· Stale last report "}
                {p.receivedAt
                  ? `· server accepted ${time(p.receivedAt)}`
                  : "· awaiting server acceptance"}
              </p>
            )}
            <small>
              Keep this tab open. Browser background suspension can interrupt
              reporting. Only the latest position is queued in this tab; reports
              older than 15 minutes expire. Sharing also lets the app notice
              when the vehicle is moving and lock data entry.
            </small>
          </details>
        </>
      )}
      {journey.judgeSimulatorEnabled &&
        ["IN_TRANSIT", "ARRIVED"].includes(order.status) &&
        journey.destination.longitude != null && (
          <details>
            <summary>Demo location simulator</summary>
            <p>
              Send the configured supplemental destination as a SIMULATED
              position. This is not device GPS or evidence of arrival.
            </p>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await api("/location", {
                    orderId: order.id,
                    vehicleId: journey.vehicleId,
                    longitude: Number(journey.destination.longitude),
                    latitude: Number(journey.destination.latitude),
                    accuracy: 10,
                    capturedAt: new Date().toISOString(),
                    simulated: true,
                  });
                  setStatus("SIMULATED judge waypoint accepted");
                  void q.refetch();
                } catch (e) {
                  setStatus((e as Error).message);
                }
              }}
            >
              Send labelled judge position
            </Button>
          </details>
        )}
    </section>
  );
}
