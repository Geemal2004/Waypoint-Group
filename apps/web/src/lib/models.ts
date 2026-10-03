export interface Account {
  id: string;
  username: string;
  name: string;
  role: "MANAGER" | "DISPATCHER" | "LOADER" | "DRIVER";
  depot: string;
}
export interface Outlet {
  id: string;
  name: string;
  brand_code: string;
  demo: boolean;
  window_start: string;
  window_end: string;
  access: string;
}
export interface Product {
  catalog_enabled?: boolean;
  unit?: string;
  handling?: string;
  provenance?: string;
  demo: boolean;
  id: string;
  name: string;
  brand_code: string;
  temperature: string;
  weight_kg: number;
  volume_m3: number;
  min_c: number | null;
  max_c: number | null;
}
export interface Line extends Product {
  id: string;
  product_id: string;
  ordered: number;
  loaded: number | null;
  delivered: number | null;
  received: number | null;
  expected_receiving: number;
}
export interface Run {
  route_trip_id?: string | null;
  stop_id?: string;
  stop_sequence?: number;
  loading_sequence?: number;
  plan_id?: string;
  vehicle_id: string;
  vehicle_name: string;
  driver_name: string;
  capacity_kg: number;
  capacity_m3: number;
  departure_at: string;
  return_at: string;
  trip: number;
  plan_version: number;
  partial_approved_by: string | null;
  partial_reason: string | null;
}
export interface Order {
  reference?: string;
  confirmation_required?: boolean;
  confirmed_at?: string | null;
  rescheduledTo?: { id: string; reference: string; day: string }[];
  source_ref?: string;
  tripStops?: {
    stop_id: string;
    order_id: string;
    sequence: number;
    loading_sequence: number;
    outlet_id: string;
    outlet_name?: string;
    reference?: string;
    source_ref?: string;
    status: string;
    plan_version: number;
  }[];
  id: string;
  outlet_id: string;
  outlet_name: string;
  brand_code: string;
  temperature: string;
  status: string;
  version: number;
  day: string;
  demo: boolean;
  schedule_reason: string;
  access: string;
  window_start: string;
  window_end: string;
  lines: Line[];
  run: Run | null;
  loadingIssues: { quantity: number; reason: string }[];
  proof: { captured_at: string } | null;
  receipt: { issue: string } | null;
  deferrals: { reason: string; next_day: string; consecutive_skips: number }[];
  timeline: { event: string; details: string; accepted_at: string }[];
}
export interface Catalog {
  outlets: Outlet[];
  products: Product[];
  operatingDays: { day: string; demo: boolean }[];
}
export interface Vehicle {
  id: string;
  name: string;
  demo: boolean;
  kind: string;
  refrigerated: boolean;
  weight_kg: number;
  volume_m3: number;
  weekly_fuel_l: number;
  available: boolean;
}
export interface Conflict {
  current_version: number;
  id: string;
  order_id: string;
  state: string;
  reason: string;
  captured_at: string;
}
