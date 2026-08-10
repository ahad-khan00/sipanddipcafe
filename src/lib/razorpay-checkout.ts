/**
 * Loads Razorpay Checkout on demand and opens it. The publishable key id is
 * supplied by the server; the key secret never reaches the browser.
 */
export type CheckoutResult =
  | { ok: true; razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
  | { ok: false; reason: string };

const SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const w = window as unknown as { Razorpay?: unknown };
  if (w.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export async function openRazorpayCheckout(input: {
  key_id: string;
  provider_order_id: string;
  amount: number;
  currency: string;
  cafe_name: string;
  order_number: number;
  customer_name?: string | null;
  customer_phone?: string | null;
}): Promise<CheckoutResult> {
  const loaded = await loadScript();
  if (!loaded) return { ok: false, reason: "Could not load the payment window" };

  return new Promise((resolve) => {
    const Razorpay = (
      window as unknown as {
        Razorpay: new (options: Record<string, unknown>) => {
          open: () => void;
          on: (event: string, handler: (payload: unknown) => void) => void;
        };
      }
    ).Razorpay;

    let settled = false;
    const finish = (result: CheckoutResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const instance = new Razorpay({
      key: input.key_id,
      order_id: input.provider_order_id,
      amount: input.amount,
      currency: input.currency,
      name: input.cafe_name,
      description: `Order #${input.order_number}`,
      prefill: {
        name: input.customer_name ?? "",
        contact: input.customer_phone ?? "",
      },
      theme: { color: "#8a5a2b" },
      handler: (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) => finish({ ok: true, ...response }),
      modal: {
        ondismiss: () => finish({ ok: false, reason: "Payment window closed" }),
      },
    });

    instance.on("payment.failed", (payload: unknown) => {
      const description =
        (payload as { error?: { description?: string } })?.error?.description ?? "Payment failed";
      finish({ ok: false, reason: description });
    });

    instance.open();
  });
}
