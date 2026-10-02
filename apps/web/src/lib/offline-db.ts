import Dexie, { type EntityTable } from "dexie";

export type SyncState =
  "pending" | "syncing" | "synced" | "conflict" | "rejected";
export interface OutboxAction {
  actionId: string;
  accountId: string;
  actionType: "LOADING_CHECK" | "DELIVERY_PROOF" | "DELIVERY_ISSUE";
  entityId: string;
  expectedVersion: number;
  payload: Record<string, unknown>;
  capturedAt: string;
  syncState: SyncState;
  retryCount: number;
  deviceId?: string;
  nextAttemptAt?: number;
  message?: string;
}
export interface ProofAttachment {
  id: string;
  actionId: string;
  accountId: string;
  blob: Blob;
}
export const offlineDb = new Dexie("waypoint-offline") as Dexie & {
  outbox: EntityTable<OutboxAction, "actionId">;
  attachments: EntityTable<ProofAttachment, "id">;
  cache: EntityTable<
    { key: string; accountId: string; value: unknown; savedAt: string },
    "key"
  >;
};
offlineDb.version(1).stores({
  outbox: "actionId, accountId, [accountId+syncState], entityId, capturedAt",
  attachments: "id, actionId, accountId",
});
offlineDb.version(2).stores({
  outbox: "actionId, accountId, [accountId+syncState], entityId, capturedAt",
  attachments: "id, actionId, accountId",
  cache: "key, accountId",
});
