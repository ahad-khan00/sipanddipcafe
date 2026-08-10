export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      cafe_members: {
        Row: {
          cafe_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["cafe_role"]
          user_id: string
        }
        Insert: {
          cafe_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["cafe_role"]
          user_id: string
        }
        Update: {
          cafe_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["cafe_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cafe_members_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
        ]
      }
      cafe_tables: {
        Row: {
          active: boolean
          cafe_id: string
          created_at: string
          id: string
          qr_token: string
          table_number: string
        }
        Insert: {
          active?: boolean
          cafe_id: string
          created_at?: string
          id?: string
          qr_token?: string
          table_number: string
        }
        Update: {
          active?: boolean
          cafe_id?: string
          created_at?: string
          id?: string
          qr_token?: string
          table_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "cafe_tables_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
        ]
      }
      cafes: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          name: string
          order_seq: number
          slug: string | null
          tax_rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name: string
          order_seq?: number
          slug?: string | null
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          name?: string
          order_seq?: number
          slug?: string | null
          tax_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      customer_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          active: boolean
          cafe_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          cafe_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          cafe_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean
          available: boolean
          cafe_id: string
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          price_cents: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          available?: boolean
          cafe_id: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price_cents: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          available?: boolean
          cafe_id?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          item_name: string
          line_total_cents: number
          menu_item_id: string | null
          order_id: string
          quantity: number
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          line_total_cents: number
          menu_item_id?: string | null
          order_id: string
          quantity: number
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          line_total_cents?: number
          menu_item_id?: string | null
          order_id?: string
          quantity?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cafe_id: string
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          notes: string | null
          order_number: number
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          request_key: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          table_id: string
          tax_cents: number
          tip_cents: number
          total_cents: number
          tracking_token: string
          updated_at: string
        }
        Insert: {
          cafe_id: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          notes?: string | null
          order_number: number
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          request_key?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          table_id: string
          tax_cents?: number
          tip_cents?: number
          total_cents: number
          tracking_token?: string
          updated_at?: string
        }
        Update: {
          cafe_id?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          notes?: string | null
          order_number?: number
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          request_key?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          table_id?: string
          tax_cents?: number
          tip_cents?: number
          total_cents?: number
          tracking_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "cafe_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          cafe_id: string
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          order_id: string
          provider: string
          provider_order_id: string
          provider_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          cafe_id: string
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          order_id: string
          provider?: string
          provider_order_id: string
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          cafe_id?: string
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          order_id?: string
          provider?: string
          provider_order_id?: string
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          cafe_id: string
          comment: string | null
          created_at: string
          customer_id: string | null
          display_name: string | null
          flagged: boolean
          guest_ref: string | null
          hidden: boolean
          id: string
          order_id: string
          rating: number
          updated_at: string
        }
        Insert: {
          cafe_id: string
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          display_name?: string | null
          flagged?: boolean
          guest_ref?: string | null
          hidden?: boolean
          id?: string
          order_id: string
          rating: number
          updated_at?: string
        }
        Update: {
          cafe_id?: string
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          display_name?: string | null
          flagged?: boolean
          guest_ref?: string | null
          hidden?: boolean
          id?: string
          order_id?: string
          rating?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cafe_rating_summary: {
        Args: { _cafe_id: string }
        Returns: {
          average: number
          total: number
        }[]
      }
      create_cafe_for_current_user: { Args: { _name: string }; Returns: string }
      has_cafe_role: {
        Args: {
          _cafe_id: string
          _role: Database["public"]["Enums"]["cafe_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_cafe_member: {
        Args: { _cafe_id: string; _user_id: string }
        Returns: boolean
      }
      place_order: {
        Args: {
          _customer_id?: string
          _customer_name: string
          _customer_phone: string
          _items: Json
          _notes: string
          _payment_method?: string
          _request_key?: string
          _table_token: string
          _tip_cents?: number
        }
        Returns: Json
      }
      submit_review: {
        Args: {
          _comment?: string
          _customer_id?: string
          _display_name?: string
          _order_id: string
          _rating: number
          _tracking_token: string
        }
        Returns: string
      }
    }
    Enums: {
      cafe_role: "owner" | "staff"
      order_status:
        | "NEW"
        | "ACCEPTED"
        | "PREPARING"
        | "READY"
        | "COMPLETED"
        | "CANCELLED"
      payment_method: "ONLINE" | "CAFE"
      payment_status: "PENDING" | "PAID" | "FAILED" | "REFUNDED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      cafe_role: ["owner", "staff"],
      order_status: [
        "NEW",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "COMPLETED",
        "CANCELLED",
      ],
      payment_method: ["ONLINE", "CAFE"],
      payment_status: ["PENDING", "PAID", "FAILED", "REFUNDED"],
    },
  },
} as const
