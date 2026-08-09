import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type CafeContext = {
  cafe: {
    id: string;
    name: string;
    description: string | null;
    currency: string;
    tax_rate: number;
  };
  role: string;
};

/**
 * Loads the cafe the signed-in user belongs to. RLS guarantees only cafes the
 * user is a member of are ever returned.
 */
export function useCafe() {
  return useQuery({
    queryKey: ["my-cafe"],
    queryFn: async (): Promise<CafeContext | null> => {
      const { data, error } = await supabase
        .from("cafe_members")
        .select("role, cafes:cafe_id (id, name, description, currency, tax_rate)")
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data?.cafes) return null;
      const cafe = data.cafes as unknown as CafeContext["cafe"];
      return {
        role: data.role,
        cafe: { ...cafe, tax_rate: Number(cafe.tax_rate) },
      };
    },
    staleTime: 60_000,
  });
}
