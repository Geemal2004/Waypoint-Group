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
} from "lucide-react";
import { api, ApiError, refreshCsrf } from "./lib/api";
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
    [night, setNight] = useState(
      localStorage.getItem("waypoint-theme") === "night",
    );
  const client = useQueryClient();
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
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", run);
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
          <div className="nav-item active">
            <ClipboardList size={18} />
            Planning & handoffs
          </div>
          <p className="sidebar-note">
            Routing, forecasts and multi-stop editing are pending integration.
          </p>
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
            <span className={"badge " + (!online ? "offline" : "")}>
              {online ? (
                "Online"
              ) : (
                <>
                  <WifiOff size={13} /> Offline · cached view
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
          <div className="demo-strip">
            Judge environment · S1 replay: 8 January 2026 · legacy October
            fixtures · private challenge data
          </div>
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
                  catalog={catalog.data}
                  orders={orders.data}
                  action={action}
                  busy={busy}
                />
              )}
              {account.role === "DISPATCHER" && (
                <Dispatcher
                  orders={orders.data}
                  vehicles={vehicles.data || []}
                  catalog={catalog.data}
                  conflicts={conflicts.data || []}
                  action={action}
                  busy={busy}
                />
              )}
              {account.role === "LOADER" && (
                <Loader orders={orders.data} action={action} busy={busy} />
              )}
              {account.role === "DRIVER" && (
                <Driver
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
function Login({
  error,
  onLogin,
}: {
  error: string;
  onLogin: (account: Account) => Promise<void>;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="wordmark">
          WAYPOINT <span>GROUP</span>
        </div>
        <p className="eyebrow">Connected delivery operations</p>
        <h1>Every delivery begins with a promise.</h1>
        <p>Sign in to your assigned role and depot.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              await refreshCsrf();
              await api(
                "/auth/login",
                new URLSearchParams({ username, password }),
              );
              await refreshCsrf();
              await onLogin(await api<Account>("/auth/me"));
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Sign-in failed.");
            } finally {
              setBusy(false);
            }
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
          <Button disabled={busy || !navigator.onLine} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <details>
          <summary>Judge demo accounts</summary>
          <p>manager · dispatcher · loader · driver</p>
          <p>
            Password: <code>WaypointDemo!2026</code>
          </p>
          <small>
            Synthetic walkthrough only. Each account has a server-assigned role
            and scope.
          </small>
        </details>
      </div>
    </main>
  );
}
