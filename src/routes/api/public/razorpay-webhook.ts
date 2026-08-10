import { createFileRoute } from "@tanstack/react-router";

/**
 * Razorpay webhook. The signature is verified against the webhook secret before
 * anything is read from the payload, and every write funnels through the shared
 * idempotent settlement helper so duplicate deliveries are harmless.
 */
export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const signature = request.headers.get("x-razorpay-signature");

        const { verifyWebhookSignature, mapPaymentStatus } = await import(
          "@/lib/razorpay.server"
        );

        if (!verifyWebhookSignature(raw, signature)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: {
          event?: string;
          payload?: {
            payment?: {
              entity?: {
                id?: string;
                order_id?: string;
                status?: string;
                error_description?: string | null;
              };
            };
          };
        };
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const entity = payload.payload?.payment?.entity;
        if (!entity?.order_id) return new Response("ignored", { status: 200 });

        const event = payload.event ?? "";
        const status =
          event === "payment.captured" || event === "payment.authorized"
            ? "PAID"
            : event === "payment.failed"
              ? "FAILED"
              : event.startsWith("refund.")
                ? "REFUNDED"
                : mapPaymentStatus(entity.status ?? "");

        const { settlePayment } = await import("@/lib/payments.server");
        await settlePayment({
          providerOrderId: entity.order_id,
          providerPaymentId: entity.id ?? null,
          status,
          failureReason: entity.error_description ?? null,
        });

        return new Response("ok", { status: 200 });
      },
    },
  },
});
