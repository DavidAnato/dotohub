/**
 * File d'actions hors-ligne DotoHub web (localStorage) + replay à la reconnexion.
 * Conflit : last-write / timestamp - le serveur renvoie 409 si `client_updated_at` est stale.
 */
export type OfflineAction = {
  id: string;
  method: "POST" | "PATCH" | "PUT";
  path: string;
  body?: unknown;
  createdAt: string;
};

const KEY = "doto_hub_offline_queue";

function load(): OfflineAction[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(list: OfflineAction[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 80)));
}

const READ_PREFIX = "doto_hub_read_";

export function cacheRead(key: string, data: unknown) {
  try {
    localStorage.setItem(READ_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota */
  }
}

export function loadRead<T = unknown>(key: string): T | null {
  try {
    const raw = localStorage.getItem(READ_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw).data as T;
  } catch {
    return null;
  }
}

export function enqueueOffline(action: Omit<OfflineAction, "id" | "createdAt">) {
  const list = load();
  list.push({
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });
  save(list);
  return list.length;
}

export async function replayOfflineQueue(
  send: (a: OfflineAction) => Promise<{ ok: boolean; status?: number }>
) {
  const list = load();
  const remaining: OfflineAction[] = [];
  for (const a of list) {
    try {
      const res = await send(a);
      if (!res.ok && res.status !== 409) remaining.push(a);
    } catch {
      remaining.push(a);
    }
  }
  save(remaining);
  return { replayed: list.length - remaining.length, remaining: remaining.length };
}
