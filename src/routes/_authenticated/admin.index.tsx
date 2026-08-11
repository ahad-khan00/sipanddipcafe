import { createFileRoute, Link } from "@tanstack/react-router";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Stars } from "@/components/customer/Stars";
import { useOrders } from "@/hooks/useOrders";
import { ratingSummary, useReviews } from "@/hooks/useReviews";
import { formatMoney } from "@/lib/money";
import { STATUS_CLASS, STATUS_LABEL, type OrderStatus } from "@/lib/order-status";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Overview — Tablebrew dashboard" },
      { name: "description", content: "Today's orders, revenue and live service snapshot." },
      { property: "og:title", content: "Overview — Tablebrew dashboard" },
      { property: "og:description", content: "Today's orders, revenue and live service snapshot." },
    ],
  }),
  component: OverviewPage,
});

const LIVE: OrderStatus[] = ["NEW", "ACCEPTED", "PREPARING", "READY"];

function OverviewPage() {
  return (
    <AdminShell title="Overview" description="A live snapshot of today's service.">
      {(ctx) => <Overview cafeId={ctx.cafe.id} currency={ctx.cafe.currency} />}
    </AdminShell>
  );
}

function Overview({ cafeId, currency }: { cafeId: string; currency: string }) {
  const { data: orders = [], isPending } = useOrders(cafeId);
  const { data: reviews = [] } = useReviews(cafeId);
  const rating = ratingSummary(reviews);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const today = orders.filter((o) => new Date(o.created_at) >= startOfDay);
  const revenue = today
    .filter((o) => o.status !== "CANCELLED")
    .reduce((sum, o) => sum + o.total_cents, 0);

  const tips = today
    .filter((o) => o.status !== "CANCELLED")
    .reduce((sum, o) => sum + o.tip_cents, 0);
  const awaitingPayment = orders.filter(
    (o) => o.payment_status === "PENDING" && o.status !== "CANCELLED",
  ).length;

  const counts = LIVE.map((status) => ({
    status,
    count: orders.filter((o) => o.status === status).length,
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Orders today" value={String(today.length)} />
        <Stat label="Revenue today" value={formatMoney(revenue, currency)} />
        <Stat label="Tips today" value={formatMoney(tips, currency)} />
        <Stat
          label="Waiting to accept"
          value={String(orders.filter((o) => o.status === "NEW").length)}
          highlight
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Average rating
          </p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-semibold">
            {rating.average?.toFixed(1) ?? "—"}
            {rating.average != null && <Stars value={rating.average} />}
          </p>
        </div>
        <Stat label="Total reviews" value={String(rating.total)} />
        <Stat label="Awaiting payment" value={String(awaitingPayment)} />
        <Stat
          label="Ready for pickup"
          value={String(orders.filter((o) => o.status === "READY").length)}
        />
      </div>

      <section className="surface-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Live board</h2>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/orders">Open orders</Link>
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {counts.map((c) => (
            <div key={c.status} className="rounded-lg border border-border p-4">
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[c.status]}`}
              >
                {STATUS_LABEL[c.status]}
              </span>
              <p className="mt-2 text-2xl font-semibold">{c.count}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card p-5">
        <h2 className="font-display text-lg font-semibold">Latest orders</h2>
        {isPending ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No orders yet. Print your table QR codes to get started.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {orders.slice(0, 8).map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-semibold">#{order.order_number}</span>
                <span className="text-muted-foreground">
                  Table {order.cafe_tables?.table_number ?? "—"}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[order.status]}`}
                >
                  {STATUS_LABEL[order.status]}
                </span>
                <span className="font-medium">{formatMoney(order.total_cents, currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`surface-card p-5 ${highlight ? "ring-2 ring-accent/50" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
