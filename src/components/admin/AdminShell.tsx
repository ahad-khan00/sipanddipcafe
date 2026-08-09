import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ClipboardList, LayoutDashboard, LogOut, QrCode, Settings, UtensilsCrossed } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCafe } from "@/hooks/useCafe";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/orders", label: "Orders", icon: ClipboardList },
  { to: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/admin/tables", label: "Tables", icon: QrCode },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;

export function AdminShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: (cafe: NonNullable<ReturnType<typeof useCafe>["data"]>) => ReactNode;
}) {
  const { data, isPending, error } = useCafe();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0">
        <div className="flex items-center justify-between px-5 py-4 md:block">
          <Link to="/admin" className="font-display text-xl font-semibold">
            Tablebrew
          </Link>
          <p className="hidden pt-1 text-xs text-sidebar-foreground/70 md:block">
            {data?.cafe.name ?? "Cafe dashboard"}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="text-sidebar-foreground hover:bg-sidebar-accent md:hidden"
            onClick={signOut}
          >
            <LogOut className="size-4" />
          </Button>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:mt-4 md:flex-col md:overflow-visible">
          {NAV.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent"
                }`}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden px-3 md:mt-auto md:block md:pb-6">
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={signOut}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 px-5 py-6 md:px-8">
        <header className="mb-6">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </header>

        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading your cafe…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : !data ? (
          <CreateCafe />
        ) : (
          children(data)
        )}
      </main>
    </div>
  );
}

function CreateCafe() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("create_cafe_for_current_user", { _name: name });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Cafe created");
    queryClient.invalidateQueries();
  }

  return (
    <form onSubmit={submit} className="surface-card max-w-md space-y-4 p-6">
      <div>
        <h2 className="font-display text-xl font-semibold">Name your cafe</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This is the name guests see when they scan a table QR code.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cafe-name">Cafe name</Label>
        <Input
          id="cafe-name"
          required
          maxLength={120}
          value={name}
          placeholder="Bench &amp; Bean"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={busy || name.trim().length === 0}>
        Create cafe
      </Button>
    </form>
  );
}
