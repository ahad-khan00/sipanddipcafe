import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Phone, StickyNote, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useOrders, updateOrderStatus, type AdminOrder } from "@/hooks/useOrders";
import { formatMoney } from "@/lib/money";
import { NEXT_STATUS, STATUS_CLASS, STATUS_LABEL, type OrderStatus } from "@/lib/order-status";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({
    meta: [
      { title: "Orders — Tablebrew dashboard" },
      { name: "description", content: "Accept, prepare and complete table orders in real time." },
      { property: "og:title", content: "Orders — Tablebrew dashboard" },
      {
        property: "og:description",
        content: "Accept, prepare and complete table orders in real time.",
      },
    ],
  }),
  component: OrdersPage,
});

const GROUPS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "new", label: "New", statuses: ["NEW"] },
  { key: "preparing", label: "Preparing", statuses: ["ACCEPTED", "PREPARING"] },
  { key: "ready", label: "Ready", statuses: ["READY"] },
  { key: "done", label: "Completed", statuses: ["COMPLETED"] },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
];

function OrdersPage() {
  return (
    <AdminShell title="Orders" description="New orders arrive here automatically.">
      {(ctx) => <OrdersBoard cafeId={ctx.cafe.id} currency={ctx.cafe.currency} />}
    </AdminShell>
  );
}

function OrdersBoard({ cafeId, currency }: { cafeId: string; currency: string }) {
  const { data: orders = [], isPending } = useOrders(cafeId);
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function move(order: AdminOrder, status: OrderStatus) {
    setBusyId(order.id);
    try {
      await updateOrderStatus(order.id, status);
      toast.success(`Order #${order.order_number} → ${STATUS_LABEL[status]}`);
      await queryClient.invalidateQueries({ queryKey: ["orders", cafeId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this order");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Tabs defaultValue="new">
      <TabsList className="w-full justify-start overflow-x-auto">
        {GROUPS.map((group) => {
          const count = orders.filter((o) => group.statuses.includes(o.status)).length;
          return (
            <TabsTrigger key={group.key} value={group.key}>
              {group.label}
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">{count}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      {GROUPS.map((group) => {
        const list = orders.filter((o) => group.statuses.includes(o.status));
        return (
          <TabsContent key={group.key} value={group.key} className="mt-4">
            {isPending ? (
              <p className="text-sm text-muted-foreground">Loading orders…</p>
            ) : list.length === 0 ? (
              <p className="surface-card p-8 text-center text-sm text-muted-foreground">
                Nothing here right now.
              </p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {list.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    currency={currency}
                    busy={busyId === order.id}
                    onMove={move}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function OrderCard({
  order,
  currency,
  busy,
  onMove,
}: {
  order: AdminOrder;
  currency: string;
  busy: boolean;
  onMove: (order: AdminOrder, status: OrderStatus) => void;
}) {
  const next = NEXT_STATUS[order.status];
  const open = order.status !== "COMPLETED" && order.status !== "CANCELLED";

  return (
    <article className="surface-card flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-semibold">#{order.order_number}</p>
          <p className="text-sm font-medium">Table {order.cafe_tables?.table_number ?? "—"}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[order.status]}`}
        >
          {STATUS_LABEL[order.status]}
        </span>
      </div>

      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" aria-hidden />
        {new Date(order.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>

      <ul className="mt-3 space-y-1 text-sm">
        {order.order_items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3">
            <span>
              <span className="font-semibold">{item.quantity}×</span> {item.item_name}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {formatMoney(item.line_total_cents, currency)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
        {order.customer_name ? (
          <p className="flex items-center gap-1.5">
            <User className="size-3.5 text-muted-foreground" aria-hidden />
            {order.customer_name}
          </p>
        ) : null}
        {order.customer_phone ? (
          <p className="flex items-center gap-1.5">
            <Phone className="size-3.5 text-muted-foreground" aria-hidden />
            <a href={`tel:${order.customer_phone}`} className="underline-offset-4 hover:underline">
              {order.customer_phone}
            </a>
          </p>
        ) : null}
        {order.notes ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-muted p-2 text-muted-foreground">
            <StickyNote className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {order.notes}
          </p>
        ) : null}
        <p className="flex justify-between pt-1 text-base font-semibold">
          <span>Total</span>
          <span>{formatMoney(order.total_cents, currency)}</span>
        </p>
      </div>

      {open && (
        <div className="mt-4 flex gap-2">
          {next ? (
            <Button className="flex-1" disabled={busy} onClick={() => onMove(order, next.to)}>
              {next.label}
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onMove(order, "CANCELLED")}
            className="text-destructive"
          >
            Cancel
          </Button>
        </div>
      )}
    </article>
  );
}
