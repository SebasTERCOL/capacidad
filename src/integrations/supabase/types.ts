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
    PostgrestVersion: "12.2.3 (519615d)"
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
          id?: number
          product_id: string
        }
        Update: {
          amount?: number
          component_id?: string
          id?: number
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
      calidad: {
        Row: {
          fecha: string | null
          hora: string | null
          id: number
          malas: number
          motivo: string
          odp_id: number | null
          personal_id: number | null
        }
        Insert: {
          fecha?: string | null
          hora?: string | null
          id?: number
          malas: number
          motivo: string
          odp_id?: number | null
          personal_id?: number | null
        }
        Update: {
          fecha?: string | null
          hora?: string | null
          id?: number
          malas?: number
          motivo?: string
          odp_id?: number | null
          personal_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "calidad_odp_id_fkey"
            columns: ["odp_id"]
            isOneToOne: false
            referencedRelation: "odp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calidad_odp_id_fkey"
            columns: ["odp_id"]
            isOneToOne: false
            referencedRelation: "vista_calidad"
            referencedColumns: ["odp_id"]
          },
          {
            foreignKeyName: "calidad_odp_id_fkey"
            columns: ["odp_id"]
            isOneToOne: false
            referencedRelation: "vista_minutos_trabajados"
            referencedColumns: ["odp_id"]
          },
          {
            foreignKeyName: "calidad_odp_id_fkey"
            columns: ["odp_id"]
            isOneToOne: false
            referencedRelation: "vista_oee"
            referencedColumns: ["odp_id"]
          },
          {
            foreignKeyName: "calidad_odp_id_fkey"
            columns: ["odp_id"]
            isOneToOne: false
            referencedRelation: "vista_rendimiento"
            referencedColumns: ["odp_id"]
          },
          {
            foreignKeyName: "calidad_personal_id_fkey"
            columns: ["personal_id"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      combo: {
        Row: {
          cantidad: number | null
          combo: string
          component_id: string | null
          id: number
        }
        Insert: {
          cantidad?: number | null
          combo: string
          component_id?: string | null
          id?: number
        }
        Update: {
          cantidad?: number | null
          combo?: string
          component_id?: string | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "combo_combo_fkey"
            columns: ["combo"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["reference"]
          },
          {
            foreignKeyName: "combo_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["reference"]
          },
        ]
      }
      fallas: {
        Row: {
          DEFECTOS: string
          ZONA: string | null
        }
        Insert: {
          DEFECTOS: string
          ZONA?: string | null
        }
        Update: {
          DEFECTOS?: string
          ZONA?: string | null
        }
        Relationships: []
      }
      families: {
        Row: {
          id: number
          name: string | null
        }
        Insert: {
          id?: number
          name?: string | null
        }
        Update: {
          id?: number
          name?: string | null
        }
        Relationships: []
      }
      hora: {
        Row: {
          estado_id: boolean | null
          fecha: string
          fecha_modificacion: string | null
          fecha_salida: string | null
          hora_ingreso: string
          hora_salida: string | null
          id: number
          minutos_anteriores: number | null
          motivo_cambio: string | null
          personal_id: number | null
          usuario_modificacion: string | null
        }
        Insert: {
          estado_id?: boolean | null
          fecha: string
          fecha_modificacion?: string | null
          fecha_salida?: string | null
          hora_ingreso: string
          hora_salida?: string | null
          id?: number
          minutos_anteriores?: number | null
          motivo_cambio?: string | null
          personal_id?: number | null
          usuario_modificacion?: string | null
        }
        Update: {
          estado_id?: boolean | null
          fecha?: string
          fecha_modificacion?: string | null
          fecha_salida?: string | null
          hora_ingreso?: string
          hora_salida?: string | null
          id?: number
          minutos_anteriores?: number | null
          motivo_cambio?: string | null
          personal_id?: number | null
          usuario_modificacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hora_personal_id_fkey"
            columns: ["personal_id"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          id: number
          name: string
          status: Database["public"]["Enums"]["status_machine"]
        }
        Insert: {
          id?: number
          name: string
          status?: Database["public"]["Enums"]["status_machine"]
        }
        Update: {
          id?: number
          name?: string
          status?: Database["public"]["Enums"]["status_machine"]
        }
        Relationships: []
      }
      machines_processes: {
        Row: {
          condicion_inicial: number | null
          frequency: number
          id: number
          id_machine: number
          id_process: number
          ref: string
          sam: number
          sam_unit: Database["public"]["Enums"]["sam_unit_type"]
        }
        Insert: {
          condicion_inicial?: number | null
          frequency?: number
          id?: number
          id_machine: number
          id_process: number
          ref: string
          sam: number
          sam_unit?: Database["public"]["Enums"]["sam_unit_type"]
        }
        Update: {
          condicion_inicial?: number | null
          frequency?: number
          id?: number
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
      maquinaria: {
        Row: {
          activo: boolean | null
          codigo_maquina: string
          created_at: string | null
          id: number
          nombre_maquina: string | null
          updated_at: string | null
          zona: string
        }
        Insert: {
          activo?: boolean | null
          codigo_maquina: string
          created_at?: string | null
          id?: number
          nombre_maquina?: string | null
          updated_at?: string | null
          zona: string
        }
        Update: {
          activo?: boolean | null
          codigo_maquina?: string
          created_at?: string | null
          id?: number
          nombre_maquina?: string | null
          updated_at?: string | null
          zona?: string
        }
        Relationships: []
      }
      odp: {
        Row: {
          ciclo_maquina: number | null
          estado_odp: boolean | null
          fecha_fin_odp: string | null
          fecha_inicio_odp: string | null
          hora_fin_odp: string | null
          hora_inicio_odp: string | null
          id: number
          maquina: string
          orden_produccion: number
          personal_idodp: number | null
          realizadas: number
          referencia: string
          supervisor: string
          turno: number | null
          zona: string
        }
        Insert: {
          ciclo_maquina?: number | null
          estado_odp?: boolean | null
          fecha_fin_odp?: string | null
          fecha_inicio_odp?: string | null
          hora_fin_odp?: string | null
          hora_inicio_odp?: string | null
          id?: number
          maquina: string
          orden_produccion: number
          personal_idodp?: number | null
          realizadas: number
          referencia: string
          supervisor: string
          turno?: number | null
          zona: string
        }
        Update: {
          ciclo_maquina?: number | null
          estado_odp?: boolean | null
          fecha_fin_odp?: string | null
          fecha_inicio_odp?: string | null
          hora_fin_odp?: string | null
          hora_inicio_odp?: string | null
          id?: number
          maquina?: string
          orden_produccion?: number
          personal_idodp?: number | null
          realizadas?: number
          referencia?: string
          supervisor?: string
          turno?: number | null
          zona?: string
        }
        Relationships: [
          {
            foreignKeyName: "odp_personal_idodp_fkey"
            columns: ["personal_idodp"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      paro_tiempos: {
        Row: {
          activo: boolean | null
          area: string | null
          created_at: string | null
          id: number
          motivo: string
          updated_at: string | null
          zona: string
        }
        Insert: {
          activo?: boolean | null
          area?: string | null
          created_at?: string | null
          id?: number
          motivo: string
          updated_at?: string | null
          zona: string
        }
        Update: {
          activo?: boolean | null
          area?: string | null
          created_at?: string | null
          id?: number
          motivo?: string
          updated_at?: string | null
          zona?: string
        }
        Relationships: []
      }
      personal: {
        Row: {
          cedula: number
          id: number
          nombre_completo: string
          personal_estado: string | null
          tipo: string
        }
        Insert: {
          cedula: number
          id?: number
          nombre_completo: string
          personal_estado?: string | null
          tipo: string
        }
        Update: {
          cedula?: number
          id?: number
          nombre_completo?: string
          personal_estado?: string | null
          tipo?: string
        }
        Relationships: []
      }
      procesos: {
        Row: {
          description: string | null
          id: number
          name: string
        }
        Insert: {
          description?: string | null
          id?: number
          name: string
        }
        Update: {
          description?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      process_dependencies: {
        Row: {
          depends_on_process_id: number
          id: number
          process_id: number
        }
        Insert: {
          depends_on_process_id: number
          id?: number
          process_id: number
        }
        Update: {
          depends_on_process_id?: number
          id?: number
          process_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "process_dependencies_depends_on_process_id_fkey"
            columns: ["depends_on_process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_dependencies_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      processes: {
        Row: {
          id: number
          inventario: boolean | null
          is_schedulable: boolean
          name: string
        }
        Insert: {
          id?: number
          inventario?: boolean | null
          is_schedulable?: boolean
          name: string
        }
        Update: {
          id?: number
          inventario?: boolean | null
          is_schedulable?: boolean
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
      ref: {
        Row: {
          costo: number | null
          ID: number
          materia_prima: string | null
          proceso_zona: string | null
          referencia: string
          unidad_por_lamina: number | null
        }
        Insert: {
          costo?: number | null
          ID?: number
          materia_prima?: string | null
          proceso_zona?: string | null
          referencia: string
          unidad_por_lamina?: number | null
        }
        Update: {
          costo?: number | null
          ID?: number
          materia_prima?: string | null
          proceso_zona?: string | null
          referencia?: string
          unidad_por_lamina?: number | null
        }
        Relationships: []
      }
      ref_maquina: {
        Row: {
          id: number
          machine_id: number
          process_id: number
          ref_id: number
          sam: number
        }
        Insert: {
          id?: never
          machine_id: number
          process_id: number
          ref_id: number
          sam: number
        }
        Update: {
          id?: never
          machine_id?: number
          process_id?: number
          ref_id?: number
          sam?: number
        }
        Relationships: [
          {
            foreignKeyName: "ref_maquina_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "maquinaria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ref_maquina_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "procesos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ref_maquina_ref_id_fkey"
            columns: ["ref_id"]
            isOneToOne: false
            referencedRelation: "ref"
            referencedColumns: ["ID"]
          },
        ]
      }
      reportes: {
        Row: {
          fecha: string
          hora: string | null
          id: number
          motivo: string
          odp_id: number | null
          personal_id: number | null
          tiempo: number
        }
        Insert: {
          fecha: string
          hora?: string | null
          id?: number
          motivo: string
          odp_id?: number | null
          personal_id?: number | null
          tiempo: number
        }
        Update: {
          fecha?: string
          hora?: string | null
          id?: number
          motivo?: string
          odp_id?: number | null
          personal_id?: number | null
          tiempo?: number
        }
        Relationships: [
          {
            foreignKeyName: "reportes_odp_id_fkey"
            columns: ["odp_id"]
            isOneToOne: false
            referencedRelation: "odp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reportes_odp_id_fkey"
            columns: ["odp_id"]
            isOneToOne: false
            referencedRelation: "vista_calidad"
            referencedColumns: ["odp_id"]
          },
          {
            foreignKeyName: "reportes_odp_id_fkey"
            columns: ["odp_id"]
            isOneToOne: false
            referencedRelation: "vista_minutos_trabajados"
            referencedColumns: ["odp_id"]
          },
          {
            foreignKeyName: "reportes_odp_id_fkey"
            columns: ["odp_id"]
            isOneToOne: false
            referencedRelation: "vista_oee"
            referencedColumns: ["odp_id"]
          },
          {
            foreignKeyName: "reportes_odp_id_fkey"
            columns: ["odp_id"]
            isOneToOne: false
            referencedRelation: "vista_rendimiento"
            referencedColumns: ["odp_id"]
          },
          {
            foreignKeyName: "reportes_personal_id_fkey"
            columns: ["personal_id"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      t_combo: {
        Row: {
          condicion_inicial: number | null
          ref: string
          sam: number | null
        }
        Insert: {
          condicion_inicial?: number | null
          ref: string
          sam?: number | null
        }
        Update: {
          condicion_inicial?: number | null
          ref?: string
          sam?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "t_combo_ref_fkey"
            columns: ["ref"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["reference"]
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
          id?: number
          provider_id?: number | null
          ref?: string | null
          warehouse_type: Database["public"]["Enums"]["tercol_warehouse"]
        }
        Update: {
          amount?: number | null
          id?: number
          provider_id?: number | null
          ref?: string | null
          warehouse_type?: Database["public"]["Enums"]["tercol_warehouse"]
        }
        Relationships: [
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
      vista_calidad: {
        Row: {
          calidad: number | null
          fecha: string | null
          odp_id: number | null
          personal_idodp: number | null
          piezas_buenas: number | null
          piezas_malas: number | null
          piezas_totales: number | null
          referencia: string | null
          zona: string | null
        }
        Insert: {
          calidad?: never
          fecha?: string | null
          odp_id?: number | null
          personal_idodp?: number | null
          piezas_buenas?: never
          piezas_malas?: never
          piezas_totales?: number | null
          referencia?: string | null
          zona?: string | null
        }
        Update: {
          calidad?: never
          fecha?: string | null
          odp_id?: number | null
          personal_idodp?: number | null
          piezas_buenas?: never
          piezas_malas?: never
          piezas_totales?: number | null
          referencia?: string | null
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "odp_personal_idodp_fkey"
            columns: ["personal_idodp"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      vista_disponibilidad: {
        Row: {
          disponibilidad: number | null
          fecha: string | null
          minutos_disponibles: number | null
          minutos_paro: number | null
          personal_id: number | null
          personal_idodp: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hora_personal_id_fkey"
            columns: ["personal_id"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      vista_minutos_trabajados: {
        Row: {
          duracion_bruta_min: number | null
          estado_odp: boolean | null
          fecha_fin_odp: string | null
          fecha_inicio_odp: string | null
          hora_fin_odp: string | null
          hora_inicio_odp: string | null
          maquina: string | null
          minutos_trabajados: number | null
          odp_id: number | null
          operador_cedula: number | null
          operador_nombre: string | null
          paros_min: number | null
          personal_idodp: number | null
          referencia: string | null
          supervisor: string | null
          turno: number | null
          zona: string | null
        }
        Relationships: [
          {
            foreignKeyName: "odp_personal_idodp_fkey"
            columns: ["personal_idodp"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      vista_oee: {
        Row: {
          calidad: number | null
          disponibilidad: number | null
          fecha: string | null
          minutos_disponibles: number | null
          minutos_paro: number | null
          minutos_trabajados: number | null
          odp_id: number | null
          oee: number | null
          operador_cedula: number | null
          operador_nombre: string | null
          personal_idodp: number | null
          piezas_buenas: number | null
          piezas_malas: number | null
          piezas_planificadas: number | null
          piezas_producidas: number | null
          piezas_totales: number | null
          referencia: string | null
          rendimiento: number | null
          zona: string | null
        }
        Relationships: [
          {
            foreignKeyName: "odp_personal_idodp_fkey"
            columns: ["personal_idodp"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
      vista_rendimiento: {
        Row: {
          fecha: string | null
          minutos_trabajados: number | null
          odp_id: number | null
          personal_idodp: number | null
          piezas_planificadas: number | null
          piezas_producidas: number | null
          referencia: string | null
          rendimiento: number | null
          sam: number | null
          tiempo_neto_odp: number | null
          tiempo_real_odp: number | null
          zona: string | null
        }
        Relationships: [
          {
            foreignKeyName: "odp_personal_idodp_fkey"
            columns: ["personal_idodp"]
            isOneToOne: false
            referencedRelation: "personal"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      asignar_fecha_efectiva: {
        Args: { fecha_real: string; hora_inicio: string }
        Returns: string
      }
      calcular_duracion_minutos: {
        Args: {
          fecha_fin: string
          fecha_inicio: string
          hora_fin: string
          hora_inicio: string
        }
        Returns: number
      }
      calcular_minutos_trabajados_odp: {
        Args: {
          p_fecha_fin: string
          p_fecha_inicio: string
          p_hora_fin: string
          p_hora_inicio: string
          p_odp_id: number
        }
        Returns: number
      }
      calcular_tiempo_odp: {
        Args: {
          fecha_fin: string
          fecha_inicio: string
          hora_fin: string
          hora_inicio: string
        }
        Returns: number
      }
      calculate_schedule: {
        Args: { p_quantities: number[]; p_references: string[] }
        Returns: {
          cantidad: number
          duracion_min: number
          ef: number
          es: number
          is_critical: boolean
          lf: number
          ls: number
          makespan: number
          mejor_maquina: string
          proceso_id: number
          proceso_nombre: string
          referencia: string
          sam: number
          slack: number
        }[]
      }
      calculate_schedule_with_capacity: {
        Args: {
          p_hours_per_shift?: number
          p_month: number
          p_operators?: Json
          p_quantities: number[]
          p_references: string[]
          p_year: number
        }
        Returns: {
          cantidad: number
          desborda: boolean
          dias_habiles: number
          dias_overflow: number
          duracion_min: number
          ef: number
          es: number
          is_critical: boolean
          lf: number
          ls: number
          makespan: number
          mejor_maquina: string
          minutos_disponibles: number
          operarios_proceso: number
          porcentaje_capacidad: number
          proceso_id: number
          proceso_nombre: string
          referencia: string
          sam: number
          slack: number
        }[]
      }
      detectar_odps_anomalos: {
        Args: { fecha_fin?: string; fecha_inicio?: string }
        Returns: {
          duracion_horas: number
          duracion_minutos: number
          fecha_fin_odp: string
          fecha_inicio_odp: string
          hora_fin_odp: string
          hora_inicio_odp: string
          odp_id: number
          orden_produccion: number
          referencia: string
          tipo_anomalia: string
          zona: string
        }[]
      }
      easter_sunday: { Args: { p_year: number }; Returns: string }
      get_colombian_holidays: {
        Args: { p_year: number }
        Returns: {
          holiday_date: string
          holiday_name: string
        }[]
      }
      get_next_available_id: {
        Args: { id_column?: string; table_name: string }
        Returns: number
      }
      get_oee_consolidado_maquina: {
        Args: {
          fecha_fin?: string
          fecha_inicio?: string
          maquina_filtro?: string
          referencia_filtro?: string
          supervisor_filtro?: string
          zona_filtro?: string
        }
        Returns: {
          calidad: number
          disponibilidad: number
          maquina: string
          minutos_disponibles: number
          minutos_paro: number
          minutos_trabajados: number
          num_odps: number
          num_operadores: number
          oee: number
          piezas_buenas: number
          piezas_planificadas: number
          piezas_producidas: number
          piezas_totales: number
          rendimiento: number
          zona: string
        }[]
      }
      get_oee_consolidado_operador: {
        Args: {
          cedula_filtro?: number
          fecha_fin?: string
          fecha_inicio?: string
          maquina_filtro?: string
          referencia_filtro?: string
          supervisor_filtro?: string
          zona_filtro?: string
        }
        Returns: {
          calidad: number
          disponibilidad: number
          fecha: string
          minutos_disponibles: number
          minutos_paro: number
          minutos_trabajados: number
          num_odps: number
          oee: number
          operador_cedula: number
          operador_nombre: string
          piezas_buenas: number
          piezas_planificadas: number
          piezas_producidas: number
          piezas_totales: number
          rendimiento: number
          zona: string
        }[]
      }
      get_oee_data: {
        Args: {
          cedula_filtro?: number
          fecha_fin?: string
          fecha_inicio?: string
          referencia_filtro?: string
          zona_filtro?: string
        }
        Returns: {
          calidad: number
          disponibilidad: number
          fecha: string
          minutos_disponibles: number
          minutos_paro: number
          odp_id: number
          oee: number
          operador_cedula: number
          operador_nombre: string
          personal_idodp: number
          piezas_buenas: number
          piezas_malas: number
          piezas_planificadas: number
          piezas_producidas: number
          piezas_totales: number
          referencia: string
          rendimiento: number
          zona: string
        }[]
      }
      get_oee_data_en_progreso: {
        Args: {
          cedula_filtro?: number
          fecha_fin?: string
          fecha_inicio?: string
          referencia_filtro?: string
          zona_filtro?: string
        }
        Returns: {
          calidad: number
          disponibilidad: number
          fecha: string
          maquina: string
          minutos_disponibles: number
          minutos_paro: number
          odp_id: number
          oee: number
          operador_cedula: number
          operador_nombre: string
          orden_produccion: number
          personal_idodp: number
          piezas_buenas: number
          piezas_malas: number
          piezas_planificadas: number
          piezas_producidas: number
          piezas_totales: number
          referencia: string
          rendimiento: number
          supervisor: string
          zona: string
        }[]
      }
      get_oee_data_finalizadas: {
        Args: {
          cedula_filtro?: number
          fecha_fin?: string
          fecha_inicio?: string
          referencia_filtro?: string
          zona_filtro?: string
        }
        Returns: {
          calidad: number
          disponibilidad: number
          fecha: string
          minutos_disponibles: number
          minutos_paro: number
          odp_id: number
          oee: number
          operador_cedula: number
          operador_nombre: string
          personal_idodp: number
          piezas_buenas: number
          piezas_malas: number
          piezas_planificadas: number
          piezas_producidas: number
          piezas_totales: number
          referencia: string
          rendimiento: number
          zona: string
        }[]
      }
      get_oee_data_optimized: {
        Args: {
          cedula_filtro?: number
          fecha_fin?: string
          fecha_inicio?: string
          maquina_filtro?: string
          referencia_filtro?: string
          supervisor_filtro?: string
          zona_filtro?: string
        }
        Returns: {
          calidad: number
          disponibilidad: number
          fecha: string
          fecha_fin_odp: string
          fecha_inicio_odp: string
          hora_fin_odp: string
          hora_inicio_odp: string
          maquina: string
          minutos_disponibles: number
          minutos_paro: number
          minutos_trabajados: number
          odp_id: number
          oee: number
          operador_cedula: number
          operador_nombre: string
          personal_idodp: number
          piezas_buenas: number
          piezas_malas: number
          piezas_planificadas: number
          piezas_producidas: number
          piezas_totales: number
          referencia: string
          rendimiento: number
          supervisor: string
          zona: string
        }[]
      }
      get_programmed_times_batch: {
        Args: {
          fecha_fin: string
          fecha_inicio: string
          operador_cedulas: number[]
        }
        Returns: {
          cedula: number
          fecha: string
          minutos_programados: number
        }[]
      }
      next_monday: { Args: { p_date: string }; Returns: string }
      obtener_tiempo_programado: {
        Args: { fecha_efectiva: string; operario_id: number }
        Returns: number
      }
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
      movement_type: "ENTRADA" | "SALIDA" | "AJUSTE" | "TRANSFERENCIA"
      orders_status:
        | "RECIBIDO"
        | "CANCELADA"
        | "PENDIENTE"
        | "PAGADA"
        | "CERRADA"
      product_feature: "GALVANIZADO" | "NEGRO" | "INOXIDABLE" | "ALUMINIO"
      product_type:
        | "PT"
        | "PP"
        | "MP"
        | "COMBO"
        | "NULL"
        | "INSUMO"
        | "HERRAMIENTA"
      sam_unit_type: "min_per_unit" | "units_per_min" | "units_per_hour"
      status_machine:
        | "PARO"
        | "CAMBIO"
        | "HERRAMIENTA"
        | "ENCENDIDO"
        | "APAGADO"
        | "MANTENIMIENTO"
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
      movement_type: ["ENTRADA", "SALIDA", "AJUSTE", "TRANSFERENCIA"],
      orders_status: [
        "RECIBIDO",
        "CANCELADA",
        "PENDIENTE",
        "PAGADA",
        "CERRADA",
      ],
      product_feature: ["GALVANIZADO", "NEGRO", "INOXIDABLE", "ALUMINIO"],
      product_type: [
        "PT",
        "PP",
        "MP",
        "COMBO",
        "NULL",
        "INSUMO",
        "HERRAMIENTA",
      ],
      sam_unit_type: ["min_per_unit", "units_per_min", "units_per_hour"],
      status_machine: [
        "PARO",
        "CAMBIO",
        "HERRAMIENTA",
        "ENCENDIDO",
        "APAGADO",
        "MANTENIMIENTO",
      ],
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
