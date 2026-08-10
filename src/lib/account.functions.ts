import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const trackingSchema = z.string().trim().regex(/^[a-f0-9]{32,128}$/i, "Invalid tracking code");

export type MyOrder = {
  id: string;
  tracking_token: string;
  order_number: number;
  status: string;
  created_at: string;
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  payment_method: string;
  payment_status: string;
  currency: string;
  cafe_name: string;
  table_number: string;
  reviewed: boolean;
  items: { id: string; item_name: string; quantity: number; line_total_cents: number }[];
};

/**
 * Order history for a signed-in customer. Scoped strictly to
 * `customer_id = auth.uid()` — the id comes from the verified bearer token, never
 * from the request body.
 */
export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyOrder[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, tracking_token, order_number, status, created_at, subtotal_cents, tax_cents, tip_cents, total_cents, payment_method, payment_status, cafes:cafe_id (name, currency), cafe_tables:table_id (table_number), order_items (id, item_name, quantity, line_total_cents), reviews (id)",
      )
      .eq("customer_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("getMyOrders failed", error);
      throw new Error("Could not load your orders");
    }

    return (data ?? []).map((row) => {
      const o = row as unknown as {
        id: string;
        tracking_token: string;
        order_number: number;
        status: string;
        created_at: string;
        subtotal_cents: number;
        tax_cents: number;
        tip_cents: number;
        total_cents: number;
        payment_method: string;
        payment_status: string;
        cafes: { name: string; currency: string } | null;
        cafe_tables: { table_number: string } | null;
        order_items: MyOrder["items"];
        reviews: { id: string }[] | null;
      };
      return {
        id: o.id,
        tracking_token: o.tracking_token,
        order_number: o.order_number,
        status: o.status,
        created_at: o.created_at,
        subtotal_cents: o.subtotal_cents,
        tax_cents: o.tax_cents,
        tip_cents: o.tip_cents,
        total_cents: o.total_cents,
        payment_method: o.payment_method,
        payment_status: o.payment_status,
        currency: o.cafes?.currency ?? "INR",
        cafe_name: o.cafes?.name ?? "Cafe",
        table_number: o.cafe_tables?.table_number ?? "—",
        reviewed: (o.reviews?.length ?? 0) > 0,
        items: o.order_items ?? [],
      };
    });
  });

/**
 * Links a guest order to the signed-in account. Requires the order's secret
 * tracking token, and the database guard only permits this once — an order that
 * already belongs to someone can never be reassigned.
 */
export const claimOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), token: trackingSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ claimed: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id")
      .eq("id", data.id)
      .eq("tracking_token", data.token)
      .maybeSingle();

    if (!order) return { claimed: false };
    if (order.customer_id) return { claimed: order.customer_id === context.userId };

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ customer_id: context.userId })
      .eq("id", order.id)
      .is("customer_id", null);

    if (error) {
      console.error("claimOrder failed", error);
      return { claimed: false };
    }
    return { claimed: true };
  });
