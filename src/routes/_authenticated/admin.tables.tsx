import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Download, Plus, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/tables")({
  head: () => ({
    meta: [
      { title: "Tables & QR codes — Tablebrew dashboard" },
      { name: "description", content: "Create tables and print a unique secure QR code for each one." },
      { property: "og:title", content: "Tables & QR codes — Tablebrew dashboard" },
      {
        property: "og:description",
        content: "Create tables and print a unique secure QR code for each one.",
      },
    ],
  }),
  component: TablesPage,
});

type CafeTable = { id: string; table_number: string; qr_token: string; active: boolean };

function TablesPage() {
  return (
    <AdminShell
      title="Tables"
      description="Each table gets its own secure QR code. Scanning it identifies the table automatically."
    >
      {(ctx) => <TablesAdmin cafeId={ctx.cafe.id} />}
    </AdminShell>
  );
}

function TablesAdmin({ cafeId }: { cafeId: string }) {
  const queryClient = useQueryClient();
  const [tableNumber, setTableNumber] = useState("");

  const tables = useQuery({
    queryKey: ["tables", cafeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cafe_tables")
        .select("id, table_number, qr_token, active")
        .order("table_number", { ascending: true });
      if (error) throw error;
      return data as CafeTable[];
    },
  });

  const addTable = useMutation({
    mutationFn: async (number: string) => {
      const { error } = await supabase
        .from("cafe_tables")
        .insert({ cafe_id: cafeId, table_number: number.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setTableNumber("");
      queryClient.invalidateQueries({ queryKey: ["tables", cafeId] });
      toast.success("Table added");
    },
    onError: (error: Error) =>
      toast.error(
        error.message.includes("duplicate") ? "That table number already exists" : error.message,
      ),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("cafe_tables").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tables", cafeId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const rotateToken = useMutation({
    mutationFn: async (id: string) => {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const token = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const { error } = await supabase.from("cafe_tables").update({ qr_token: token }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables", cafeId] });
      toast.success("New QR code generated — reprint this table's code");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <section className="surface-card p-5">
        <h2 className="font-display text-lg font-semibold">Add a table</h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (tableNumber.trim()) addTable.mutate(tableNumber);
          }}
        >
          <Input
            value={tableNumber}
            maxLength={20}
            placeholder="Table number, e.g. 3"
            onChange={(e) => setTableNumber(e.target.value)}
          />
          <Button type="submit" disabled={addTable.isPending}>
            <Plus className="size-4" /> Add
          </Button>
        </form>
      </section>

      {tables.isPending ? (
        <p className="text-sm text-muted-foreground">Loading tables…</p>
      ) : tables.data?.length === 0 ? (
        <p className="surface-card p-8 text-center text-sm text-muted-foreground">
          No tables yet. Add your first table above.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(tables.data ?? []).map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onToggle={(active) => toggleActive.mutate({ id: table.id, active })}
              onRotate={() => rotateToken.mutate(table.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TableCard({
  table,
  onToggle,
  onRotate,
}: {
  table: CafeTable;
  onToggle: (active: boolean) => void;
  onRotate: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [menuUrl, setMenuUrl] = useState("");

  useEffect(() => {
    const url = `${window.location.origin}/menu?t=${table.qr_token}`;
    setMenuUrl(url);
    QRCode.toDataURL(url, { width: 512, margin: 2 })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [table.qr_token]);

  return (
    <article className="surface-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Table
          </p>
          <p className="font-display text-2xl font-semibold">{table.table_number}</p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={table.active} onCheckedChange={onToggle} />
          {table.active ? "Active" : "Paused"}
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card p-3">
        {dataUrl ? (
          <img src={dataUrl} alt={`QR code for table ${table.table_number}`} className="w-full" />
        ) : (
          <div className="aspect-square animate-pulse rounded-lg bg-muted" />
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(menuUrl);
            toast.success("Menu link copied");
          }}
        >
          <Copy className="size-4" /> Copy link
        </Button>
        {dataUrl && (
          <Button size="sm" variant="outline" asChild>
            <a href={dataUrl} download={`table-${table.table_number}-qr.png`}>
              <Download className="size-4" /> PNG
            </a>
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onRotate}>
          <RefreshCw className="size-4" /> New code
        </Button>
      </div>
    </article>
  );
}
