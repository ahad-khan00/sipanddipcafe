import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/lib/cart";
import { getMenuByToken, placeOrder } from "@/lib/customer.functions";
import { formatMoney } from "@/lib/money";

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
      { title: "Your cart — Tablebrew" },
      { name: "description", content: "Review your items and place your table order." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Your cart" },
      { property: "og:description", content: "Review your items and place your table order." },
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

function CartContent({ token }: { token: string }) {
  const { data } = useSuspenseQuery(menuQuery(token));
  const cart = useCart(token);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currency = data.cafe.currency;
  const taxEstimate = Math.round(cart.subtotal * data.cafe.tax_rate);

  async function submit() {
    if (cart.lines.length === 0) return;
    setSubmitting(true);
    try {
      const result = await placeOrder({
        data: {
          token,
          customer_name: name.trim() || null,
          customer_phone: phone.trim() || null,
          notes: notes.trim() || null,
          items: cart.lines.map((l) => ({ menu_item_id: l.menu_item_id, quantity: l.quantity })),
        },
      });
      cart.clear();
      navigate({ to: "/order/$id", params: { id: result.order_id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not place your order");
    } finally {
      setSubmitting(false);
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
            <Button asChild className="mt-4">
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
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Estimated total</span>
                <span>{formatMoney(cart.subtotal + taxEstimate, currency)}</span>
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
            <Button size="lg" className="w-full" disabled={submitting} onClick={submit}>
              {submitting
                ? "Placing order…"
                : `Place order · ${formatMoney(cart.subtotal + taxEstimate, currency)}`}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
