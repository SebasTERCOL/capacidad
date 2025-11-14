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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      bom: {
        Row: {
          amount: number
          component_id: string
          id: number
          product_id: string
        }
        Insert: {
          amount?: number
          component_id: string
          id?: never
          product_id: string
        }
        Update: {
          amount?: number
          component_id?: string
          id?: never
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["reference"]
          },
          {
            foreignKeyName: "bom_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["reference"]
          },
        ]
      }
      buy_order_items: {
        Row: {
          buy_order_id: number
          id: number
          quantity: number | null
          recieve_quantity: number | null
          reference: string
          total_price: number | null
          unit_price: number | null
          verified_quantity: number | null
        }
        Insert: {
          buy_order_id: number
          id?: never
          quantity?: number | null
          recieve_quantity?: number | null
          reference: string
          total_price?: number | null
          unit_price?: number | null
          verified_quantity?: number | null
        }
        Update: {
          buy_order_id?: number
          id?: never
          quantity?: number | null
          recieve_quantity?: number | null
          reference?: string
          total_price?: number | null
          unit_price?: number | null
          verified_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "buy_order_items_buy_order_id_fkey"
            columns: ["buy_order_id"]
            isOneToOne: false
            referencedRelation: "buy_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_order_items_reference_fkey"
            columns: ["reference"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["reference"]
          },
        ]
      }
      buy_orders: {
        Row: {
          close_date: string | null
          conditions: string | null
          date: string
          id: number
          observations: string | null
          provider_id: number
          status: Database["public"]["Enums"]["orders_status"] | null
        }
        Insert: {
          close_date?: string | null
          conditions?: string | null
          date: string
          id?: never
          observations?: string | null
          provider_id: number
          status?: Database["public"]["Enums"]["orders_status"] | null
        }
        Update: {
          close_date?: string | null
          conditions?: string | null
          date?: string
          id?: never
          observations?: string | null
          provider_id?: number
          status?: Database["public"]["Enums"]["orders_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "buy_orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      combo: {
        Row: {
          cantidad: number | null
          combo: string
          component_id: string | null
          id: number | null
        }
        Insert: {
          cantidad?: number | null
          combo: string
          component_id?: string | null
          id?: number | null
        }
        Update: {
          cantidad?: number | null
          combo?: string
          component_id?: string | null
          id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "combo_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["reference"]
          },
        ]
      }
      families: {
        Row: {
          id: number
          name: string | null
        }
        Insert: {
          id?: never
          name?: string | null
        }
        Update: {
          id?: never
          name?: string | null
        }
        Relationships: []
      }
      machines: {
        Row: {
          id: number
          name: string
          status: Database["public"]["Enums"]["status_machine"]
        }
        Insert: {
          id?: never
          name: string
          status?: Database["public"]["Enums"]["status_machine"]
        }
        Update: {
          id?: never
          name?: string
          status?: Database["public"]["Enums"]["status_machine"]
        }
        Relationships: []
      }
      machines_processes: {
        Row: {
          frequency: number
          id: number
          id_machine: number
          id_process: number
          ref: string
          sam: number
          sam_unit: Database["public"]["Enums"]["sam_unit_type"]
        }
        Insert: {
          frequency?: number
          id?: never
          id_machine: number
          id_process: number
          ref: string
          sam: number
          sam_unit?: Database["public"]["Enums"]["sam_unit_type"]
        }
        Update: {
          frequency?: number
          id?: never
          id_machine?: number
          id_process?: number
          ref?: string
          sam?: number
          sam_unit?: Database["public"]["Enums"]["sam_unit_type"]
        }
        Relationships: [
          {
            foreignKeyName: "machines_processes_id_machine_fkey"
            columns: ["id_machine"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_processes_id_process_fkey"
            columns: ["id_process"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_processes_ref_fkey"
            columns: ["ref"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["reference"]
          },
        ]
      }
      movements: {
        Row: {
          amount: number
          consecutive: number
          current_amount: number
          date: string
          description: string | null
          final_amount: number
          from_: number | null
          id: number
          made_by: Database["public"]["Enums"]["movement_made_by"]
          made_it_id: number | null
          ref: string
          to_: number | null
          type: Database["public"]["Enums"]["movement_type"]
        }
        Insert: {
          amount: number
          consecutive: number
          current_amount: number
          date?: string
          description?: string | null
          final_amount: number
          from_?: number | null
          id?: never
          made_by: Database["public"]["Enums"]["movement_made_by"]
          made_it_id?: number | null
          ref: string
          to_?: number | null
          type: Database["public"]["Enums"]["movement_type"]
        }
        Update: {
          amount?: number
          consecutive?: number
          current_amount?: number
          date?: string
          description?: string | null
          final_amount?: number
          from_?: number | null
          id?: never
          made_by?: Database["public"]["Enums"]["movement_made_by"]
          made_it_id?: number | null
          ref?: string
          to_?: number | null
          type?: Database["public"]["Enums"]["movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "movements_from__fkey"
            columns: ["from_"]
            isOneToOne: false
            referencedRelation: "warehouse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_ref_fkey"
            columns: ["ref"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["reference"]
          },
          {
            foreignKeyName: "movements_to__fkey"
            columns: ["to_"]
            isOneToOne: false
            referencedRelation: "warehouse"
            referencedColumns: ["id"]
          },
        ]
      }
      permission: {
        Row: {
          can_create_capability: boolean
          can_create_inventory: boolean
          can_create_schedule: boolean
          can_delete_capability: boolean
          can_delete_inventory: boolean
          can_delete_schedule: boolean
          can_update_capability: boolean
          can_update_inventory: boolean
          can_update_schedule: boolean
          can_view_info_capability: boolean
          can_view_info_inventory: boolean
          can_view_info_schedule: boolean
          id: number
        }
        Insert: {
          can_create_capability?: boolean
          can_create_inventory?: boolean
          can_create_schedule?: boolean
          can_delete_capability?: boolean
          can_delete_inventory?: boolean
          can_delete_schedule?: boolean
          can_update_capability?: boolean
          can_update_inventory?: boolean
          can_update_schedule?: boolean
          can_view_info_capability?: boolean
          can_view_info_inventory?: boolean
          can_view_info_schedule?: boolean
          id?: never
        }
        Update: {
          can_create_capability?: boolean
          can_create_inventory?: boolean
          can_create_schedule?: boolean
          can_delete_capability?: boolean
          can_delete_inventory?: boolean
          can_delete_schedule?: boolean
          can_update_capability?: boolean
          can_update_inventory?: boolean
          can_update_schedule?: boolean
          can_view_info_capability?: boolean
          can_view_info_inventory?: boolean
          can_view_info_schedule?: boolean
          id?: never
        }
        Relationships: []
      }
      processes: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: never
          name: string
        }
        Update: {
          id?: never
          name?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          family: number
          features: Database["public"]["Enums"]["product_feature"]
          is_controlled: boolean
          maximum_unit: number | null
          minimum_unit: number | null
          quantity: number
          reference: string
          total_cost: number | null
          type: Database["public"]["Enums"]["product_type"]
          unitary_cost: number | null
          weigth: number
        }
        Insert: {
          family: number
          features?: Database["public"]["Enums"]["product_feature"]
          is_controlled?: boolean
          maximum_unit?: number | null
          minimum_unit?: number | null
          quantity?: number
          reference: string
          total_cost?: number | null
          type?: Database["public"]["Enums"]["product_type"]
          unitary_cost?: number | null
          weigth?: number
        }
        Update: {
          family?: number
          features?: Database["public"]["Enums"]["product_feature"]
          is_controlled?: boolean
          maximum_unit?: number | null
          minimum_unit?: number | null
          quantity?: number
          reference?: string
          total_cost?: number | null
          type?: Database["public"]["Enums"]["product_type"]
          unitary_cost?: number | null
          weigth?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_family_fkey"
            columns: ["family"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      projection: {
        Row: {
          id: number
          projection_date: string
          ref: string
          schedule: number
        }
        Insert: {
          id?: never
          projection_date: string
          ref: string
          schedule: number
        }
        Update: {
          id?: never
          projection_date?: string
          ref?: string
          schedule?: number
        }
        Relationships: [
          {
            foreignKeyName: "projection_ref_fkey"
            columns: ["ref"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["reference"]
          },
          {
            foreignKeyName: "projection_schedule_fkey"
            columns: ["schedule"]
            isOneToOne: false
            referencedRelation: "schedule"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          address: string
          celphone: string | null
          email: string | null
          id: number
          name: string
          nit: string
          phone: string | null
        }
        Insert: {
          address: string
          celphone?: string | null
          email?: string | null
          id?: never
          name: string
          nit: string
          phone?: string | null
        }
        Update: {
          address?: string
          celphone?: string | null
          email?: string | null
          id?: never
          name?: string
          nit?: string
          phone?: string | null
        }
        Relationships: []
      }
      request: {
        Row: {
          id: number
          product_code: string
          quantity: number
        }
        Insert: {
          id?: never
          product_code: string
          quantity: number
        }
        Update: {
          id?: never
          product_code?: string
          quantity?: number
        }
        Relationships: []
      }
      schedule: {
        Row: {
          amount: number
          date_schedule: string
          id: number
          ref: string
          semanas: number[] | null
        }
        Insert: {
          amount: number
          date_schedule: string
          id?: never
          ref: string
          semanas?: number[] | null
        }
        Update: {
          amount?: number
          date_schedule?: string
          id?: never
          ref?: string
          semanas?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_ref_fkey"
            columns: ["ref"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["reference"]
          },
        ]
      }
      service_order_items: {
        Row: {
          id: number
          quantity: number | null
          recieve_quantity: number | null
          reference: string
          service_order_id: number
          total_price: number | null
          unit_price: number | null
          verified_quantity: number | null
        }
        Insert: {
          id?: never
          quantity?: number | null
          recieve_quantity?: number | null
          reference: string
          service_order_id: number
          total_price?: number | null
          unit_price?: number | null
          verified_quantity?: number | null
        }
        Update: {
          id?: never
          quantity?: number | null
          recieve_quantity?: number | null
          reference?: string
          service_order_id?: number
          total_price?: number | null
          unit_price?: number | null
          verified_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_order_items_reference_fkey"
            columns: ["reference"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["reference"]
          },
          {
            foreignKeyName: "service_order_items_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          close_date: string | null
          conditions: string | null
          date: string
          id: number
          observations: string | null
          provider_id: number
          status: Database["public"]["Enums"]["orders_status"] | null
        }
        Insert: {
          close_date?: string | null
          conditions?: string | null
          date: string
          id?: never
          observations?: string | null
          provider_id: number
          status?: Database["public"]["Enums"]["orders_status"] | null
        }
        Update: {
          close_date?: string | null
          conditions?: string | null
          date?: string
          id?: never
          observations?: string | null
          provider_id?: number
          status?: Database["public"]["Enums"]["orders_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse: {
        Row: {
          amount: number | null
          id: number
          provider_id: number | null
          ref: string | null
          warehouse_type: Database["public"]["Enums"]["tercol_warehouse"]
        }
        Insert: {
          amount?: number | null
          id?: never
          provider_id?: number | null
          ref?: string | null
          warehouse_type: Database["public"]["Enums"]["tercol_warehouse"]
        }
        Update: {
          amount?: number | null
          id?: never
          provider_id?: number | null
          ref?: string | null
          warehouse_type?: Database["public"]["Enums"]["tercol_warehouse"]
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_ref_fkey"
            columns: ["ref"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["reference"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      movement_made_by:
        | "ODP"
        | "OC"
        | "OS"
        | "DPNC"
        | "DEVOLUCION"
        | "ENTREGA PV"
        | "RECEPCION PV"
        | "ENTREGA PL"
        | "RECEPCION PL"
      movement_measure_unit: "KG" | "UN" | "PORCENTAJE"
      movement_type: "ENTRADA" | "SALIDA"
      orders_status:
        | "RECIBIDO"
        | "CANCELADA"
        | "PENDIENTE"
        | "PAGADA"
        | "CERRADA"
      product_feature: "GALVANIZADO" | "PINTADO"
      product_type: "MP" | "PP" | "PT" | "INSUMO" | "HERRAMIENTA" | "COMBO"
      sam_unit_type: "min_per_unit" | "units_per_min"
      status_machine:
        | "PARO"
        | "CAMBIO"
        | "HERRAMIENTA"
        | "ENCENDIDO"
        | "APAGADO"
        | "MANTENIMIENTO"
      tercol_unit_measure: "UN" | "KG"
      tercol_warehouse:
        | "ALMACEN_MP"
        | "ALMACEN_PP"
        | "DISPONIBLE_PL"
        | "RESERVA_PL"
        | "DISPONIBLE_PROVEEDOR"
        | "RESERVA_PROVEEDOR"
        | "CALIDAD"
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
      movement_made_by: [
        "ODP",
        "OC",
        "OS",
        "DPNC",
        "DEVOLUCION",
        "ENTREGA PV",
        "RECEPCION PV",
        "ENTREGA PL",
        "RECEPCION PL",
      ],
      movement_measure_unit: ["KG", "UN", "PORCENTAJE"],
      movement_type: ["ENTRADA", "SALIDA"],
      orders_status: [
        "RECIBIDO",
        "CANCELADA",
        "PENDIENTE",
        "PAGADA",
        "CERRADA",
      ],
      product_feature: ["GALVANIZADO", "PINTADO"],
      product_type: ["MP", "PP", "PT", "INSUMO", "HERRAMIENTA", "COMBO"],
      sam_unit_type: ["min_per_unit", "units_per_min"],
      status_machine: [
        "PARO",
        "CAMBIO",
        "HERRAMIENTA",
        "ENCENDIDO",
        "APAGADO",
        "MANTENIMIENTO",
      ],
      tercol_unit_measure: ["UN", "KG"],
      tercol_warehouse: [
        "ALMACEN_MP",
        "ALMACEN_PP",
        "DISPONIBLE_PL",
        "RESERVA_PL",
        "DISPONIBLE_PROVEEDOR",
        "RESERVA_PROVEEDOR",
        "CALIDAD",
      ],
    },
  },
} as const
