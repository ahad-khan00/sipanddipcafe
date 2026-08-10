/**
 * Guest order history. Kept on the customer's own device only — the tracking
 * token is the bearer of access to an order, so nothing here is shared or
 * server-readable.
 */
export type RecentOrder = {
  id: string;
  token: string;
  order_number: number;
  cafe_name: string;
  table_number: string;
  total_cents: number;
  currency: string;
  at: string;
};

const KEY = "cafe-recent-orders";
const MAX = 20;

export function readRecentOrders(): RecentOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as RecentOrder[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((o) => o && typeof o.id === "string" && typeof o.token === "string");
  } catch {
    return [];
  }
}

export function rememberOrder(order: RecentOrder) {
  if (typeof window === "undefined") return;
  const next = [order, ...readRecentOrders().filter((o) => o.id !== order.id)].slice(0, MAX);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

/** Random, unguessable idempotency key for a single place-order attempt. */
export function newRequestKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
