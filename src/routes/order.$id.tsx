import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, CheckCircle2, Clock, CookingPot, PartyPopper, XCircle } from "lucide-react";
import { toast } from "sonner";

import { ReviewForm } from "@/components/customer/ReviewForm";
import { Button } from "@/components/ui/button";
import {
  confirmPayment,
  getOrder,
  reportPaymentFailure,
  startOnlinePayment,
} from "@/lib/customer.functions";
import { formatMoney } from "@/lib/money";
import { PAYMENT_STATUS_CLASS, PAYMENT_STATUS_LABEL } from "@/lib/payment-status";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
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

const STEP_COPY: Record<OrderStatus, string> = {
  NEW: "Order received",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function OrderPage() {
  const { id } = Route.useParams();
  const { k: token } = Route.useSearch();
  const { data } = useSuspenseQuery(orderQuery(id, token));
  const queryClient = useQueryClient();

  const status = (isOrderStatus(data.status) ? data.status : "NEW") as OrderStatus;
  const stepIndex = STEPS.indexOf(status);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["order", id, token] });

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

  const needsOnlinePayment =
    data.payment_method === "ONLINE" &&
    (data.payment_status === "PENDING" || data.payment_status === "FAILED") &&
    status !== "CANCELLED";

  /** Re-opens Razorpay for an existing order. Amounts always come from the server. */
  async function retryPayment() {
    try {
      const session = await startOnlinePayment({ data: { id, token } });
      const outcome = await openRazorpayCheckout({
        key_id: session.key_id,
        provider_order_id: session.provider_order_id,
        amount: session.amount,
        currency: session.currency,
        cafe_name: session.cafe_name,
        order_number: session.order_number,
        customer_name: data.customer_name,
        customer_phone: null,
      });
      if (!outcome.ok) {
        await reportPaymentFailure({
          data: {
            id,
            token,
            razorpay_order_id: session.provider_order_id,
            reason: outcome.reason,
          },
        });
        toast.warning(outcome.reason);
      } else {
        const verified = await confirmPayment({
          data: {
            id,
            token,
            razorpay_order_id: outcome.razorpay_order_id,
            razorpay_payment_id: outcome.razorpay_payment_id,
            razorpay_signature: outcome.razorpay_signature,
          },
        });
        if (verified.payment_status === "PAID") toast.success("Payment received. Thank you!");
        else toast.info("We are confirming your payment with the bank.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment could not be started.");
    } finally {
      void refresh();
    }
  }

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

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span
              className={`inline-flex rounded-full border px-4 py-1.5 text-sm font-semibold ${STATUS_CLASS[status]}`}
            >
              {STATUS_LABEL[status]}
            </span>
            <span
              className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${
                PAYMENT_STATUS_CLASS[data.payment_status] ?? "border-border bg-muted"
              }`}
            >
              {data.payment_method === "CAFE" && data.payment_status !== "PAID"
                ? "Pay at cafe"
                : (PAYMENT_STATUS_LABEL[data.payment_status] ?? data.payment_status)}
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{STATUS_CUSTOMER_COPY[status]}</p>

          {needsOnlinePayment && (
            <Button className="mt-4 w-full rounded-full" onClick={retryPayment}>
              Pay {formatMoney(data.total_cents, data.currency)} now
            </Button>
          )}
        </div>

        {status !== "CANCELLED" && (
          <ol className="surface-card space-y-1 p-5">
            {STEPS.map((step, index) => {
              const done = index < stepIndex;
              const current = index === stepIndex;
              return (
                <li key={step} className="flex items-center gap-3">
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                      done
                        ? "border-accent bg-accent text-accent-foreground"
                        : current
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : current ? (
                      <span className="size-2 rounded-full bg-accent" />
                    ) : null}
                  </span>
                  <span
                    className={`text-sm ${
                      current
                        ? "font-semibold text-foreground"
                        : done
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    {STEP_COPY[step]}
                  </span>
                </li>
              );
            })}
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
            {data.tip_cents > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tip</span>
                <span>{formatMoney(data.tip_cents, data.currency)}</span>
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

        {status === "COMPLETED" &&
          (data.reviewed ? (
            <p className="surface-card p-4 text-center text-sm text-muted-foreground">
              Thanks for rating this order.
            </p>
          ) : (
            <ReviewForm
              orderId={id}
              trackingToken={token}
              defaultName={data.customer_name}
              onSubmitted={refresh}
            />
          ))}

        <div className="flex justify-center">
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to="/my-orders">My orders</Link>
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          This page updates automatically. Keep it open to follow your order.
        </p>
      </div>
    </main>
  );
}

