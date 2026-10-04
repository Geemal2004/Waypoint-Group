import { api, ApiError } from "./api";
import { offlineDb, type OutboxAction, type ProofDraft } from "./offline-db";
import type { Account, Order } from "./models";

const activeKey = "waypoint-active-account";
export const activeAccountId = () => localStorage.getItem(activeKey);
export async function rememberAccount(account: Account) {
  await offlineDb.cache.put({
    key: "account:" + account.id,
    accountId: account.id,
    value: account,
    savedAt: new Date().toISOString(),
  });
  localStorage.setItem(activeKey, account.id);
}
export function forgetAccount() {
  localStorage.removeItem(activeKey);
}
export async function cachedAccount(): Promise<Account | null> {
  const id = activeAccountId();
  return id
    ? ((await offlineDb.cache.get("account:" + id))?.value as Account) || null
    : null;
}
export async function cachedRead<T>(
  accountId: string,
  path: string,
): Promise<T> {
  if (activeAccountId() !== accountId)
    throw new Error("The active account changed. Reopen this workspace.");
  const key = accountId + ":" + path;
  if (navigator.onLine) {
    let value: T;
    try {
      value = await api<T>(path);
    } catch (error) {
      // Wi-Fi can stay connected while the service is unreachable. Only
      // transport failures may use saved data; server errors remain visible.
      if (error instanceof ApiError && error.status < 500) throw error;
      if (activeAccountId() !== accountId) throw error;
      const saved = await offlineDb.cache.get(key);
      if (!saved) throw error;
      return saved.value as T;
    }
    if (activeAccountId() !== accountId)
      throw new Error(
        "The active account changed before this response arrived.",
      );
    await offlineDb.cache.put({
      key,
      accountId,
      value,
      savedAt: new Date().toISOString(),
    });
    return value;
  }
  const cache = await offlineDb.cache.get(key);
  if (!cache)
    throw new Error(
      "This screen has not been saved on this device. Reconnect to load it.",
    );
  return cache.value as T;
}
export async function saveProof(
  account: Account,
  order: Order,
  quantities: Record<string, number>,
  issue: string,
  file: File,
  retainedDraft?: ProofDraft,
) {
  if (activeAccountId() !== account.id)
    throw new Error(
      "Account changed. Reopen this workspace before saving proof.",
    );
  if (
    !["image/jpeg", "image/png"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Choose a JPEG or PNG photo up to 5 MB.");
  let deviceId = localStorage.getItem("waypoint-device");
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("waypoint-device", deviceId);
  }
  const actionId = crypto.randomUUID();
  const action: OutboxAction = {
    actionId,
    accountId: account.id,
    actionType: "DELIVERY_PROOF",
    entityId: order.id,
    expectedVersion: order.version,
    payload: {
      expectedVersion: order.version,
      lines: order.lines.map((l) => ({
        lineId: l.id,
        quantity: quantities[l.id] ?? l.loaded ?? 0,
      })),
      issue,
    },
    deviceId,
    capturedAt: new Date().toISOString(),
    syncState: "pending",
    retryCount: 0,
  };
  await offlineDb.transaction(
    "rw",
    offlineDb.outbox,
    offlineDb.attachments,
    offlineDb.proofDrafts,
    async () => {
      const pending = await offlineDb.outbox
        .where("accountId")
        .equals(account.id)
        .toArray();
      if (
        pending.some(
          (a) => a.entityId === order.id && a.syncState !== "rejected",
        )
      )
        throw new Error(
          "Proof for this stop is already saved. Check its sync status below.",
        );
      if (retainedDraft) {
        const kept = await offlineDb.proofDrafts.get(retainedDraft.key);
        if (
          !kept ||
          kept.accountId !== account.id ||
          kept.orderId !== order.id ||
          kept.updatedAt !== retainedDraft.updatedAt ||
          kept.expectedVersion !== retainedDraft.expectedVersion ||
          JSON.stringify(kept.quantities) !==
            JSON.stringify(retainedDraft.quantities) ||
          kept.issue !== retainedDraft.issue ||
          kept.photoName !== retainedDraft.photoName
        )
          throw new Error(
            "The local draft changed. Reopen Sync and review the retained evidence again.",
          );
      }
      await offlineDb.outbox.add(action);
      await offlineDb.attachments.add({
        id: actionId,
        actionId,
        accountId: account.id,
        blob: file,
      });
      // Move the draft to the immutable outbox in the same local transaction.
      await offlineDb.proofDrafts
        .where("[accountId+orderId]")
        .equals([account.id, order.id])
        .delete();
    },
  );
  return actionId;
}
let running = false;
export async function syncProofs(accountId: string, force = false) {
  if (running || !navigator.onLine || activeAccountId() !== accountId) return;
  running = true;
  try {
    const actions = await offlineDb.outbox
      .where("accountId")
      .equals(accountId)
      .toArray();
    for (const action of actions) {
      if (activeAccountId() !== accountId) break;
      if (
        !["pending", "syncing"].includes(action.syncState) ||
        (!force && (action.nextAttemptAt || 0) > Date.now())
      )
        continue;
      const attachment = await offlineDb.attachments.get(action.actionId);
      if (!attachment || !action.deviceId) {
        await offlineDb.outbox.update(action.actionId, {
          syncState: "rejected",
          message:
            "Evidence is missing on this device. Retain this record for review.",
        });
        continue;
      }
      await offlineDb.outbox.update(action.actionId, { syncState: "syncing" });
      const form = new FormData();
      form.set(
        "action",
        new Blob(
          [
            JSON.stringify({
              actionId: action.actionId,
              deviceId: action.deviceId,
              capturedAt: action.capturedAt,
              delivery: action.payload,
            }),
          ],
          { type: "application/json" },
        ),
        "action.json",
      );
      form.set("proof", attachment.blob, "proof");
      try {
        const result = await api<{ outcome: string; message?: string }>(
          `/orders/${action.entityId}/sync-delivery`,
          form,
        );
        await offlineDb.outbox.update(action.actionId, {
          syncState:
            result.outcome === "accepted"
              ? "synced"
              : result.outcome === "conflict"
                ? "conflict"
                : "rejected",
          message:
            result.message ||
            (result.outcome === "conflict"
              ? "Both records kept · dispatcher review required"
              : "Server accepted delivery proof"),
        });
      } catch (error) {
        const terminal =
          error instanceof ApiError &&
          [400, 404, 409, 413, 422].includes(error.status);
        await offlineDb.outbox.update(action.actionId, {
          syncState: terminal ? "rejected" : "pending",
          retryCount: action.retryCount + 1,
          nextAttemptAt:
            Date.now() +
            Math.min(60000, 2000 * 2 ** Math.min(action.retryCount, 5)),
          message:
            error instanceof Error
              ? error.message
              : "Connection lost. Proof remains on this device.",
        });
        if (error instanceof ApiError && [401, 403].includes(error.status))
          break;
      }
    }
    if (
      actions.some((a) => a.syncState === "conflict") &&
      activeAccountId() === accountId
    ) {
      try {
        const outcomes = await api<
          {
            action_id: string;
            resolution_state: string | null;
            resolution_reason: string | null;
          }[]
        >("/sync-actions");
        for (const outcome of outcomes) {
          const local = await offlineDb.outbox.get(outcome.action_id);
          if (
            !local ||
            local.accountId !== accountId ||
            local.syncState !== "conflict"
          )
            continue;
          if (outcome.resolution_state === "ACCEPTED")
            await offlineDb.outbox.update(local.actionId, {
              syncState: "synced",
              message:
                "Recovered · dispatcher accepted retained proof. " +
                (outcome.resolution_reason || ""),
            });
          if (outcome.resolution_state === "REJECTED")
            await offlineDb.outbox.update(local.actionId, {
              syncState: "rejected",
              message:
                "Dispatcher retained the server decision. Evidence remains saved. " +
                (outcome.resolution_reason || ""),
            });
        }
      } catch {
        /* Review remains pending until the account can read its server outcome. */
      }
    }
  } finally {
    running = false;
  }
}
