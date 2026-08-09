import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ImagePlus, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, parseMoneyToCents } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/admin/menu")({
  head: () => ({
    meta: [
      { title: "Menu management — Tablebrew dashboard" },
      { name: "description", content: "Add food items, set prices, upload images and manage availability." },
      { property: "og:title", content: "Menu management — Tablebrew dashboard" },
      {
        property: "og:description",
        content: "Add food items, set prices, upload images and manage availability.",
      },
    ],
  }),
  component: MenuAdminPage,
});

type Category = { id: string; name: string; sort_order: number; active: boolean };
type Item = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  available: boolean;
  active: boolean;
  sort_order: number;
};

function MenuAdminPage() {
  return (
    <AdminShell title="Menu" description="Only available items can be ordered by guests.">
      {(ctx) => <MenuAdmin cafeId={ctx.cafe.id} currency={ctx.cafe.currency} />}
    </AdminShell>
  );
}

function MenuAdmin({ cafeId, currency }: { cafeId: string; currency: string }) {
  const queryClient = useQueryClient();
  const [newCategory, setNewCategory] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const categories = useQuery({
    queryKey: ["categories", cafeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_categories")
        .select("id, name, sort_order, active")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Category[];
    },
  });

  const items = useQuery({
    queryKey: ["menu-items", cafeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select(
          "id, category_id, name, description, price_cents, image_url, available, active, sort_order",
        )
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Item[];
    },
  });

  const signedImages = useQuery({
    queryKey: ["menu-images", cafeId, items.data?.map((i) => i.image_url).join("|")],
    enabled: Boolean(items.data),
    queryFn: async () => {
      const paths = (items.data ?? [])
        .map((i) => i.image_url)
        .filter((p): p is string => Boolean(p) && !p!.startsWith("http"));
      const map: Record<string, string> = {};
      await Promise.all(
        paths.map(async (path) => {
          const { data } = await supabase.storage.from("menu-images").createSignedUrl(path, 3600);
          if (data?.signedUrl) map[path] = data.signedUrl;
        }),
      );
      return map;
    },
  });

  const addCategory = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("menu_categories").insert({
        cafe_id: cafeId,
        name: name.trim(),
        sort_order: (categories.data?.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewCategory("");
      queryClient.invalidateQueries({ queryKey: ["categories", cafeId] });
      toast.success("Category added");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("menu_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", cafeId] });
      queryClient.invalidateQueries({ queryKey: ["menu-items", cafeId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleAvailability = useMutation({
    mutationFn: async ({ id, available }: { id: string; available: boolean }) => {
      const { error } = await supabase.from("menu_items").update({ available }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["menu-items", cafeId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const deactivateItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("menu_items")
        .update({ active: false, available: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu-items", cafeId] });
      toast.success("Item removed from the menu");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function imageSrc(item: Item): string | null {
    if (!item.image_url) return null;
    if (item.image_url.startsWith("http")) return item.image_url;
    return signedImages.data?.[item.image_url] ?? null;
  }

  return (
    <div className="space-y-6">
      <section className="surface-card p-5">
        <h2 className="font-display text-lg font-semibold">Categories</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(categories.data ?? []).map((category) => (
            <span
              key={category.id}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm"
            >
              {category.name}
              <button
                type="button"
                aria-label={`Delete ${category.name}`}
                onClick={() => deleteCategory.mutate(category.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
          {(categories.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          )}
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (newCategory.trim()) addCategory.mutate(newCategory);
          }}
        >
          <Input
            value={newCategory}
            maxLength={80}
            placeholder="e.g. Coffee, Pastries"
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <Button type="submit" disabled={addCategory.isPending}>
            <Plus className="size-4" /> Add
          </Button>
        </form>
      </section>

      <section className="surface-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Food items</h2>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" /> Add item
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {items.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
          {items.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No items yet. Add your first food item to build the menu.
            </p>
          )}
          {(items.data ?? []).map((item) => {
            const src = imageSrc(item);
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-3"
              >
                <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {src ? (
                    <img src={src} alt={item.name} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <UtensilsCrossed className="size-5 text-muted-foreground" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="min-w-40 flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatMoney(item.price_cents, currency)}
                    {item.category_id
                      ? ` · ${categories.data?.find((c) => c.id === item.category_id)?.name ?? ""}`
                      : ""}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={item.available}
                    onCheckedChange={(available) =>
                      toggleAvailability.mutate({ id: item.id, available })
                    }
                  />
                  {item.available ? "Available" : "Unavailable"}
                </label>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => {
                      setEditing(item);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${item.name}`}
                    onClick={() => deactivateItem.mutate(item.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <ItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        cafeId={cafeId}
        categories={categories.data ?? []}
        item={editing}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["menu-items", cafeId] });
          setDialogOpen(false);
        }}
      />
    </div>
  );
}

function ItemDialog({
  open,
  onOpenChange,
  cafeId,
  categories,
  item,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cafeId: string;
  categories: Category[];
  item: Item | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [available, setAvailable] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setDescription(item?.description ?? "");
    setPrice(item ? (item.price_cents / 100).toFixed(2) : "");
    setCategoryId(item?.category_id ?? "none");
    setAvailable(item?.available ?? true);
    setFile(null);
  }, [open, item]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const priceCents = parseMoneyToCents(price);
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (priceCents === null) {
      toast.error("Enter a valid price");
      return;
    }

    setBusy(true);
    try {
      let imagePath = item?.image_url ?? null;

      if (file) {
        if (file.size > 5 * 1024 * 1024) throw new Error("Images must be under 5 MB");
        if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed");
        const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${cafeId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("menu-images")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        imagePath = path;
      }

      const payload = {
        cafe_id: cafeId,
        name: name.trim(),
        description: description.trim() || null,
        price_cents: priceCents,
        category_id: categoryId === "none" ? null : categoryId,
        available,
        image_url: imagePath,
      };

      if (item) {
        const { error } = await supabase.from("menu_items").update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("menu_items").insert(payload);
        if (error) throw error;
      }

      toast.success(item ? "Item updated" : "Item added");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this item");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit item" : "Add food item"}</DialogTitle>
          <DialogDescription>
            Guests see this on the menu. Unavailable items cannot be ordered.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={save}>
          <div className="space-y-1.5">
            <Label htmlFor="item-name">Name</Label>
            <Input
              id="item-name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item-description">Description</Label>
            <Textarea
              id="item-description"
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="item-price">Price</Label>
              <Input
                id="item-price"
                required
                inputMode="decimal"
                placeholder="4.50"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-category">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="item-category">
                  <SelectValue placeholder="Uncategorised" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorised</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item-image" className="flex items-center gap-2">
              <ImagePlus className="size-4" aria-hidden /> Image
            </Label>
            <Input
              id="item-image"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <label className="flex items-center gap-3 text-sm">
            <Switch checked={available} onCheckedChange={setAvailable} />
            Available to order
          </label>

          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : item ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
