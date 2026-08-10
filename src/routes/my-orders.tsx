import { createFileRoute, Link } from "@tanstack/react-router";
import { History, Receipt } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { readRecentOrders, type RecentOrder } from "@/lib/recent-orders";

export const Route = createFileRoute("/my-orders")({
  head: () => ({
    meta: [
      { title: "My orders — Tablebrew" },
      { name: "description", content: "Revisit the orders you placed from your table." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "My orders" },
      { property: "og:description", content: "Revisit the orders you placed from your table." },
    ],
  }),
  component: MyOrdersPage,
});

function MyOrdersPage() {
  const [orders, setOrders] = useState<RecentOrder[]>([]);

  // Guest history lives on this device only, so read it after hydration.
  useEffect(() => {
    setOrders(readRecentOrders());
  }, []);

  return (
    <main className="min-h-screen bg-background px-5 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <header className="text-center">
          <History className="mx-auto size-8 text-accent" aria-hidden />
          <h1 className="mt-3 font-display text-2xl font-semibold">My orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Orders placed on this device, with live tracking links.
          </p>
        </header>

        {orders.length === 0 ? (
          <p className="surface-card p-8 text-center text-sm text-muted-foreground">
            No orders yet. Scan the QR code on your table to get started.
          </p>
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => (
              <li key={order.id} className="surface-card flex items-center gap-3 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Receipt className="size-5 text-muted-foreground" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{order.cafe_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Table {order.table_number} · {new Date(order.at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {formatMoney(order.total_cents, order.currency)}
                  </p>
                  <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                    <Link to="/order/$id" params={{ id: order.id }} search={{ k: order.token }}>
                      Track
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
