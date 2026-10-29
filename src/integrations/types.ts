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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: number
          record_id: string
          table_name: string
          yard_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: never
          record_id: string
          table_name: string
          yard_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: never
          record_id?: string
          table_name?: string
          yard_id?: string | null
        }
        Relationships: []
      }
      booking_deposits: {
        Row: {
          amount_ksh: number
          created_at: string
          customer_name: string
          customer_phone: string
          id: string
          referral_broker_id: string | null
          status: string
          vehicle_id: string
        }
        Insert: {
          amount_ksh: number
          created_at?: string
          customer_name: string
          customer_phone: string
          id?: string
          referral_broker_id?: string | null
          status?: string
          vehicle_id: string
        }
        Update: {
          amount_ksh?: number
          created_at?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          referral_broker_id?: string | null
          status?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_deposits_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          broker_id: string
          client_name: string
          client_phone: string
          commission_earned_ksh: number
          created_at: string
          id: string
          status: string
          vehicle_id: string | null
          yard_id: string
        }
        Insert: {
          broker_id: string
          client_name: string
          client_phone: string
          commission_earned_ksh?: number
          created_at?: string
          id?: string
          status?: string
          vehicle_id?: string | null
          yard_id: string
        }
        Update: {
          broker_id?: string
          client_name?: string
          client_phone?: string
          commission_earned_ksh?: number
          created_at?: string
          id?: string
          status?: string
          vehicle_id?: string | null
          yard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_yard_id_fkey"
            columns: ["yard_id"]
            isOneToOne: false
            referencedRelation: "yards"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          amount_ksh: number
          created_at: string
          id: string
          provider: string
          raw: Json | null
          reference: string
          status: string
          yard_id: string | null
        }
        Insert: {
          amount_ksh: number
          created_at?: string
          id?: string
          provider: string
          raw?: Json | null
          reference: string
          status: string
          yard_id?: string | null
        }
        Update: {
          amount_ksh?: number
          created_at?: string
          id?: string
          provider?: string
          raw?: Json | null
          reference?: string
          status?: string
          yard_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_yard_id_fkey"
            columns: ["yard_id"]
            isOneToOne: false
            referencedRelation: "yards"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: number
          is_system_active: boolean
          updated_at: string
        }
        Insert: {
          id?: number
          is_system_active?: boolean
          updated_at?: string
        }
        Update: {
          id?: number
          is_system_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_trade_pricing: {
        Row: {
          broker_commission_ksh: number
          cif_price_ksh: number
          kra_duty_ksh: number
          port_fees_ksh: number
          transport_ksh: number
          vehicle_id: string
          wholesale_price_ksh: number
          yard_id: string
        }
        Insert: {
          broker_commission_ksh: number
          cif_price_ksh?: number
          kra_duty_ksh?: number
          port_fees_ksh?: number
          transport_ksh?: number
          vehicle_id: string
          wholesale_price_ksh: number
          yard_id: string
        }
        Update: {
          broker_commission_ksh?: number
          cif_price_ksh?: number
          kra_duty_ksh?: number
          port_fees_ksh?: number
          transport_ksh?: number
          vehicle_id?: string
          wholesale_price_ksh?: number
          yard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_trade_pricing_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_trade_pricing_yard_id_fkey"
            columns: ["yard_id"]
            isOneToOne: false
            referencedRelation: "yards"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          body_type: string | null
          booking_deposit_ksh: number
          color: string | null
          created_at: string
          description: string | null
          drive: string | null
          engine_cc: number | null
          eta_date: string | null
          fuel: string
          id: string
          images: string[]
          is_published: boolean
          make: string
          mileage_km: number
          model: string
          price_ksh: number
          status: Database["public"]["Enums"]["vehicle_status"]
          transmission: string
          yard_id: string
          year: number
        }
        Insert: {
          body_type?: string | null
          booking_deposit_ksh?: number
          color?: string | null
          created_at?: string
          description?: string | null
          drive?: string | null
          engine_cc?: number | null
          eta_date?: string | null
          fuel?: string
          id?: string
          images?: string[]
          is_published?: boolean
          make: string
          mileage_km?: number
          model: string
          price_ksh: number
          status?: Database["public"]["Enums"]["vehicle_status"]
          transmission?: string
          yard_id: string
          year: number
        }
        Update: {
          body_type?: string | null
          booking_deposit_ksh?: number
          color?: string | null
          created_at?: string
          description?: string | null
          drive?: string | null
          engine_cc?: number | null
          eta_date?: string | null
          fuel?: string
          id?: string
          images?: string[]
          is_published?: boolean
          make?: string
          mileage_km?: number
          model?: string
          price_ksh?: number
          status?: Database["public"]["Enums"]["vehicle_status"]
          transmission?: string
          yard_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_yard_id_fkey"
            columns: ["yard_id"]
            isOneToOne: false
            referencedRelation: "yards"
            referencedColumns: ["id"]
          },
        ]
      }
      yard_members: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["yard_role"]
          user_id: string | null
          yard_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["yard_role"]
          user_id?: string | null
          yard_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["yard_role"]
          user_id?: string | null
          yard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yard_members_yard_id_fkey"
            columns: ["yard_id"]
            isOneToOne: false
            referencedRelation: "yards"
            referencedColumns: ["id"]
          },
        ]
      }
      yards: {
        Row: {
          created_at: string
          id: string
          location: string
          name: string
          slug: string
          subscription_expires_at: string
          whatsapp_phone: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string
          name: string
          slug: string
          subscription_expires_at?: string
          whatsapp_phone?: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string
          name?: string
          slug?: string
          subscription_expires_at?: string
          whatsapp_phone?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_system_active: { Args: never; Returns: boolean }
      yard_role_of: {
        Args: { _user_id: string; _yard_id: string }
        Returns: Database["public"]["Enums"]["yard_role"]
      }
    }
    Enums: {
      app_role: "super_admin"
      vehicle_status:
        | "purchased_japan"
        | "on_ocean"
        | "port_clearing"
        | "in_yard"
      yard_role: "owner" | "manager" | "broker"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["super_admin"],
      vehicle_status: [
        "purchased_japan",
        "on_ocean",
        "port_clearing",
        "in_yard",
      ],
      yard_role: ["owner", "manager", "broker"],
    },
  },
} as const
