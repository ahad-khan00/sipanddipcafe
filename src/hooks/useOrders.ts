import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { OrderStatus } from "@/lib/order-status";

export type AdminOrder = {
  id: string;
  order_number: number;
  status: OrderStatus;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  payment_method: string;
  payment_status: string;
  paid_at: string | null;
  table_id: string;
  cafe_tables: { table_number: string } | null;
  order_items: {
    id: string;
    item_name: string;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
  }[];
};

export function useOrders(cafeId: string | undefined) {
  const queryClient = useQueryClient();
  const knownIds = useRef<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ["orders", cafeId],
    enabled: Boolean(cafeId),
    queryFn: async (): Promise<AdminOrder[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, created_at, customer_name, customer_phone, notes, subtotal_cents, tax_cents, tip_cents, total_cents, payment_method, payment_status, paid_at, table_id, cafe_tables:table_id (table_number), order_items (id, item_name, quantity, unit_price_cents, line_total_cents)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AdminOrder[];
    },
    refetchOnWindowFocus: true,
  });

  // Realtime: refresh the board whenever an order changes and announce new ones.
  useEffect(() => {
    if (!cafeId) return;
    const channel = supabase
      .channel(`orders-${cafeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `cafe_id=eq.${cafeId}` },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["orders", cafeId] });
          if (payload.eventType === "INSERT") {
            const row = payload.new as { id: string; order_number: number };
            if (!knownIds.current.has(row.id)) {
              knownIds.current.add(row.id);
              toast.success(`New order #${row.order_number}`, {
                description: "A guest just placed an order.",
              });
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cafeId, queryClient]);

  useEffect(() => {
    for (const order of query.data ?? []) knownIds.current.add(order.id);
  }, [query.data]);

  return query;
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  const { error } = await supabase.from("orders").update({ status }).eq("id", id);
  if (error) throw error;
}

/**
 * Settles a pay-at-cafe order at the counter. The database guard only permits
 * PENDING -> PAID on CAFE orders; online payments are set by the provider.
 */
export async function markCafeOrderPaid(id: string) {
  const { error } = await supabase
    .from("orders")
    .update({ payment_status: "PAID" })
    .eq("id", id)
    .eq("payment_method", "CAFE")
    .eq("payment_status", "PENDING");
  if (error) throw error;
}
