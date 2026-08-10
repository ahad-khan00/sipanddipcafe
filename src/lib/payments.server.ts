import {
  fetchRazorpayPayment,
  getRazorpayConfig,
  mapPaymentStatus,
} from "./razorpay.server";

/**
 * Single, idempotent place where a payment outcome is written. Both the
 * checkout callback and the Razorpay webhook funnel through here, so repeated
 * or out-of-order callbacks can never double-charge, duplicate a payment row
 * or downgrade an already-paid order.
 */
export async function settlePayment(input: {
  providerOrderId: string;
  providerPaymentId?: string | null;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  failureReason?: string | null;
}): Promise<{ order_id: string; status: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id, order_id, status, amount_cents")
    .eq("provider", "razorpay")
    .eq("provider_order_id", input.providerOrderId)
    .maybeSingle();

  if (!payment) {
    console.error("settlePayment: unknown razorpay order", input.providerOrderId);
    return null;
  }

  // Terminal states win: never move PAID/REFUNDED backwards.
  if (payment.status === "PAID" && input.status !== "REFUNDED") {
    return { order_id: payment.order_id, status: payment.status };
  }
  if (payment.status === "REFUNDED") {
    return { order_id: payment.order_id, status: payment.status };
  }

  await supabaseAdmin
    .from("payments")
    .update({
      status: input.status,
      provider_payment_id: input.providerPaymentId ?? null,
      failure_reason: input.failureReason ?? null,
    })
    .eq("id", payment.id);

  if (input.status === "PAID" || input.status === "REFUNDED" || input.status === "FAILED") {
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ payment_status: input.status })
      .eq("id", payment.order_id)
      .neq("payment_status", "PAID");
    if (error) console.error("settlePayment: order update failed", error);
  }

  return { order_id: payment.order_id, status: input.status };
}

/**
 * Re-reads the payment from Razorpay (never trusting the browser's claim) and
 * settles it.
 */
export async function confirmPaymentWithProvider(
  providerOrderId: string,
  providerPaymentId: string,
): Promise<{ order_id: string; status: string } | null> {
  const config = getRazorpayConfig();
  if (!config) return null;

  const payment = await fetchRazorpayPayment(config, providerPaymentId);
  if (!payment || payment.order_id !== providerOrderId) {
    return settlePayment({
      providerOrderId,
      providerPaymentId,
      status: "FAILED",
      failureReason: "Payment could not be verified with the provider",
    });
  }

  return settlePayment({
    providerOrderId,
    providerPaymentId: payment.id,
    status: mapPaymentStatus(payment.status),
    failureReason: payment.error_description ?? null,
  });
}
