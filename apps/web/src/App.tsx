import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Moon,
  Sun,
  LogOut,
  ClipboardList,
  Truck,
  PackageCheck,
  Store,
  WifiOff,
  Route,
  Radio,
  Clock3,
  Settings2,
  Info,
} from "lucide-react";
import { api, ApiError, refreshCsrf } from "./lib/api";
import { useLiveUpdates } from "./lib/live";
import {
  cachedAccount,
  cachedRead,
  forgetAccount,
  rememberAccount,
  syncProofs,
} from "./lib/sync";
import type { Account, Catalog, Conflict, Order, Vehicle } from "./lib/models";
import { offlineDb } from "./lib/offline-db";
import { Button } from "./components/ui/button";
import {
  Dispatcher,
  Driver,
  Loader,
  Manager,
  Notice,
} from "./components/operations";

export function App() {
  const [account, setAccount] = useState<Account | null>(null),
    [starting, setStarting] = useState(true),
    [online, setOnline] = useState(navigator.onLine),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [screen, setScreen] = useState("planning"),
    [operatingDay, setOperatingDay] = useState(
      localStorage.getItem("waypoint-operating-day") || "2026-01-08",
    ),
    [demoInformation, setDemoInformation] = useState(false),
    [night, setNight] = useState(
      localStorage.getItem("waypoint-theme") === "night",
    );
  const client = useQueryClient();
  const liveState = useLiveUpdates(account);
  useEffect(() => {
    const changed = () =>
      setOperatingDay(
        localStorage.getItem("waypoint-operating-day") || "2026-01-08",
      );
    window.addEventListener("waypoint-day", changed);
    window.addEventListener("storage", changed);
    return () => {
      window.removeEventListener("waypoint-day", changed);
      window.removeEventListener("storage", changed);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = night ? "night" : "day";
    localStorage.setItem("waypoint-theme", night ? "night" : "day");
  }, [night]);
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine);
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    let live = true;
    const recover = async () => {
      try {
        const a = navigator.onLine
          ? await api<Account>("/auth/me")
          : await cachedAccount();
        if (live) {
          if (a) await rememberAccount(a);
          setAccount(a);
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) forgetAccount();
        else if (live)
          setError(
            "Unable to reach the service. Your saved proof remains on this device.",
          );
      } finally {
        if (live) setStarting(false);
      }
    };
    void recover();
    return () => {
      live = false;
      window.removeEventListener("online", changed);
      window.removeEventListener("offline", changed);
    };
  }, []);
  useEffect(() => {
    if (!account) return;
    const run = async () => {
      await syncProofs(account.id);
      if (navigator.onLine)
        void client.invalidateQueries({ queryKey: [account.id, "/orders"] });
    };
    void run();
    const timer = setInterval(run, 10000);
    window.addEventListener("online", run);
    window.addEventListener("waypoint-operations", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", run);
      window.removeEventListener("waypoint-operations", run);
    };
  }, [account, client]);
  useEffect(() => {
    const changed = async (event: StorageEvent) => {
      if (event.key !== "waypoint-active-account") return;
      client.clear();
      setAccount(null);
      setError("");
      setStarting(true);
      try {
        const next = event.newValue
          ? navigator.onLine
            ? await api<Account>("/auth/me")
            : await cachedAccount()
          : null;
        if (next) {
          if (navigator.onLine) await refreshCsrf();
          await rememberAccount(next);
        }
        setAccount(next);
      } catch {
        forgetAccount();
        setError("Account changed in another tab. Sign in to continue.");
      } finally {
        setStarting(false);
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [client]);
  const orders = useQuery({
    queryKey: [account?.id, "/orders"],
    queryFn: () => cachedRead<Order[]>(account!.id, "/orders"),
    enabled: !!account,
    refetchInterval: online ? 5000 : false,
    refetchIntervalInBackground: true,
    networkMode: "always",
  });
  const catalog = useQuery({
    queryKey: [account?.id, "/catalog"],
    queryFn: () => cachedRead<Catalog>(account!.id, "/catalog"),
    enabled: !!account,
    networkMode: "always",
  });
  const vehicles = useQuery({
    queryKey: [account?.id, "/vehicles"],
    queryFn: () => cachedRead<Vehicle[]>(account!.id, "/vehicles"),
    enabled: account?.role === "DISPATCHER",
    networkMode: "always",
  });
  const conflicts = useQuery({
    queryKey: [account?.id, "/sync-conflicts"],
    queryFn: () => cachedRead<Conflict[]>(account!.id, "/sync-conflicts"),
    enabled: account?.role === "DISPATCHER",
    refetchInterval: online ? 5000 : false,
    refetchIntervalInBackground: true,
    networkMode: "always",
  });
  const queryError =
    orders.error || catalog.error || vehicles.error || conflicts.error;
  const [lastSaved, setLastSaved] = useState("");
  useEffect(() => {
    let live = true;
    if (account)
      void offlineDb.cache.get(account.id + ":/orders").then((c) => {
        if (live) setLastSaved(c?.savedAt || "");
      });
    return () => {
      live = false;
    };
  }, [account, orders.dataUpdatedAt]);
  useEffect(() => {
    if (
      account &&
      online &&
      queryError instanceof ApiError &&
      queryError.status === 401
    ) {
      forgetAccount();
      client.clear();
      setAccount(null);
      setError(
        "Your session expired. Sign in again; saved evidence remains on this device.",
      );
    }
  }, [account, online, queryError, client]);
  async function action(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, body);
      await client.invalidateQueries({ queryKey: [account?.id] });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save this action.");
      await client.invalidateQueries({ queryKey: [account?.id] });
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/logout", {});
      forgetAccount();
      client.clear();
      setAccount(null);
      await refreshCsrf();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Reconnect to sign out securely.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (starting)
    return (
      <main className="login-page">
        <p role="status">Opening your operations workspace…</p>
      </main>
    );
  if (!account)
    return (
      <Login
        error={error}
        onLogin={async (a) => {
          await rememberAccount(a);
          client.clear();
          setAccount(a);
          setError("");
        }}
      />
    );
  const avatar =
    account.role === "DISPATCHER"
      ? "/design/2091-23-0fd08.png"
      : account.role === "LOADER"
        ? "/design/2104-5-d79df.png"
        : account.role === "DRIVER"
          ? "/design/2289-25-5d950.png"
          : "/design/2109-8-4f471.png";
  const Icon =
    account.role === "DISPATCHER"
      ? ClipboardList
      : account.role === "LOADER"
        ? PackageCheck
        : account.role === "DRIVER"
          ? Truck
          : Store;
  return (
    <div className={"app-shell role-" + account.role}>
      {account.role === "DISPATCHER" && (
        <aside className="sidebar">
          <div className="wordmark">
            WAYPOINT
            <br />
            <span>GROUP OPS</span>
          </div>
          <nav aria-label="Operations navigation">
            {[
              ["orders", "Orders / cutoff", ClipboardList],
              ["planning", "Planning", Route],
              ["live", "Live control", Radio],
              ["fleet", "Fleet overview", Truck],
              ["deferrals", "Deferrals", Clock3],
              ["administration", "Administration", Settings2],
              ["history", "History", Clock3],
            ].map(([key, label, ItemIcon]) => {
              const NavIcon = ItemIcon as typeof Route;
              return (
                <button
                  key={String(key)}
                  className={`nav-item ${screen === key ? "active" : ""}`}
                  aria-current={screen === key ? "page" : undefined}
                  onClick={() => setScreen(String(key))}
                >
                  <NavIcon size={17} />
                  {String(label)}
                </button>
              );
            })}
          </nav>
          <div className="sidebar-account">
            <img src={avatar} alt="" />
            <span>
              {account.name}
              <small>{account.depot}</small>
            </span>
          </div>
        </aside>
      )}
      <div className="workspace">
        <header className="app-header">
          <div>
            <strong>WAYPOINT</strong>
            <span>
              <Icon size={15} />
              {account.role === "MANAGER"
                ? "Store"
                : account.role.toLowerCase()}{" "}
              · {account.depot}
            </span>
          </div>
          <div className="header-actions">
            {account.role === "DISPATCHER" && (
              <span className="live-state" role="status">
                Updates: {liveState}
              </span>
            )}
            <button
              className="demo-indicator"
              onClick={() => setDemoInformation(true)}
            >
              <Info size={14} />
              Demo
            </button>
            <span className={"badge " + (!online ? "offline" : "")}>
              {online ? (
                "Online"
              ) : (
                <>
                  <WifiOff size={13} /> Offline
                </>
              )}
            </span>
            <button
              className="icon-button"
              aria-label={night ? "Use day theme" : "Use night theme"}
              onClick={() => setNight(!night)}
            >
              {night ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <img className="avatar" src={avatar} alt="" />
            <button
              className="icon-button"
              aria-label="Sign out"
              disabled={busy || !online}
              onClick={logout}
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main className="page-content">
          {
            <div className="day-toolbar">
              <span>Operating day · Asia/Colombo</span>
              <input
                aria-label="Operating day"
                type="date"
                value={operatingDay}
                onChange={(e) => {
                  setOperatingDay(e.target.value);
                  localStorage.setItem(
                    "waypoint-operating-day",
                    e.target.value,
                  );
                }}
              />
            </div>
          }
          {demoInformation && (
            <div className="modal-backdrop">
              <section
                className="panel demo-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="demo-title"
              >
                <div className="section-title">
                  <h2 id="demo-title">Demo information</h2>
                  <Button
                    variant="outline"
                    onClick={() => setDemoInformation(false)}
                  >
                    Close
                  </Button>
                </div>
                <p>
                  Waypoint judge environment. S1 is an undated source scenario
                  replayed on 8 January 2026; operating times use Asia/Colombo.
                  Capture and audit timestamps use actual demonstration time.
                </p>
                <p>
                  Source quantities, capacities, windows and identifiers are
                  retained. District-town road waypoints and 2–5°C judge cold
                  capabilities are supplemental, not verified outlet geography
                  or certified fleet capabilities.
                </p>
                <p>
                  OSRM provides car-profile road geometry and travel estimates.
                  There is no live traffic, truck clearance model or
                  straight-line fallback. Forecasting remains deferred to the
                  Datathon.
                </p>
                <p>
                  October catalogue and workflow fixtures are explicitly
                  supplemental. The named retailer examples are not customer or
                  integration claims.
                </p>
                <p>
                  Evidence is scoped to your account. Signing out preserves
                  pending proof on this device; browser storage is not a backup.
                </p>
              </section>
            </div>
          )}
          {!online && (
            <Notice tone="warning">
              Showing your last saved assignments
              {lastSaved
                ? ` · ${new Date(lastSaved).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })} Colombo`
                : ""}
              . Online handoffs require reconnection; captured proof can be
              saved on this device.
            </Notice>
          )}
          {(error || queryError) && (
            <div role="alert">
              <Notice tone="critical">
                {error || queryError?.message}
                <Button
                  variant="outline"
                  onClick={() => {
                    setError("");
                    void client.invalidateQueries({ queryKey: [account.id] });
                  }}
                >
                  Refresh current state
                </Button>
              </Notice>
            </div>
          )}
          {orders.isPending || catalog.isPending ? (
            <p role="status">Loading assigned operations…</p>
          ) : orders.data && catalog.data ? (
            <>
              {account.role === "MANAGER" && (
                <Manager
                  operatingDay={operatingDay}
                  catalog={catalog.data}
                  orders={orders.data}
                  action={action}
                  busy={busy}
                />
              )}
              {account.role === "DISPATCHER" && (
                <Dispatcher
                  screen={screen}
                  day={operatingDay}
                  orders={orders.data}
                  vehicles={vehicles.data || []}
                  catalog={catalog.data}
                  conflicts={conflicts.data || []}
                  action={action}
                  busy={busy}
                />
              )}
              {account.role === "LOADER" && (
                <Loader
                  day={operatingDay}
                  orders={orders.data}
                  action={action}
                  busy={busy}
                />
              )}
              {account.role === "DRIVER" && (
                <Driver
                  day={operatingDay}
                  account={account}
                  orders={orders.data}
                  action={action}
                  busy={busy}
                  onSaved={() => {
                    void client.invalidateQueries({ queryKey: [account.id] });
                  }}
                />
              )}
            </>
          ) : null}
          <Retention account={account} />
        </main>
      </div>
    </div>
  );
}
function Retention({ account }: { account: Account }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    const read = async () => {
      const records = await offlineDb.outbox
        .where("accountId")
        .equals(account.id)
        .toArray();
      if (live)
        setCount(records.filter((a) => a.syncState !== "synced").length);
    };
    void read();
    const timer = setInterval(read, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [account.id]);
  return (
    <footer className="retention">
      {count > 0 ? `${count} proof record(s) await sync or review. ` : ""}
      Signing out retains account-scoped evidence on this device. Sign in with
      the same account to resume. Times use Asia/Colombo.
    </footer>
  );
}
const DEMO_ROLES: {
  role: Account["role"];
  title: string;
  detail: string;
  Icon: typeof Store;
}[] = [
  {
    role: "MANAGER",
    title: "Store manager",
    detail: "Waypoint Fresh · Waypoint Style · Waypoint Tech",
    Icon: Store,
  },
  {
    role: "DISPATCHER",
    title: "Dispatcher",
    detail: "Orders, planning, live control and fleet",
    Icon: ClipboardList,
  },
  {
    role: "LOADER",
    title: "Loader",
    detail: "Pick, stage and hand over loads",
    Icon: PackageCheck,
  },
  {
    role: "DRIVER",
    title: "Driver",
    detail: "Journey, delivery proof and handoffs",
    Icon: Truck,
  },
];
function Login({
  error,
  onLogin,
}: {
  error: string;
  onLogin: (account: Account) => Promise<void>;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [demoRoles, setDemoRoles] = useState<Account["role"][]>([]);
  useEffect(() => {
    let live = true;
    if (navigator.onLine)
      api<Account["role"][]>("/auth/demo-accounts")
        .then((roles) => live && setDemoRoles(roles))
        .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  async function signIn(key: string, path: string, body: unknown) {
    setBusy(key);
    setMessage("");
    try {
      await refreshCsrf();
      await api(path, body);
      await refreshCsrf();
      await onLogin(await api<Account>("/auth/me"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy("");
    }
  }
  const roleCards = DEMO_ROLES.filter((r) => demoRoles.includes(r.role));
  return (
    <main className="login-page">
      <div className={"login-card" + (roleCards.length ? " with-roles" : "")}>
        <div className="wordmark">
          WAYPOINT <span>GROUP</span>
        </div>
        <p className="eyebrow">Connected delivery operations</p>
        <h1>Every delivery begins with a promise.</h1>
        {roleCards.length > 0 && (
          <section aria-labelledby="role-picker-title">
            <p id="role-picker-title">
              Choose a role to explore the judge environment.
            </p>
            <div className="role-picker">
              {roleCards.map(({ role, title, detail, Icon }) => (
                <button
                  key={role}
                  type="button"
                  className="role-option"
                  disabled={!!busy || !navigator.onLine}
                  onClick={() =>
                    void signIn(role, "/auth/demo-login", { role })
                  }
                >
                  <Icon size={22} />
                  <strong>{busy === role ? "Opening…" : title}</strong>
                  <small>{detail}</small>
                </button>
              ))}
            </div>
            <p className="role-picker-divider">or sign in with an account</p>
          </section>
        )}
        {!roleCards.length && <p>Sign in to your assigned role and depot.</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void signIn(
              "form",
              "/auth/login",
              new URLSearchParams({ username, password }),
            );
          }}
        >
          <label>
            Username
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {(message || error) && (
            <p role="alert" className="error-text">
              {message || error}
            </p>
          )}
          <Button disabled={!!busy || !navigator.onLine} type="submit">
            {busy === "form" ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        {!roleCards.length && (
          <details>
            <summary>Judge demo accounts</summary>
            <p>manager · dispatcher · loader · driver</p>
            {import.meta.env.VITE_SHOW_DEMO_PASSWORD !== "false" ? (
              <p>
                Password: <code>WaypointDemo!2026</code>
              </p>
            ) : (
              <p>Use the competition password supplied by the team.</p>
            )}
            <small>
              Synthetic walkthrough only. Each account has a server-assigned
              role and scope.
            </small>
          </details>
        )}
      </div>
    </main>
  );
}
