export const ORDER_STATUSES = [
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "New",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const STATUS_CUSTOMER_COPY: Record<OrderStatus, string> = {
  NEW: "Sent to the kitchen — waiting to be accepted.",
  ACCEPTED: "The cafe accepted your order.",
  PREPARING: "Your order is being prepared.",
  READY: "Ready! Please collect it at the counter.",
  COMPLETED: "Order completed. Enjoy!",
  CANCELLED: "This order was cancelled. Please speak to a staff member.",
};

/** Tailwind classes per status, built from semantic design tokens. */
export const STATUS_CLASS: Record<OrderStatus, string> = {
  NEW: "bg-accent/20 text-accent-foreground border-accent/40",
  ACCEPTED: "bg-info/15 text-info border-info/30",
  PREPARING: "bg-warning/20 text-warning-foreground border-warning/40",
  READY: "bg-success/15 text-success border-success/30",
  COMPLETED: "bg-muted text-muted-foreground border-border",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/30",
};

export const NEXT_STATUS: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  NEW: { to: "ACCEPTED", label: "Accept order" },
  ACCEPTED: { to: "PREPARING", label: "Start preparing" },
  PREPARING: { to: "READY", label: "Mark ready" },
  READY: { to: "COMPLETED", label: "Complete order" },
};

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}
