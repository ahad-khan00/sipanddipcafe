import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Coffee, History, Minus, Plus, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { useState } from "react";

import { RatingBadge, Stars } from "@/components/customer/Stars";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { getMenuByToken } from "@/lib/customer.functions";
import { formatMoney } from "@/lib/money";

const menuQuery = (token: string) =>
  queryOptions({
    queryKey: ["menu", token],
    queryFn: () => getMenuByToken({ data: { token } }),
    staleTime: 30_000,
  });

export const Route = createFileRoute("/menu")({
  validateSearch: (search: Record<string, unknown>) => ({ t: String(search["t"] ?? "") }),
  loaderDeps: ({ search }) => ({ t: search.t }),
  loader: ({ context, deps }) =>
    deps.t ? context.queryClient.ensureQueryData(menuQuery(deps.t)) : null,
  head: () => ({
    meta: [
      { title: "Order from your table — Tablebrew" },
      { name: "description", content: "Browse the menu and order straight from your table." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Order from your table" },
      {
        property: "og:description",
        content: "Browse the menu and order straight from your table.",
      },
    ],
  }),
  errorComponent: ({ error }) => <MenuProblem message={error.message} />,
  component: MenuPage,
});

function MenuProblem({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="surface-card max-w-sm p-8 text-center">
        <UtensilsCrossed className="mx-auto size-8 text-accent" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">Menu unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}

function MenuPage() {
  const { t: token } = Route.useSearch();
  if (!token) return <MenuProblem message="Scan the QR code on your table to open the menu." />;
  return <MenuContent token={token} />;
}

function MenuContent({ token }: { token: string }) {
  const { data } = useSuspenseQuery(menuQuery(token));
  const cart = useCart(token);
  const [activeCategory, setActiveCategory] = useState<string | "all">("all");

  const categories = data.categories.filter((c) => data.items.some((i) => i.category_id === c.id));
  const uncategorised = data.items.some((i) => !i.category_id);

  const visible = data.items.filter((item) =>
    activeCategory === "all"
      ? true
      : activeCategory === "other"
        ? !item.category_id
        : item.category_id === activeCategory,
  );

  return (
    <main className="min-h-screen bg-background pb-36">
      {/* Cafe header */}
      <header className="relative overflow-hidden rounded-b-[2rem] bg-primary px-5 pb-9 pt-8 text-primary-foreground shadow-[var(--shadow-lift)]">
        <div
          className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-accent/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-16 size-56 rounded-full bg-accent/10 blur-3xl"
          aria-hidden
        />
        <div className="relative mx-auto max-w-2xl text-center">
          <span className="rise mx-auto flex size-16 items-center justify-center rounded-full bg-primary-foreground/15 ring-1 ring-primary-foreground/25 backdrop-blur">
            <Coffee className="size-8" aria-hidden />
          </span>
          <h1 className="rise mt-5 font-display text-[2rem] font-semibold leading-tight">
            {data.cafe.name}
          </h1>
          <p className="mt-2 text-sm text-primary-foreground/80">
            {data.cafe.description ?? "Freshly made for you"}
          </p>

          <div className="mt-3.5 flex items-center justify-center gap-1.5 text-sm">
            {data.rating.average != null && data.rating.total > 0 ? (
              <>
                <Stars value={data.rating.average} />
                <span className="font-semibold">{data.rating.average.toFixed(1)}</span>
                <span className="text-primary-foreground/70">({data.rating.total})</span>
              </>
            ) : (
              <span className="text-primary-foreground/70">Be the first to review</span>
            )}
          </div>

          <div className="mt-5 flex items-center justify-center gap-2">
            <span className="inline-flex rounded-full bg-primary-foreground px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Table {data.table.table_number}
            </span>
            <Link
              to="/my-orders"
              className="tap inline-flex items-center gap-1.5 rounded-full border border-primary-foreground/30 px-3.5 py-1.5 text-xs font-medium text-primary-foreground/90 hover:bg-primary-foreground/10"
            >
              <History className="size-3.5" aria-hidden /> My orders
            </Link>
          </div>
        </div>
      </header>

      {/* Category navigation */}
      {(categories.length > 0 || uncategorised) && (
        <nav className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-xl">
          <div className="no-scrollbar mx-auto flex max-w-2xl gap-2 overflow-x-auto px-5 py-3">
            <CategoryChip
              label="All"
              active={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
            />
            {categories.map((c) => (
              <CategoryChip
                key={c.id}
                label={c.name}
                active={activeCategory === c.id}
                onClick={() => setActiveCategory(c.id)}
              />
            ))}
            {uncategorised && (
              <CategoryChip
                label="Other"
                active={activeCategory === "other"}
                onClick={() => setActiveCategory("other")}
              />
            )}
          </div>
        </nav>
      )}

      <div className="mx-auto max-w-2xl space-y-3 px-5 py-5">
        {visible.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nothing on the menu here yet.
          </p>
        )}

        {visible.map((item, index) => {
          const line = cart.lines.find((l) => l.menu_item_id === item.id);
          return (
            <article
              key={item.id}
              style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
              className={`surface-card rise flex gap-4 overflow-hidden p-3 transition-shadow hover:shadow-[var(--shadow-lift)] sm:p-4 ${
                item.available ? "" : "opacity-70"
              }`}
              aria-label={item.name}
            >
              <div className="size-24 shrink-0 overflow-hidden rounded-2xl bg-muted sm:size-28">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover transition-transform duration-500 hover:scale-105"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-secondary">
                    <UtensilsCrossed className="size-6 text-muted-foreground" aria-hidden />
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <h2 className="font-display text-[1.05rem] font-semibold leading-snug">
                  {item.name}
                </h2>
                {item.description ? (
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  <span className="text-[1.05rem] font-semibold tracking-tight">
                    {formatMoney(item.price_cents, data.cafe.currency)}
                  </span>

                  {!item.available ? (
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      Sold out
                    </span>
                  ) : line ? (
                    <div className="flex items-center gap-1 rounded-full border border-border bg-secondary/60 p-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="tap size-9 rounded-full"
                        aria-label={`Remove one ${item.name}`}
                        onClick={() =>
                          cart.setQuantity(
                            {
                              menu_item_id: item.id,
                              name: item.name,
                              price_cents: item.price_cents,
                            },
                            line.quantity - 1,
                          )
                        }
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="w-6 text-center text-sm font-bold">{line.quantity}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="tap size-9 rounded-full"
                        aria-label={`Add one ${item.name}`}
                        onClick={() =>
                          cart.setQuantity(
                            {
                              menu_item_id: item.id,
                              name: item.name,
                              price_cents: item.price_cents,
                            },
                            line.quantity + 1,
                          )
                        }
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      className="tap h-10 rounded-full px-6 text-sm font-semibold"
                      onClick={() =>
                        cart.add({
                          menu_item_id: item.id,
                          name: item.name,
                          price_cents: item.price_cents,
                        })
                      }
                    >
                      Add
                    </Button>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {data.reviews.length > 0 && (
          <section className="surface-card mt-6 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">What guests say</h2>
              <RatingBadge average={data.rating.average} total={data.rating.total} />
            </div>
            <ul className="mt-4 space-y-4">
              {data.reviews.map((review) => (
                <li key={review.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Stars value={review.rating} />
                    <span className="text-xs font-medium">
                      {review.display_name ?? "Guest"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(review.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {review.comment ? (
                    <p className="mt-1.5 text-sm text-muted-foreground">{review.comment}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Sticky cart */}
      {cart.count > 0 && (
        <div className="slide-up-bar pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-card/90 px-4 pt-4 backdrop-blur-xl">
          <div className="mx-auto max-w-2xl">
            <Button
              asChild
              size="lg"
              className="tap h-14 w-full rounded-full text-base font-semibold shadow-[var(--shadow-lift)]"
            >
              <Link to="/cart" search={{ t: token }}>
                <ShoppingBag className="size-5" aria-hidden />
                View cart · {cart.count} {cart.count === 1 ? "item" : "items"} ·{" "}
                {formatMoney(cart.subtotal, data.cafe.currency)}
              </Link>
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tap shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${
        active
          ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-card)]"
          : "border-border bg-card text-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}
