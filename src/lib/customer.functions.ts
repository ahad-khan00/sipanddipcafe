import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.string().trim().regex(/^[a-f0-9]{16,128}$/i, "Invalid table code");

const placeOrderSchema = z.object({
  token: tokenSchema,
  customer_name: z.string().trim().max(80).optional().nullable(),
  customer_phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+\-()\s]*$/, "Invalid phone number")
    .optional()
    .nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        menu_item_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .min(1)
    .max(40),
});

export type PublicMenu = {
  cafe: { name: string; description: string | null; currency: string; tax_rate: number };
  table: { table_number: string };
  categories: { id: string; name: string }[];
  items: {
    id: string;
    category_id: string | null;
    name: string;
    description: string | null;
    price_cents: number;
    image_url: string | null;
    available: boolean;
  }[];
};

async function signImage(
  admin: { storage: { from: (b: string) => { createSignedUrl: (p: string, e: number) => Promise<{ data: { signedUrl: string } | null }> } } },
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await admin.storage.from("menu-images").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/** Resolve a QR token to its cafe + table and return the live menu. */
export const getMenuByToken = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => ({ token: tokenSchema.parse(input.token) }))
  .handler(async ({ data }): Promise<PublicMenu> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: table, error: tableError } = await supabaseAdmin
      .from("cafe_tables")
      .select("id, table_number, active, cafe_id")
      .eq("qr_token", data.token)
      .maybeSingle();

    if (tableError) throw new Error("Could not load this table");
    if (!table || !table.active) throw new Error("This QR code is not active. Please ask a staff member.");

    const [{ data: cafe }, { data: categories }, { data: items }] = await Promise.all([
      supabaseAdmin
        .from("cafes")
        .select("name, description, currency, tax_rate")
        .eq("id", table.cafe_id)
        .single(),
      supabaseAdmin
        .from("menu_categories")
        .select("id, name")
        .eq("cafe_id", table.cafe_id)
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("menu_items")
        .select("id, category_id, name, description, price_cents, image_url, available")
        .eq("cafe_id", table.cafe_id)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (!cafe) throw new Error("Cafe not found");

    const withImages = await Promise.all(
      (items ?? []).map(async (item) => ({
        ...item,
        image_url: await signImage(supabaseAdmin as never, item.image_url),
      })),
    );

    return {
      cafe: {
        name: cafe.name,
        description: cafe.description,
        currency: cafe.currency,
        tax_rate: Number(cafe.tax_rate),
      },
      table: { table_number: table.table_number },
      categories: categories ?? [],
      items: withImages,
    };
  });

/**
 * Places an order. The client sends only the table token, item ids and quantities.
 * Cafe, prices, availability and totals are all resolved server-side in a single
 * atomic database transaction.
 */
export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => placeOrderSchema.parse(input))
  .handler(async ({ data }): Promise<{ order_id: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const merged = new Map<string, number>();
    for (const line of data.items) {
      merged.set(line.menu_item_id, Math.min(50, (merged.get(line.menu_item_id) ?? 0) + line.quantity));
    }

    const { data: orderId, error } = await supabaseAdmin.rpc("place_order", {
      _table_token: data.token,
      _customer_name: data.customer_name ?? "",
      _customer_phone: data.customer_phone ?? "",
      _notes: data.notes ?? "",
      _items: Array.from(merged.entries()).map(([menu_item_id, quantity]) => ({
        menu_item_id,
        quantity,
      })),
    });

    if (error) {
      const message = error.message || "";
      if (message.includes("RATE_LIMITED"))
        throw new Error("Too many orders from this table just now. Please wait a moment.");
      if (message.includes("ITEM_UNAVAILABLE"))
        throw new Error("One of your items just became unavailable. Please review your cart.");
      if (message.includes("INVALID_TABLE")) throw new Error("This QR code is no longer valid.");
      if (message.includes("EMPTY_CART")) throw new Error("Your cart is empty.");
      if (message.includes("INVALID_QUANTITY")) throw new Error("Invalid quantity.");
      console.error("place_order failed", error);
      throw new Error("We could not place your order. Please try again.");
    }

    return { order_id: orderId as unknown as string };
  });

export type PublicOrder = {
  id: string;
  order_number: number;
  status: string;
  created_at: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  customer_name: string | null;
  notes: string | null;
  table_number: string;
  cafe_name: string;
  currency: string;
  items: { id: string; item_name: string; quantity: number; unit_price_cents: number; line_total_cents: number }[];
};

/** Order tracking. The unguessable order id acts as the bearer of access. */
export const getOrder = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => ({ id: z.string().uuid().parse(input.id) }))
  .handler(async ({ data }): Promise<PublicOrder> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, created_at, subtotal_cents, tax_cents, total_cents, customer_name, notes, cafe_id, table_id",
      )
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error("Could not load this order");
    if (!order) throw new Error("Order not found");

    const [{ data: cafe }, { data: table }, { data: items }] = await Promise.all([
      supabaseAdmin.from("cafes").select("name, currency").eq("id", order.cafe_id).single(),
      supabaseAdmin.from("cafe_tables").select("table_number").eq("id", order.table_id).single(),
      supabaseAdmin
        .from("order_items")
        .select("id, item_name, quantity, unit_price_cents, line_total_cents")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true }),
    ]);

    return {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      created_at: order.created_at,
      subtotal_cents: order.subtotal_cents,
      tax_cents: order.tax_cents,
      total_cents: order.total_cents,
      customer_name: order.customer_name,
      notes: order.notes,
      table_number: table?.table_number ?? "—",
      cafe_name: cafe?.name ?? "Cafe",
      currency: cafe?.currency ?? "USD",
      items: items ?? [],
    };
  });
