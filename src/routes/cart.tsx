import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CreditCard, Minus, Plus, Store, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/lib/cart";
import {
  confirmPayment,
  getMenuByToken,
  placeOrder,
  reportPaymentFailure,
  startOnlinePayment,
} from "@/lib/customer.functions";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { newRequestKey, rememberOrder } from "@/lib/recent-orders";

const menuQuery = (token: string) =>
  queryOptions({
    queryKey: ["menu", token],
    queryFn: () => getMenuByToken({ data: { token } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/cart")({
  validateSearch: (search: Record<string, unknown>) => ({ t: String(search["t"] ?? "") }),
  loaderDeps: ({ search }) => ({ t: search.t }),
  loader: ({ context, deps }) =>
    deps.t ? context.queryClient.ensureQueryData(menuQuery(deps.t)) : null,
  head: () => ({
    meta: [
      { title: "Checkout — Tablebrew" },
      { name: "description", content: "Review your items, add a tip and pay your way." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Checkout" },
      { property: "og:description", content: "Review your items, add a tip and pay your way." },
    ],
  }),
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center px-5 text-center">
      <p className="text-sm text-muted-foreground">{error.message}</p>
    </main>
  ),
  component: CartPage,
});

function CartPage() {
  const { t: token } = Route.useSearch();
  if (!token)
    return (
      <main className="flex min-h-screen items-center justify-center px-5 text-center">
        <p className="text-sm text-muted-foreground">
          Scan the QR code on your table to start an order.
        </p>
      </main>
    );
  return <CartContent token={token} />;
}

const TIP_PRESETS = [0, 1000, 2000, 5000];

function CartContent({ token }: { token: string }) {
  const { data } = useSuspenseQuery(menuQuery(token));
  const cart = useCart(token);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [tipPreset, setTipPreset] = useState<number | "custom">(0);
  const [customTip, setCustomTip] = useState("");
  const [method, setMethod] = useState<"ONLINE" | "CAFE">("ONLINE");
  const [submitting, setSubmitting] = useState(false);
  // One idempotency key per cart session: double-taps can never duplicate.
  const [requestKey, setRequestKey] = useState(() => newRequestKey());

  const currency = data.cafe.currency;
  const taxEstimate = Math.round(cart.subtotal * data.cafe.tax_rate);

  const tipCents = useMemo(() => {
    if (tipPreset !== "custom") return tipPreset;
    const parsed = parseMoneyToCents(customTip);
    return parsed == null ? 0 : Math.min(500000, parsed);
  }, [tipPreset, customTip]);

  const total = cart.subtotal + taxEstimate + tipCents;

  async function submit() {
    if (cart.lines.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const result = await placeOrder({
        data: {
          token,
          customer_name: name.trim() || null,
          customer_phone: phone.trim() || null,
          notes: notes.trim() || null,
          tip_cents: tipCents,
          payment_method: method,
          request_key: requestKey,
          items: cart.lines.map((l) => ({ menu_item_id: l.menu_item_id, quantity: l.quantity })),
        },
      });

      rememberOrder({
        id: result.order_id,
        token: result.tracking_token,
        order_number: 0,
        cafe_name: data.cafe.name,
        table_number: data.table.table_number,
        total_cents: result.total_cents,
        currency,
        at: new Date().toISOString(),
      });

      if (method === "ONLINE") {
        await payNow(result.order_id, result.tracking_token);
      }

      cart.clear();
      setRequestKey(newRequestKey());
      navigate({
        to: "/order/$id",
        params: { id: result.order_id },
        search: { k: result.tracking_token },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not place your order");
    } finally {
      setSubmitting(false);
    }
  }

  /** Opens Razorpay for an order that already exists server-side. */
  async function payNow(orderId: string, trackingToken: string) {
    try {
      const session = await startOnlinePayment({ data: { id: orderId, token: trackingToken } });
      const outcome = await openRazorpayCheckout({
        key_id: session.key_id,
        provider_order_id: session.provider_order_id,
        amount: session.amount,
        currency: session.currency,
        cafe_name: session.cafe_name,
        order_number: session.order_number,
        customer_name: name.trim() || null,
        customer_phone: phone.trim() || null,
      });

      if (!outcome.ok) {
        await reportPaymentFailure({
          data: {
            id: orderId,
            token: trackingToken,
            razorpay_order_id: session.provider_order_id,
            reason: outcome.reason,
          },
        });
        toast.warning(`${outcome.reason}. You can retry payment on the next screen.`);
        return;
      }

      const verified = await confirmPayment({
        data: {
          id: orderId,
          token: trackingToken,
          razorpay_order_id: outcome.razorpay_order_id,
          razorpay_payment_id: outcome.razorpay_payment_id,
          razorpay_signature: outcome.razorpay_signature,
        },
      });
      if (verified.payment_status === "PAID") toast.success("Payment received. Thank you!");
      else toast.info("We are confirming your payment with the bank.");
    } catch (error) {
      toast.warning(
        error instanceof Error
          ? error.message
          : "Payment could not be started. You can retry on the next screen.",
      );
    }
  }

  return (
    <main className="min-h-screen bg-background pb-40">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button asChild size="icon" variant="ghost" aria-label="Back to menu">
            <Link to="/menu" search={{ t: token }}>
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <h1 className="font-display text-xl font-semibold">Your order</h1>
            <p className="text-xs text-muted-foreground">
              {data.cafe.name} · Table {data.table.table_number}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 px-5 py-5">
        {cart.lines.length === 0 ? (
          <div className="surface-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Your cart is empty.</p>
            <Button asChild className="mt-4 rounded-full">
              <Link to="/menu" search={{ t: token }}>
                Browse the menu
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <ul className="surface-card divide-y divide-border">
              {cart.lines.map((line) => (
                <li key={line.menu_item_id} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{line.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatMoney(line.price_cents, currency)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full border border-border p-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 rounded-full"
                      aria-label={`Remove one ${line.name}`}
                      onClick={() =>
                        cart.setQuantity(
                          {
                            menu_item_id: line.menu_item_id,
                            name: line.name,
                            price_cents: line.price_cents,
                          },
                          line.quantity - 1,
                        )
                      }
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 rounded-full"
                      aria-label={`Add one ${line.name}`}
                      onClick={() =>
                        cart.setQuantity(
                          {
                            menu_item_id: line.menu_item_id,
                            name: line.name,
                            price_cents: line.price_cents,
                          },
                          line.quantity + 1,
                        )
                      }
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <span className="w-20 text-right font-semibold">
                    {formatMoney(line.price_cents * line.quantity, currency)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${line.name}`}
                    onClick={() => cart.remove(line.menu_item_id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>

            {/* Tip */}
            <section className="surface-card space-y-3 p-4">
              <div>
                <h2 className="font-display text-base font-semibold">Add a tip?</h2>
                <p className="text-xs text-muted-foreground">
                  100% optional — it goes to the team who made your order.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {TIP_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={tipPreset === preset}
                    onClick={() => setTipPreset(preset)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                      tipPreset === preset
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    {preset === 0 ? "No tip" : formatMoney(preset, currency)}
                  </button>
                ))}
                <button
                  type="button"
                  aria-pressed={tipPreset === "custom"}
                  onClick={() => setTipPreset("custom")}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                    tipPreset === "custom"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-muted"
                  }`}
                >
                  Custom
                </button>
              </div>
              {tipPreset === "custom" && (
                <div className="space-y-1.5">
                  <Label htmlFor="tip">Custom tip</Label>
                  <Input
                    id="tip"
                    inputMode="decimal"
                    value={customTip}
                    maxLength={8}
                    placeholder="e.g. 30"
                    onChange={(e) => setCustomTip(e.target.value)}
                  />
                </div>
              )}
            </section>

            {/* Payment method */}
            <section className="surface-card space-y-2 p-4">
              <h2 className="font-display text-base font-semibold">Payment</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <MethodOption
                  active={method === "ONLINE"}
                  onClick={() => setMethod("ONLINE")}
                  icon={<CreditCard className="size-5" aria-hidden />}
                  title="Pay online"
                  subtitle="UPI, cards & wallets"
                />
                <MethodOption
                  active={method === "CAFE"}
                  onClick={() => setMethod("CAFE")}
                  icon={<Store className="size-5" aria-hidden />}
                  title="Pay at cafe"
                  subtitle="Settle at the counter"
                />
              </div>
            </section>

            <section className="surface-card space-y-4 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Optional details
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Your name</Label>
                  <Input
                    id="name"
                    value={name}
                    maxLength={80}
                    placeholder="So we can call you"
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={phone}
                    maxLength={30}
                    inputMode="tel"
                    placeholder="Optional"
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Special instructions</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  maxLength={500}
                  rows={3}
                  placeholder="Allergies, no sugar, extra hot…"
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </section>

            <section className="surface-card space-y-2 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatMoney(cart.subtotal, currency)}</span>
              </div>
              {data.cafe.tax_rate > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Tax ({(data.cafe.tax_rate * 100).toFixed(1)}%)
                  </span>
                  <span>{formatMoney(taxEstimate, currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tip</span>
                <span>{formatMoney(tipCents, currency)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Total</span>
                <span>{formatMoney(total, currency)}</span>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                The cafe confirms the final total from its current menu prices.
              </p>
            </section>
          </>
        )}
      </div>

      {cart.lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <Button
              size="lg"
              className="w-full rounded-full text-base"
              disabled={submitting}
              onClick={submit}
            >
              {submitting
                ? "Placing your order…"
                : method === "ONLINE"
                  ? `Pay ${formatMoney(total, currency)}`
                  : `Place order · ${formatMoney(total, currency)}`}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

function MethodOption({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted"
      }`}
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}
