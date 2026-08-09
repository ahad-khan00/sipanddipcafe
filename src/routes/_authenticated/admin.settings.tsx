import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "Cafe settings — Tablebrew dashboard" },
      { name: "description", content: "Update your cafe name, description and currency." },
      { property: "og:title", content: "Cafe settings — Tablebrew dashboard" },
      { property: "og:description", content: "Update your cafe name, description and currency." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AdminShell title="Settings" description="Details guests see at the top of your menu.">
      {(ctx) => (
        <SettingsForm
          cafeId={ctx.cafe.id}
          name={ctx.cafe.name}
          description={ctx.cafe.description ?? ""}
          currency={ctx.cafe.currency}
        />
      )}
    </AdminShell>
  );
}

function SettingsForm({
  cafeId,
  name: initialName,
  description: initialDescription,
  currency: initialCurrency,
}: {
  cafeId: string;
  name: string;
  description: string;
  currency: string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [currency, setCurrency] = useState(initialCurrency);

  useEffect(() => {
    setName(initialName);
    setDescription(initialDescription);
    setCurrency(initialCurrency);
  }, [initialName, initialDescription, initialCurrency]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("cafes")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          currency: currency.trim().toUpperCase().slice(0, 3),
        })
        .eq("id", cafeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cafe"] });
      toast.success("Settings saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <form
      className="surface-card max-w-xl space-y-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) {
          toast.error("Cafe name is required");
          return;
        }
        save.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="cafe-name">Cafe name</Label>
        <Input
          id="cafe-name"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cafe-description">Description</Label>
        <Textarea
          id="cafe-description"
          rows={3}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cafe-currency">Currency code</Label>
        <Input
          id="cafe-currency"
          maxLength={3}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
