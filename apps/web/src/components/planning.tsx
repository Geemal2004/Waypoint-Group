import { useEffect, useState } from "react";
import { api } from "../lib/api";

export interface QueueOrder {
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
export interface Vehicle {
  id: string;
  weight_kg: number;
  volume_m3: number;
  kind: string;
  refrigerated: boolean;
}
export interface Stop {
  orderId: string;
  expectedVersion: number;
}
export interface Trip {
  existingTripId: string | null;
  vehicleId: string;
  trip: number;
  loaderId: string;
  departureAt: string;
  stops: Stop[];
}
export interface Deferred {
  orderId: string;
  expectedVersion: number;
  reason: string;
  nextDay: string;
}
export interface Plan {
  day: string;
  expectedPlanVersion: number;
  trips: Trip[];
  deferred: Deferred[];
  reason: string;
}
export interface Metrics {
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
  geometry: { type: "LineString"; coordinates: number[][] };
  stops: {
    orderId: string;
    sequence: number;
    loadingSequence: number;
    arrivalAt: string;
    serviceStart: string;
    serviceEnd: string;
  }[];
}
export interface Validation {
  valid: boolean;
  failures: { code: string; message: string; subject: string }[];
  trips: Metrics[];
}
export interface Context {
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

export function usePlanningBoard(day: string) {
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
  const [context, setContext] = useState<Context>(),
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
  return {
    day,
    context,
    plan,
    setPlan,
    validation,
    setValidation,
    selected,
    setSelected,
    error,
    busy,
    refresh,
    run,
    edit,
    manual,
    name,
    judgeRefs,
  };
}
