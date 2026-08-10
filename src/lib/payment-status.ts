export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Payment pending",
  PAID: "Paid",
  FAILED: "Payment failed",
  REFUNDED: "Refunded",
};

export const PAYMENT_STATUS_CLASS: Record<string, string> = {
  PENDING: "bg-warning/20 text-warning-foreground border-warning/40",
  PAID: "bg-success/15 text-success border-success/30",
  FAILED: "bg-destructive/10 text-destructive border-destructive/30",
  REFUNDED: "bg-muted text-muted-foreground border-border",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  ONLINE: "Paid online",
  CAFE: "Pay at cafe",
};

/** Owner-facing summary of how an order is being settled. */
export function paymentSummary(method: string, status: string): string {
  if (method === "CAFE") return status === "PAID" ? "Cash / at cafe · paid" : "Pay at cafe";
  return status === "PAID" ? "Online · paid" : `Online · ${(PAYMENT_STATUS_LABEL[status] ?? status).toLowerCase()}`;
}
