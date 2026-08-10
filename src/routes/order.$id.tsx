import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock, CookingPot, PartyPopper, XCircle } from "lucide-react";

import { getOrder } from "@/lib/customer.functions";
import { formatMoney } from "@/lib/money";
import {
  STATUS_CLASS,
  STATUS_CUSTOMER_COPY,
  STATUS_LABEL,
  isOrderStatus,
  type OrderStatus,
} from "@/lib/order-status";

const orderQuery = (id: string, token: string) =>
  queryOptions({
    queryKey: ["order", id, token],
    queryFn: () => getOrder({ data: { id, token } }),
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
  });

export const Route = createFileRoute("/order/$id")({
  validateSearch: (search: Record<string, unknown>) => ({ k: String(search["k"] ?? "") }),
  loaderDeps: ({ search }) => ({ k: search.k }),
  loader: ({ context, params, deps }) =>
    deps.k ? context.queryClient.ensureQueryData(orderQuery(params.id, deps.k)) : null,

  head: () => ({
    meta: [
      { title: "Your order — Tablebrew" },
      { name: "description", content: "Track your table order status live." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Your order" },
      { property: "og:description", content: "Track your table order status live." },
    ],
  }),
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center px-5 text-center">
      <div className="surface-card max-w-sm p-8">
        <XCircle className="mx-auto size-8 text-destructive" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold">Order not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </main>
  ),
  component: OrderPage,
});

const STEPS: OrderStatus[] = ["NEW", "ACCEPTED", "PREPARING", "READY", "COMPLETED"];

function OrderPage() {
  const { id } = Route.useParams();
  const { k: token } = Route.useSearch();
  const { data } = useSuspenseQuery(orderQuery(id, token));

  const status = (isOrderStatus(data.status) ? data.status : "NEW") as OrderStatus;
  const stepIndex = STEPS.indexOf(status);

  const Icon =
    status === "CANCELLED"
      ? XCircle
      : status === "COMPLETED"
        ? PartyPopper
        : status === "READY"
          ? CheckCircle2
          : status === "PREPARING"
            ? CookingPot
            : Clock;

  return (
    <main className="min-h-screen bg-background px-5 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <div className="surface-card p-6 text-center">
          <Icon className="mx-auto size-10 text-accent" aria-hidden />
          <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {data.cafe_name}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Order #{data.order_number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Table {data.table_number}</p>

          <span
            className={`mt-5 inline-flex rounded-full border px-4 py-1.5 text-sm font-semibold ${STATUS_CLASS[status]}`}
          >
            {STATUS_LABEL[status]}
          </span>
          <p className="mt-3 text-sm text-muted-foreground">{STATUS_CUSTOMER_COPY[status]}</p>
        </div>

        {status !== "CANCELLED" && (
          <ol className="surface-card grid grid-cols-5 gap-1 p-4 text-center">
            {STEPS.map((step, index) => (
              <li key={step} className="space-y-2">
                <div
                  className={`mx-auto h-1.5 w-full rounded-full ${
                    index <= stepIndex ? "bg-accent" : "bg-muted"
                  }`}
                />
                <span
                  className={`block text-[10px] font-medium ${
                    index <= stepIndex ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {STATUS_LABEL[step]}
                </span>
              </li>
            ))}
          </ol>
        )}

        <section className="surface-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Items
          </h2>
          <ul className="mt-3 divide-y divide-border">
            {data.items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="font-semibold">{item.quantity}×</span> {item.item_name}
                </span>
                <span className="shrink-0 font-medium">
                  {formatMoney(item.line_total_cents, data.currency)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatMoney(data.subtotal_cents, data.currency)}</span>
            </div>
            {data.tax_cents > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatMoney(data.tax_cents, data.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatMoney(data.total_cents, data.currency)}</span>
            </div>
          </div>

          {data.notes ? (
            <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              “{data.notes}”
            </p>
          ) : null}
        </section>

        <p className="text-center text-xs text-muted-foreground">
          This page updates automatically. Keep it open to follow your order.
        </p>
      </div>
    </main>
  );
}
