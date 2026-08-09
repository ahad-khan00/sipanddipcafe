import { createFileRoute, Link } from "@tanstack/react-router";
import { QrCode, Smartphone, ShieldCheck, ChefHat } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tablebrew — QR table ordering for cafes" },
      {
        name: "description",
        content:
          "Guests scan the QR code on their table, browse your menu and order in seconds. You manage menu, tables and live orders from one dashboard.",
      },
      { property: "og:title", content: "Tablebrew — QR table ordering for cafes" },
      {
        property: "og:description",
        content:
          "Scan-to-order for cafes: no app, no account for guests, and a realtime dashboard for your team.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: QrCode,
    title: "One QR per table",
    body: "Every table gets a secure random code. Scanning identifies the table automatically — no picking from a list.",
  },
  {
    icon: Smartphone,
    title: "No app, no signup",
    body: "Guests open the menu on their phone, add items and order. Then they follow the status live.",
  },
  {
    icon: ChefHat,
    title: "Live kitchen board",
    body: "New orders appear instantly. Accept, prepare, mark ready and complete with one tap.",
  },
  {
    icon: ShieldCheck,
    title: "Prices verified server-side",
    body: "Totals are always recalculated from your database prices — the browser can never change them.",
  },
];

function Landing() {
  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6">
        <span className="font-display text-xl font-semibold">Tablebrew</span>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/login">Owner login</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-5xl px-5 pb-16 pt-10 text-center sm:pt-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-foreground">
          Scan · Order · Sip
        </span>
        <h1 className="mt-6 text-4xl font-semibold leading-tight sm:text-6xl">
          Table ordering that
          <span className="text-accent"> just works</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
          Put a QR code on every bench. Guests order from their seat, your team runs the whole
          service from a single realtime dashboard.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/admin/login">Open my cafe dashboard</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-5 pb-20 sm:grid-cols-2">
        {features.map((f) => (
          <article key={f.title} className="surface-card p-6">
            <f.icon className="size-6 text-accent" aria-hidden />
            <h2 className="mt-4 text-lg font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </article>
        ))}
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Tablebrew · built for cafes
      </footer>
    </main>
  );
}
