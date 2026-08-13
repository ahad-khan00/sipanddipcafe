import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

const tokenSchema = z.string().trim().regex(/^[a-f0-9]{16,128}$/i, "Invalid table code");
const trackingSchema = z.string().trim().regex(/^[a-f0-9]{32,128}$/i, "Invalid tracking code");

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
  tip_cents: z.number().int().min(0).max(500000).optional(),
  payment_method: z.enum(["ONLINE", "CAFE"]),
  request_key: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
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

export type CafeReview = {
  id: string;
  rating: number;
  comment: string | null;
  display_name: string | null;
  created_at: string;
};

export type PublicMenu = {
  cafe: { name: string; description: string | null; currency: string; tax_rate: number };
  table: { table_number: string };
  rating: { average: number | null; total: number };
  reviews: CafeReview[];
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
  client: {
    storage: {
      from: (b: string) => {
        createSignedUrl: (p: string, e: number) => Promise<{ data: { signedUrl: string } | null }>;
      };
    };
  },
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await client.storage.from("menu-images").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/** Resolve a QR token to its cafe + table and return the live menu. */
export const getMenuByToken = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => ({ token: tokenSchema.parse(input.token) }))
  .handler(async ({ data }): Promise<PublicMenu> => {
    const { data: table, error: tableError } = await supabase
      .from("cafe_tables")
      .select("id, table_number, active, cafe_id")
      .eq("qr_token", data.token)
      .maybeSingle();

    if (tableError) throw new Error("Could not load this table");
    if (!table || !table.active)
      throw new Error("This QR code is not active. Please ask a staff member.");

    const [{ data: cafe }, { data: categories }, { data: items }, { data: summary }, { data: reviews }] =
      await Promise.all([
        supabase
          .from("cafes")
          .select("name, description, currency, tax_rate")
          .eq("id", table.cafe_id)
          .single(),
        supabase
          .from("menu_categories")
          .select("id, name")
          .eq("cafe_id", table.cafe_id)
          .eq("active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("menu_items")
          .select("id, category_id, name, description, price_cents, image_url, available")
          .eq("cafe_id", table.cafe_id)
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase.rpc("cafe_rating_summary", { _cafe_id: table.cafe_id }),
        supabase
          .from("reviews")
          .select("id, rating, comment, display_name, created_at")
          .eq("cafe_id", table.cafe_id)
          .eq("hidden", false)
          .not("comment", "is", null)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

    if (!cafe) throw new Error("Cafe not found");

    const withImages = await Promise.all(
      (items ?? []).map(async (item) => ({
        ...item,
        image_url: await signImage(supabase as never, item.image_url),
      })),
    );

    const row = Array.isArray(summary) ? summary[0] : null;

    return {
      cafe: {
        name: cafe.name,
        description: cafe.description,
        currency: cafe.currency,
        tax_rate: Number(cafe.tax_rate),
      },
      table: { table_number: table.table_number },
      rating: {
        average: row?.average != null ? Number(row.average) : null,
        total: Number(row?.total ?? 0),
      },
      reviews: (reviews ?? []) as CafeReview[],
      categories: categories ?? [],
      items: withImages,
    };
  });

/**
 * Places an order. The client sends only the table token, item ids, quantities,
 * a tip and the chosen payment method. Cafe, prices, availability, tax, tip
 * bounds and totals are all resolved server-side in one atomic transaction, and
 * the request key makes a double-tap idempotent.
 */
export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => placeOrderSchema.parse(input))
  .handler(
    async ({
      data,
    }): Promise<{
      order_id: string;
      tracking_token: string;
      total_cents: number;
      duplicate: boolean;
    }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const merged = new Map<string, number>();
      for (const line of data.items) {
        merged.set(
          line.menu_item_id,
          Math.min(50, (merged.get(line.menu_item_id) ?? 0) + line.quantity),
        );
      }

      const { data: result, error } = await supabaseAdmin.rpc("place_order", {
        _table_token: data.token,
        _customer_name: data.customer_name ?? "",
        _customer_phone: data.customer_phone ?? "",
        _notes: data.notes ?? "",
        _items: Array.from(merged.entries()).map(([menu_item_id, quantity]) => ({
          menu_item_id,
          quantity,
        })),
        _tip_cents: data.tip_cents ?? 0,
        _payment_method: data.payment_method,
        _request_key: data.request_key,
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
        if (message.includes("INVALID_TIP")) throw new Error("That tip amount is not allowed.");
        console.error("place_order failed", error);
        throw new Error("We could not place your order. Please try again.");
      }

      return result as unknown as {
        order_id: string;
        tracking_token: string;
        total_cents: number;
        duplicate: boolean;
      };
    },
  );

export type PublicOrder = {
  id: string;
  order_number: number;
  status: string;
  created_at: string;
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  payment_method: string;
  payment_status: string;
  customer_name: string | null;
  notes: string | null;
  table_number: string;
  cafe_name: string;
  currency: string;
  reviewed: boolean;
  items: {
    id: string;
    item_name: string;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
  }[];
};

const orderAccessSchema = z.object({ id: z.string().uuid(), token: trackingSchema });

/**
 * Order tracking for guests. Access requires the order's secret tracking token,
 * so a leaked or guessed order id alone reveals nothing.
 */
export const getOrder = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => orderAccessSchema.parse(input))
  .handler(async ({ data }): Promise<PublicOrder> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, status, created_at, subtotal_cents, tax_cents, tip_cents, total_cents, payment_method, payment_status, customer_name, notes, cafe_id, table_id",
      )
      .eq("id", data.id)
      .eq("tracking_token", data.token)
      .maybeSingle();

    if (error) throw new Error("Could not load this order");
    if (!order) throw new Error("Order not found, or this tracking link is no longer valid.");

    const [{ data: cafe }, { data: table }, { data: items }, { count }] = await Promise.all([
      supabaseAdmin.from("cafes").select("name, currency").eq("id", order.cafe_id).single(),
      supabaseAdmin.from("cafe_tables").select("table_number").eq("id", order.table_id).single(),
      supabaseAdmin
        .from("order_items")
        .select("id, item_name, quantity, unit_price_cents, line_total_cents")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("order_id", order.id),
    ]);

    return {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      created_at: order.created_at,
      subtotal_cents: order.subtotal_cents,
      tax_cents: order.tax_cents,
      tip_cents: order.tip_cents,
      total_cents: order.total_cents,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      customer_name: order.customer_name,
      notes: order.notes,
      table_number: table?.table_number ?? "—",
      cafe_name: cafe?.name ?? "Cafe",
      currency: cafe?.currency ?? "INR",
      reviewed: (count ?? 0) > 0,
      items: items ?? [],
    };
  });

export type CheckoutSession = {
  key_id: string;
  provider_order_id: string;
  amount: number;
  currency: string;
  order_number: number;
  cafe_name: string;
};

/**
 * Starts (or resumes) an online payment. The payable amount comes only from the
 * stored order row — never from the browser.
 */
export const startOnlinePayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => orderAccessSchema.parse(input))
  .handler(async ({ data }): Promise<CheckoutSession> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRazorpayConfig, createRazorpayOrder } = await import("./razorpay.server");

    const config = getRazorpayConfig();
    if (!config)
      throw new Error("Online payment is not configured yet. Please choose Pay at cafe.");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, total_cents, payment_method, payment_status, cafe_id, status")
      .eq("id", data.id)
      .eq("tracking_token", data.token)
      .maybeSingle();

    if (!order) throw new Error("Order not found.");
    if (order.payment_status === "PAID") throw new Error("This order is already paid.");
    if (order.status === "CANCELLED") throw new Error("This order was cancelled.");

    const { data: cafe } = await supabaseAdmin
      .from("cafes")
      .select("name, currency")
      .eq("id", order.cafe_id)
      .single();
    const currency = cafe?.currency || "INR";

    // Resume an existing pending attempt instead of creating a second one.
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("provider_order_id, amount_cents, status")
      .eq("order_id", order.id)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && existing.amount_cents === order.total_cents) {
      return {
        key_id: config.keyId,
        provider_order_id: existing.provider_order_id,
        amount: existing.amount_cents,
        currency,
        order_number: order.order_number,
        cafe_name: cafe?.name ?? "Cafe",
      };
    }

    const providerOrder = await createRazorpayOrder(config, {
      amount: order.total_cents,
      currency,
      receipt: `order_${order.order_number}_${order.id.slice(0, 8)}`,
      notes: { order_id: order.id },
    });

    const { error: insertError } = await supabaseAdmin.from("payments").insert({
      order_id: order.id,
      cafe_id: order.cafe_id,
      provider: "razorpay",
      provider_order_id: providerOrder.id,
      status: "PENDING",
      amount_cents: order.total_cents,
      currency,
    });
    if (insertError) {
      console.error("payment insert failed", insertError);
      throw new Error("Could not start the payment. Please try again.");
    }

    return {
      key_id: config.keyId,
      provider_order_id: providerOrder.id,
      amount: order.total_cents,
      currency,
      order_number: order.order_number,
      cafe_name: cafe?.name ?? "Cafe",
    };
  });

const confirmSchema = orderAccessSchema.extend({
  razorpay_order_id: z.string().trim().min(6).max(64),
  razorpay_payment_id: z.string().trim().min(6).max(64),
  razorpay_signature: z.string().trim().min(16).max(256),
});

/**
 * Verifies the checkout callback signature and then re-reads the payment from
 * Razorpay before anything is marked PAID. The browser's own claim of success
 * is never trusted, and repeat callbacks are idempotent.
 */
export const confirmPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => confirmSchema.parse(input))
  .handler(async ({ data }): Promise<{ payment_status: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRazorpayConfig, verifyCheckoutSignature } = await import("./razorpay.server");
    const { confirmPaymentWithProvider } = await import("./payments.server");

    const config = getRazorpayConfig();
    if (!config) throw new Error("Online payment is not configured.");

    // The tracking token proves the caller owns this order.
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("id", data.id)
      .eq("tracking_token", data.token)
      .maybeSingle();
    if (!order) throw new Error("Order not found.");

    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("order_id")
      .eq("provider", "razorpay")
      .eq("provider_order_id", data.razorpay_order_id)
      .maybeSingle();
    if (!payment || payment.order_id !== order.id)
      throw new Error("This payment does not belong to your order.");

    if (!verifyCheckoutSignature(config, data)) {
      const { settlePayment } = await import("./payments.server");
      await settlePayment({
        providerOrderId: data.razorpay_order_id,
        providerPaymentId: data.razorpay_payment_id,
        status: "FAILED",
        failureReason: "Invalid checkout signature",
      });
      throw new Error("We could not verify this payment.");
    }

    const result = await confirmPaymentWithProvider(
      data.razorpay_order_id,
      data.razorpay_payment_id,
    );
    return { payment_status: result?.status ?? "PENDING" };
  });

/** Records a failed or dismissed checkout so the customer can retry cleanly. */
export const reportPaymentFailure = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    orderAccessSchema
      .extend({
        razorpay_order_id: z.string().trim().min(6).max(64),
        reason: z.string().trim().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { settlePayment } = await import("./payments.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("id", data.id)
      .eq("tracking_token", data.token)
      .maybeSingle();
    if (!order) return { ok: true };

    await settlePayment({
      providerOrderId: data.razorpay_order_id,
      status: "FAILED",
      failureReason: data.reason?.slice(0, 200) ?? "Payment not completed",
    });
    return { ok: true };
  });

const reviewSchema = orderAccessSchema.extend({
  rating: z.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .min(5)
    .max(500)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  display_name: z.string().trim().max(40).optional().nullable(),
});

/**
 * Submits a rating (and optional review). Eligibility, completion state and the
 * one-review-per-order rule are all enforced inside the database function.
 */
export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.rpc("submit_review", {
      _order_id: data.id,
      _tracking_token: data.token,
      _rating: data.rating,
      ...(data.comment ? { _comment: data.comment } : {}),
      ...(data.display_name ? { _display_name: data.display_name } : {}),
    });

    if (error) {
      const message = error.message || "";
      if (message.includes("ALREADY_REVIEWED"))
        throw new Error("You have already reviewed this order. Thank you!");
      if (message.includes("ORDER_NOT_COMPLETED"))
        throw new Error("You can review once your order is completed.");
      if (message.includes("NOT_ELIGIBLE") || message.includes("ORDER_NOT_FOUND"))
        throw new Error("This review link is not valid.");
      if (message.includes("INVALID_REVIEW_LENGTH"))
        throw new Error("Please write between 5 and 500 characters.");
      if (message.includes("INVALID_RATING")) throw new Error("Please pick 1 to 5 stars.");
      console.error("submit_review failed", error);
      throw new Error("We could not save your review. Please try again.");
    }
    return { ok: true };
  });
