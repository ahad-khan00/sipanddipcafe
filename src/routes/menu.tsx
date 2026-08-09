import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { useState } from "react";

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
      { property: "og:description", content: "Browse the menu and order straight from your table." },
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

  const categories = data.categories.filter((c) =>
    data.items.some((i) => i.category_id === c.id),
  );
  const uncategorised = data.items.some((i) => !i.category_id);

  const visible = data.items.filter((item) =>
    activeCategory === "all"
      ? true
      : activeCategory === "other"
        ? !item.category_id
        : item.category_id === activeCategory,
  );

  return (
    <main className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Now serving
          </p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <h1 className="font-display text-2xl font-semibold leading-tight">{data.cafe.name}</h1>
            <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
              Table {data.table.table_number}
            </span>
          </div>
          {data.cafe.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{data.cafe.description}</p>
          ) : null}
        </div>

        {(categories.length > 0 || uncategorised) && (
          <nav className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-5 pb-3">
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
          </nav>
        )}
      </header>

      <div className="mx-auto max-w-2xl space-y-3 px-5 py-5">
        {visible.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nothing on the menu here yet.
          </p>
        )}

        {visible.map((item) => {
          const line = cart.lines.find((l) => l.menu_item_id === item.id);
          return (
            <article
              key={item.id}
              className="surface-card flex gap-4 overflow-hidden p-3 sm:p-4"
              aria-label={item.name}
            >
              <div className="size-24 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-28">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <UtensilsCrossed className="size-6 text-muted-foreground" aria-hidden />
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <h2 className="text-base font-semibold leading-snug">{item.name}</h2>
                {item.description ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  <span className="text-base font-semibold">
                    {formatMoney(item.price_cents, data.cafe.currency)}
                  </span>

                  {!item.available ? (
                    <span className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground">
                      Unavailable
                    </span>
                  ) : line ? (
                    <div className="flex items-center gap-1 rounded-full border border-border p-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 rounded-full"
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
                      <span className="w-6 text-center text-sm font-semibold">{line.quantity}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 rounded-full"
                        aria-label={`Add one ${item.name}`}
                        onClick={() =>
                          cart.add({
                            menu_item_id: item.id,
                            name: item.name,
                            price_cents: item.price_cents,
                          })
                        }
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() =>
                        cart.add({
                          menu_item_id: item.id,
                          name: item.name,
                          price_cents: item.price_cents,
                        })
                      }
                    >
                      <Plus className="size-4" /> Add
                    </Button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {cart.count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">
                {cart.count} item{cart.count > 1 ? "s" : ""}
              </p>
              <p className="text-lg font-semibold">
                {formatMoney(cart.subtotal, data.cafe.currency)}
              </p>
            </div>
            <Button asChild size="lg">
              <Link to="/cart" search={{ t: token }}>
                <ShoppingBag className="size-4" /> View cart
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
      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-secondary"
      }`}
    >
      {label}
    </button>
  );
}
