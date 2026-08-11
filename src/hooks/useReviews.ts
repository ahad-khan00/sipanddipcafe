import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";

export type AdminReview = {
  id: string;
  order_id: string;
  rating: number;
  comment: string | null;
  display_name: string | null;
  hidden: boolean;
  flagged: boolean;
  created_at: string;
};

/**
 * Reviews for the owner's cafe. RLS restricts rows to cafe members, and the
 * database trigger allows owners to change only `hidden`/`flagged` — never the
 * customer's words.
 */
export function useReviews(cafeId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["reviews", cafeId],
    enabled: Boolean(cafeId),
    queryFn: async (): Promise<AdminReview[]> => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, order_id, rating, comment, display_name, hidden, flagged, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AdminReview[];
    },
  });

  useEffect(() => {
    if (!cafeId) return;
    const channel = supabase
      .channel(`reviews-${cafeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reviews", filter: `cafe_id=eq.${cafeId}` },
        () => queryClient.invalidateQueries({ queryKey: ["reviews", cafeId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cafeId, queryClient]);

  return query;
}

export async function moderateReview(id: string, patch: { hidden?: boolean; flagged?: boolean }) {
  const { error } = await supabase.from("reviews").update(patch).eq("id", id);
  if (error) throw error;
}

/** Average rating + count across visible reviews, computed from the same rows. */
export function ratingSummary(reviews: AdminReview[]): { average: number | null; total: number } {
  const visible = reviews.filter((r) => !r.hidden);
  if (visible.length === 0) return { average: null, total: 0 };
  const sum = visible.reduce((acc, r) => acc + r.rating, 0);
  return { average: Math.round((sum / visible.length) * 10) / 10, total: visible.length };
}
