import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay REST helpers. This module is server-only (blocked from client
 * bundles by the `.server.ts` filename) and is the ONLY place the key secret
 * is ever read.
 */

const API = "https://api.razorpay.com/v1";

export type RazorpayConfig = { keyId: string; keySecret: string };

export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

function authHeader({ keyId, keySecret }: RazorpayConfig): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

/** Creates a Razorpay order. `amount` is the smallest currency unit (paise). */
export async function createRazorpayOrder(
  config: RazorpayConfig,
  input: { amount: number; currency: string; receipt: string; notes?: Record<string, string> },
): Promise<RazorpayOrder> {
  const response = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: authHeader(config) },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes ?? {},
      payment_capture: 1,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("razorpay create order failed", response.status, detail);
    throw new Error("Could not start the online payment. Please try again or pay at the cafe.");
  }
  return (await response.json()) as RazorpayOrder;
}

export type RazorpayPayment = {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  currency: string;
  error_description?: string | null;
};

/** Fetches the authoritative payment record from Razorpay. */
export async function fetchRazorpayPayment(
  config: RazorpayConfig,
  paymentId: string,
): Promise<RazorpayPayment | null> {
  const response = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: authHeader(config) },
  });
  if (!response.ok) {
    console.error("razorpay fetch payment failed", response.status, await response.text());
    return null;
  }
  return (await response.json()) as RazorpayPayment;
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Verifies the checkout handler signature: HMAC(order_id|payment_id, key_secret). */
export function verifyCheckoutSignature(
  config: RazorpayConfig,
  input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
): boolean {
  const expected = createHmac("sha256", config.keySecret)
    .update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`)
    .digest("hex");
  return safeEqualHex(expected, input.razorpay_signature);
}

/** Verifies a webhook body against the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env["RAZORPAY_WEBHOOK_SECRET"];
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Maps a Razorpay payment status onto our internal payment status. */
export function mapPaymentStatus(status: string): "PENDING" | "PAID" | "FAILED" | "REFUNDED" {
  switch (status) {
    case "captured":
    case "authorized":
      return "PAID";
    case "failed":
      return "FAILED";
    case "refunded":
      return "REFUNDED";
    default:
      return "PENDING";
  }
}
