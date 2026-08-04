import type { PermissionLevel, UserRole } from './enums';

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
      agent_account_events: {
        Row: {
          agent_account_id: string | null
          company_name: string
          contact_email: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          event_payload: Json
          event_type: string
          id: string
          legal_entity_id: string | null
          organization_id: string
          price_group_id: string | null
          price_group_name: string | null
          reason: string | null
          registration_no: string | null
        }
        Insert: {
          agent_account_id?: string | null
          company_name: string
          contact_email?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          event_payload?: Json
          event_type: string
          id?: string
          legal_entity_id?: string | null
          organization_id: string
          price_group_id?: string | null
          price_group_name?: string | null
          reason?: string | null
          registration_no?: string | null
        }
        Update: {
          agent_account_id?: string | null
          company_name?: string
          contact_email?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          event_payload?: Json
          event_type?: string
          id?: string
          legal_entity_id?: string | null
          organization_id?: string
          price_group_id?: string | null
          price_group_name?: string | null
          reason?: string | null
          registration_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_account_events_agent_account_id_fkey"
            columns: ["agent_account_id"]
            isOneToOne: false
            referencedRelation: "sales_agent_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_account_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_account_events_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_account_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "agent_account_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_account_events_price_group_id_fkey"
            columns: ["price_group_id"]
            isOneToOne: false
            referencedRelation: "agent_price_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_driver_routes: {
        Row: {
          assistant_name: string | null
          collect_from: string | null
          created_at: string
          driver_name: string
          id: string
          legal_entity_id: string
          location_name: string
          location_type: string
          notes: string | null
          organization_id: string
          route_code: string
          sequence_no: number
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          assistant_name?: string | null
          collect_from?: string | null
          created_at?: string
          driver_name: string
          id?: string
          legal_entity_id: string
          location_name: string
          location_type?: string
          notes?: string | null
          organization_id: string
          route_code: string
          sequence_no?: number
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          assistant_name?: string | null
          collect_from?: string | null
          created_at?: string
          driver_name?: string
          id?: string
          legal_entity_id?: string
          location_name?: string
          location_type?: string
          notes?: string | null
          organization_id?: string
          route_code?: string
          sequence_no?: number
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_driver_routes_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_driver_routes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "agent_driver_routes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_online_payments: {
        Row: {
          agent_account_id: string
          amount_rm: number
          cancelled_at: string | null
          checkout_url: string | null
          created_at: string
          created_by: string | null
          failure_reason: string | null
          gateway_ref: string | null
          gateway_session_id: string | null
          id: string
          organization_id: string
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["online_payment_method"]
          provider: string | null
          purpose: Database["public"]["Enums"]["agent_payment_purpose"]
          reference_id: string
          reference_type: string
          refund_reason: string | null
          refund_ref: string | null
          refunded_at: string | null
          status: Database["public"]["Enums"]["agent_payment_status"]
          updated_at: string
        }
        Insert: {
          agent_account_id: string
          amount_rm: number
          cancelled_at?: string | null
          checkout_url?: string | null
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          gateway_ref?: string | null
          gateway_session_id?: string | null
          id?: string
          organization_id: string
          paid_at?: string | null
          payment_method: Database["public"]["Enums"]["online_payment_method"]
          provider?: string | null
          purpose: Database["public"]["Enums"]["agent_payment_purpose"]
          reference_id: string
          reference_type: string
          refund_reason?: string | null
          refund_ref?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["agent_payment_status"]
          updated_at?: string
        }
        Update: {
          agent_account_id?: string
          amount_rm?: number
          cancelled_at?: string | null
          checkout_url?: string | null
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          gateway_ref?: string | null
          gateway_session_id?: string | null
          id?: string
          organization_id?: string
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["online_payment_method"]
          provider?: string | null
          purpose?: Database["public"]["Enums"]["agent_payment_purpose"]
          reference_id?: string
          reference_type?: string
          refund_reason?: string | null
          refund_ref?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["agent_payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_online_payments_agent_account_id_fkey"
            columns: ["agent_account_id"]
            isOneToOne: false
            referencedRelation: "sales_agent_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_online_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_online_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "agent_online_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_outlet_subscriptions: {
        Row: {
          amount_rm: number
          created_at: string
          id: string
          organization_id: string
          outlet_id: string
          payment_id: string | null
          period_end: string
          period_start: string
          status: string
        }
        Insert: {
          amount_rm?: number
          created_at?: string
          id?: string
          organization_id: string
          outlet_id: string
          payment_id?: string | null
          period_end: string
          period_start: string
          status?: string
        }
        Update: {
          amount_rm?: number
          created_at?: string
          id?: string
          organization_id?: string
          outlet_id?: string
          payment_id?: string | null
          period_end?: string
          period_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_outlet_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "agent_outlet_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_outlet_subscriptions_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "agent_outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_outlets: {
        Row: {
          address_line: string | null
          agent_account_id: string
          city: string | null
          created_at: string
          id: string
          organization_id: string
          outlet_code: string
          outlet_name: string
          pos_enabled: boolean
          postcode: string | null
          registered_at: string
          state: string | null
          status: Database["public"]["Enums"]["agent_outlet_status"]
          subscription_active: boolean
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          agent_account_id: string
          city?: string | null
          created_at?: string
          id?: string
          organization_id: string
          outlet_code: string
          outlet_name: string
          pos_enabled?: boolean
          postcode?: string | null
          registered_at?: string
          state?: string | null
          status?: Database["public"]["Enums"]["agent_outlet_status"]
          subscription_active?: boolean
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          agent_account_id?: string
          city?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          outlet_code?: string
          outlet_name?: string
          pos_enabled?: boolean
          postcode?: string | null
          registered_at?: string
          state?: string | null
          status?: Database["public"]["Enums"]["agent_outlet_status"]
          subscription_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_outlets_agent_account_id_fkey"
            columns: ["agent_account_id"]
            isOneToOne: false
            referencedRelation: "sales_agent_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_outlets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "agent_outlets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_payment_receipts: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          payment_id: string
          receipt_data: Json
          receipt_number: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          payment_id: string
          receipt_data: Json
          receipt_number: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          payment_id?: string
          receipt_data?: Json
          receipt_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_payment_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "agent_payment_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_payment_receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "agent_online_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_price_group_items: {
        Row: {
          created_at: string
          id: string
          item_label: string
          organization_id: string
          package_description: string | null
          price_group_id: string
          status: Database["public"]["Enums"]["entity_status"]
          stock_item_id: string
          unit_price_rm: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_label: string
          organization_id: string
          package_description?: string | null
          price_group_id: string
          status?: Database["public"]["Enums"]["entity_status"]
          stock_item_id: string
          unit_price_rm: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_label?: string
          organization_id?: string
          package_description?: string | null
          price_group_id?: string
          status?: Database["public"]["Enums"]["entity_status"]
          stock_item_id?: string
          unit_price_rm?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_price_group_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "agent_price_group_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_price_group_items_price_group_id_fkey"
            columns: ["price_group_id"]
            isOneToOne: false
            referencedRelation: "agent_price_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_price_group_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_price_groups: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          legal_entity_id: string
          name: string
          organization_id: string
          payment_exempt: boolean
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          legal_entity_id: string
          name: string
          organization_id: string
          payment_exempt?: boolean
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          legal_entity_id?: string
          name?: string
          organization_id?: string
          payment_exempt?: boolean
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_price_groups_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_price_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "agent_price_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_sales_staff: {
        Row: {
          agent_account_id: string
          created_at: string
          created_by: string | null
          duty_scope: string | null
          email: string | null
          full_name: string
          id: string
          organization_id: string
          outlet_id: string | null
          phone: string | null
          role_title: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_account_id: string
          created_at?: string
          created_by?: string | null
          duty_scope?: string | null
          email?: string | null
          full_name: string
          id?: string
          organization_id: string
          outlet_id?: string | null
          phone?: string | null
          role_title?: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_account_id?: string
          created_at?: string
          created_by?: string | null
          duty_scope?: string | null
          email?: string | null
          full_name?: string
          id?: string
          organization_id?: string
          outlet_id?: string | null
          phone?: string | null
          role_title?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_sales_staff_agent_account_id_fkey"
            columns: ["agent_account_id"]
            isOneToOne: false
            referencedRelation: "sales_agent_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_sales_staff_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_sales_staff_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "agent_sales_staff_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_sales_staff_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "agent_outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_special_staff_assignments: {
        Row: {
          agent_account_id: string
          assigned_at: string
          assigned_by: string | null
          assignment_note: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          legal_entity_id: string | null
          organization_id: string
          profile_id: string | null
          role_title: string
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_account_id: string
          assigned_at?: string
          assigned_by?: string | null
          assignment_note?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          legal_entity_id?: string | null
          organization_id: string
          profile_id?: string | null
          role_title?: string
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_account_id?: string
          assigned_at?: string
          assigned_by?: string | null
          assignment_note?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          legal_entity_id?: string | null
          organization_id?: string
          profile_id?: string | null
          role_title?: string
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_special_staff_assignments_agent_account_id_fkey"
            columns: ["agent_account_id"]
            isOneToOne: false
            referencedRelation: "sales_agent_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_special_staff_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_special_staff_assignments_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_special_staff_assignments_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_special_staff_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "agent_special_staff_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_special_staff_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_special_staff_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_stock_order_items: {
        Row: {
          created_at: string
          id: string
          line_total_rm: number
          order_id: string
          quantity: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
          unit_price_rm: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total_rm?: number
          order_id: string
          quantity: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
          unit_price_rm?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total_rm?: number
          order_id?: string
          quantity?: number
          stock_item_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
          unit_price_rm?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_stock_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "agent_stock_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_stock_order_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_stock_orders: {
        Row: {
          agent_account_id: string
          created_at: string
          created_by: string | null
          factory_order_id: string | null
          id: string
          notes: string | null
          order_number: string
          organization_id: string
          payment_id: string | null
          production_date: string
          status: Database["public"]["Enums"]["agent_order_status"]
          submitted_at: string | null
          total_amount_rm: number
          updated_at: string
        }
        Insert: {
          agent_account_id: string
          created_at?: string
          created_by?: string | null
          factory_order_id?: string | null
          id?: string
          notes?: string | null
          order_number: string
          organization_id: string
          payment_id?: string | null
          production_date: string
          status?: Database["public"]["Enums"]["agent_order_status"]
          submitted_at?: string | null
          total_amount_rm?: number
          updated_at?: string
        }
        Update: {
          agent_account_id?: string
          created_at?: string
          created_by?: string | null
          factory_order_id?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          organization_id?: string
          payment_id?: string | null
          production_date?: string
          status?: Database["public"]["Enums"]["agent_order_status"]
          submitted_at?: string | null
          total_amount_rm?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_stock_orders_agent_account_id_fkey"
            columns: ["agent_account_id"]
            isOneToOne: false
            referencedRelation: "sales_agent_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_stock_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_stock_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "agent_stock_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_stock_orders_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "agent_online_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          approved_by: string | null
          assigned_to: string | null
          branch_id: string | null
          created_at: string
          description: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["approval_entity_type"]
          id: string
          metadata: Json
          organization_id: string
          region_id: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_by: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["approval_status"]
          title: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          assigned_to?: string | null
          branch_id?: string | null
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["approval_entity_type"]
          id?: string
          metadata?: Json
          organization_id: string
          region_id?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_by: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          title: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          assigned_to?: string | null
          branch_id?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["approval_entity_type"]
          id?: string
          metadata?: Json
          organization_id?: string
          region_id?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_by?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "approval_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      area_manager_operation_events: {
        Row: {
          branch_ids: string[]
          completed_at: string | null
          created_at: string
          created_by: string | null
          event_type: string
          highway_party: string | null
          id: string
          notes: string | null
          organization_id: string
          region_id: string | null
          scheduled_date: string
          scheduled_time: string | null
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          branch_ids?: string[]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          event_type: string
          highway_party?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          region_id?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          branch_ids?: string[]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          event_type?: string
          highway_party?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          region_id?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "area_manager_operation_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_manager_operation_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "area_manager_operation_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_manager_operation_events_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_manager_operation_events_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          attendance_date: string
          branch_id: string
          clock_in: string | null
          clock_out: string | null
          created_at: string
          hours_worked: number | null
          id: string
          is_absent: boolean
          is_late: boolean
          notes: string | null
          organization_id: string
          ot_hours: number
          staff_id: string
          staff_shift_id: string | null
          updated_at: string
        }
        Insert: {
          attendance_date: string
          branch_id: string
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          hours_worked?: number | null
          id?: string
          is_absent?: boolean
          is_late?: boolean
          notes?: string | null
          organization_id: string
          ot_hours?: number
          staff_id: string
          staff_shift_id?: string | null
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          branch_id?: string
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          hours_worked?: number | null
          id?: string
          is_absent?: boolean
          is_late?: boolean
          notes?: string | null
          organization_id?: string
          ot_hours?: number
          staff_id?: string
          staff_shift_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "attendance_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_staff_shift_id_fkey"
            columns: ["staff_shift_id"]
            isOneToOne: false
            referencedRelation: "staff_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          organization_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          organization_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_in_records: {
        Row: {
          amount: number
          bank_in_number: string
          bank_name: string | null
          banked_at: string
          banked_by: string | null
          collection_id: string | null
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          reference_number: string | null
          slip_url: string | null
          status: Database["public"]["Enums"]["collection_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          bank_in_number: string
          bank_name?: string | null
          banked_at: string
          banked_by?: string | null
          collection_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          reference_number?: string | null
          slip_url?: string | null
          status?: Database["public"]["Enums"]["collection_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          bank_in_number?: string
          bank_name?: string | null
          banked_at?: string
          banked_by?: string | null
          collection_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          reference_number?: string | null
          slip_url?: string | null
          status?: Database["public"]["Enums"]["collection_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_in_records_banked_by_fkey"
            columns: ["banked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_in_records_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "finance_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_in_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "bank_in_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_in_records_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          assigned_to: string | null
          booking_number: string
          booking_type: string
          branch_id: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          description: string | null
          expected_pax: number | null
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          priority: string
          scheduled_date: string
          scheduled_time: string | null
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          booking_number: string
          booking_type?: string
          branch_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description?: string | null
          expected_pax?: number | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id: string
          priority?: string
          scheduled_date: string
          scheduled_time?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          booking_number?: string
          booking_type?: string
          branch_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description?: string | null
          expected_pax?: number | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id?: string
          priority?: string
          scheduled_date?: string
          scheduled_time?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          area: string | null
          branch_code: string
          branch_name: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          manager_name: string | null
          organization_id: string
          region_id: string
          remarks: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          area?: string | null
          branch_code: string
          branch_name: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          manager_name?: string | null
          organization_id: string
          region_id: string
          remarks?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          area?: string | null
          branch_code?: string
          branch_name?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          manager_name?: string | null
          organization_id?: string
          region_id?: string
          remarks?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_reconciliations: {
        Row: {
          actual_cash: number
          approved_by: string | null
          branch_id: string
          created_at: string
          expected_cash: number
          id: string
          notes: string | null
          organization_id: string
          reconciled_by: string | null
          reconciliation_date: string
          reconciliation_number: string
          status: Database["public"]["Enums"]["approval_status"]
          variance: number | null
        }
        Insert: {
          actual_cash: number
          approved_by?: string | null
          branch_id: string
          created_at?: string
          expected_cash: number
          id?: string
          notes?: string | null
          organization_id: string
          reconciled_by?: string | null
          reconciliation_date: string
          reconciliation_number: string
          status?: Database["public"]["Enums"]["approval_status"]
          variance?: number | null
        }
        Update: {
          actual_cash?: number
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          expected_cash?: number
          id?: string
          notes?: string | null
          organization_id?: string
          reconciled_by?: string | null
          reconciliation_date?: string
          reconciliation_number?: string
          status?: Database["public"]["Enums"]["approval_status"]
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_reconciliations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "cash_reconciliations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_tiers: {
        Row: {
          commission_amount: number
          created_at: string
          formula_description: string | null
          id: string
          notes: string | null
          organization_id: string
          status: Database["public"]["Enums"]["entity_status"]
          tier_from: number
          tier_to: number | null
          updated_at: string
        }
        Insert: {
          commission_amount: number
          created_at?: string
          formula_description?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["entity_status"]
          tier_from: number
          tier_to?: number | null
          updated_at?: string
        }
        Update: {
          commission_amount?: number
          created_at?: string
          formula_description?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["entity_status"]
          tier_from?: number
          tier_to?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_tiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "commission_tiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_vehicle_assignments: {
        Row: {
          acknowledged_at: string | null
          assigned_at: string
          assigned_by: string | null
          condition_notes: string | null
          created_at: string
          custodian_profile_id: string
          end_odometer_km: number | null
          id: string
          image_urls: Json
          organization_id: string
          returned_at: string | null
          start_odometer_km: number | null
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          condition_notes?: string | null
          created_at?: string
          custodian_profile_id: string
          end_odometer_km?: number | null
          id?: string
          image_urls?: Json
          organization_id: string
          returned_at?: string | null
          start_odometer_km?: number | null
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          acknowledged_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          condition_notes?: string | null
          created_at?: string
          custodian_profile_id?: string
          end_odometer_km?: number | null
          id?: string
          image_urls?: Json
          organization_id?: string
          returned_at?: string | null
          start_odometer_km?: number | null
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_vehicle_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_assignments_custodian_profile_id_fkey"
            columns: ["custodian_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "company_vehicle_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_vehicle_documents: {
        Row: {
          created_at: string
          document_name: string
          document_type: string
          document_url: string | null
          expires_at: string | null
          id: string
          issued_at: string | null
          organization_id: string
          status: string
          updated_at: string
          uploaded_by: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          document_name: string
          document_type: string
          document_url?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          organization_id: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          document_name?: string
          document_type?: string
          document_url?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_vehicle_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "company_vehicle_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_vehicle_expenses: {
        Row: {
          amount: number
          created_at: string
          expense_date: string
          expense_type: string
          fuel_litres: number | null
          id: string
          notes: string | null
          odometer_km: number | null
          organization_id: string
          receipt_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string
          updated_at: string
          usage_log_id: string | null
          vehicle_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          expense_date?: string
          expense_type: string
          fuel_litres?: number | null
          id?: string
          notes?: string | null
          odometer_km?: number | null
          organization_id: string
          receipt_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by: string
          updated_at?: string
          usage_log_id?: string | null
          vehicle_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_date?: string
          expense_type?: string
          fuel_litres?: number | null
          id?: string
          notes?: string | null
          odometer_km?: number | null
          organization_id?: string
          receipt_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string
          updated_at?: string
          usage_log_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_vehicle_expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "company_vehicle_expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_expenses_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_expenses_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_expenses_usage_log_id_fkey"
            columns: ["usage_log_id"]
            isOneToOne: false
            referencedRelation: "company_vehicle_usage_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_vehicle_incidents: {
        Row: {
          actual_cost: number | null
          created_at: string
          description: string
          downtime_end: string | null
          downtime_start: string | null
          estimated_cost: number | null
          id: string
          image_urls: Json
          incident_at: string
          incident_type: string
          insurer_reference: string | null
          latitude: number | null
          location: string | null
          longitude: number | null
          organization_id: string
          police_report_no: string | null
          replacement_vehicle_id: string | null
          reported_by: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          updated_at: string
          vehicle_id: string
          workshop: string | null
        }
        Insert: {
          actual_cost?: number | null
          created_at?: string
          description: string
          downtime_end?: string | null
          downtime_start?: string | null
          estimated_cost?: number | null
          id?: string
          image_urls?: Json
          incident_at?: string
          incident_type: string
          insurer_reference?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          organization_id: string
          police_report_no?: string | null
          replacement_vehicle_id?: string | null
          reported_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
          vehicle_id: string
          workshop?: string | null
        }
        Update: {
          actual_cost?: number | null
          created_at?: string
          description?: string
          downtime_end?: string | null
          downtime_start?: string | null
          estimated_cost?: number | null
          id?: string
          image_urls?: Json
          incident_at?: string
          incident_type?: string
          insurer_reference?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          organization_id?: string
          police_report_no?: string | null
          replacement_vehicle_id?: string | null
          reported_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
          vehicle_id?: string
          workshop?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_vehicle_incidents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "company_vehicle_incidents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_incidents_replacement_vehicle_id_fkey"
            columns: ["replacement_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_incidents_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_incidents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_vehicle_usage_logs: {
        Row: {
          created_at: string
          destination: string | null
          end_latitude: number | null
          end_longitude: number | null
          end_odometer_km: number | null
          ended_at: string | null
          id: string
          notes: string | null
          organization_id: string
          profile_id: string
          purpose: string
          start_latitude: number | null
          start_longitude: number | null
          start_odometer_km: number | null
          started_at: string
          status: string
          updated_at: string
          usage_type: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          destination?: string | null
          end_latitude?: number | null
          end_longitude?: number | null
          end_odometer_km?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          profile_id: string
          purpose: string
          start_latitude?: number | null
          start_longitude?: number | null
          start_odometer_km?: number | null
          started_at?: string
          status?: string
          updated_at?: string
          usage_type?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          destination?: string | null
          end_latitude?: number | null
          end_longitude?: number | null
          end_odometer_km?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          profile_id?: string
          purpose?: string
          start_latitude?: number | null
          start_longitude?: number | null
          start_odometer_km?: number | null
          started_at?: string
          status?: string
          updated_at?: string
          usage_type?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_vehicle_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "company_vehicle_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_usage_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_vehicle_usage_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_financial_reports: {
        Row: {
          branch_id: string | null
          generated_at: string
          id: string
          organization_id: string
          outstanding_cash: number
          report_data: Json
          report_date: string
          total_banked: number
          total_cash_collected: number
          total_qr: number
          total_verified: number
        }
        Insert: {
          branch_id?: string | null
          generated_at?: string
          id?: string
          organization_id: string
          outstanding_cash?: number
          report_data?: Json
          report_date: string
          total_banked?: number
          total_cash_collected?: number
          total_qr?: number
          total_verified?: number
        }
        Update: {
          branch_id?: string | null
          generated_at?: string
          id?: string
          organization_id?: string
          outstanding_cash?: number
          report_data?: Json
          report_date?: string
          total_banked?: number
          total_cash_collected?: number
          total_qr?: number
          total_verified?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_financial_reports_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_financial_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "daily_financial_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_images: {
        Row: {
          caption: string | null
          id: string
          image_url: string
          proof_of_delivery_id: string
          uploaded_at: string
        }
        Insert: {
          caption?: string | null
          id?: string
          image_url: string
          proof_of_delivery_id: string
          uploaded_at?: string
        }
        Update: {
          caption?: string | null
          id?: string
          image_url?: string
          proof_of_delivery_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_images_proof_of_delivery_id_fkey"
            columns: ["proof_of_delivery_id"]
            isOneToOne: false
            referencedRelation: "proof_of_delivery"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_leg_items: {
        Row: {
          id: string
          leg_id: string
          notes: string | null
          quantity: number
          received_quantity: number | null
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Insert: {
          id?: string
          leg_id: string
          notes?: string | null
          quantity: number
          received_quantity?: number | null
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Update: {
          id?: string
          leg_id?: string
          notes?: string | null
          quantity?: number
          received_quantity?: number | null
          stock_item_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "delivery_leg_items_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "delivery_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_leg_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_legs: {
        Row: {
          created_at: string
          delivered_at: string | null
          delivery_order_id: string
          dispatched_at: string | null
          driver_id: string | null
          from_location_id: string
          id: string
          leg_sequence: number
          leg_type: Database["public"]["Enums"]["delivery_leg_type"]
          notes: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          stock_transfer_id: string | null
          to_location_id: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          delivery_order_id: string
          dispatched_at?: string | null
          driver_id?: string | null
          from_location_id: string
          id?: string
          leg_sequence: number
          leg_type: Database["public"]["Enums"]["delivery_leg_type"]
          notes?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          stock_transfer_id?: string | null
          to_location_id: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          delivery_order_id?: string
          dispatched_at?: string | null
          driver_id?: string | null
          from_location_id?: string
          id?: string
          leg_sequence?: number
          leg_type?: Database["public"]["Enums"]["delivery_leg_type"]
          notes?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          stock_transfer_id?: string | null
          to_location_id?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_legs_delivery_order_id_fkey"
            columns: ["delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_legs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_legs_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_legs_stock_transfer_id_fkey"
            columns: ["stock_transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_legs_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_legs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_orders: {
        Row: {
          ai_optimized_at: string | null
          ai_route_summary: string | null
          created_at: string
          created_by: string | null
          driver_current_lat: number | null
          driver_current_lng: number | null
          final_destination_id: string
          id: string
          notes: string | null
          order_number: string
          organization_id: string
          origin_location_id: string
          primary_driver_id: string | null
          primary_vehicle_id: string | null
          scheduled_date: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          updated_at: string
        }
        Insert: {
          ai_optimized_at?: string | null
          ai_route_summary?: string | null
          created_at?: string
          created_by?: string | null
          driver_current_lat?: number | null
          driver_current_lng?: number | null
          final_destination_id: string
          id?: string
          notes?: string | null
          order_number: string
          organization_id: string
          origin_location_id: string
          primary_driver_id?: string | null
          primary_vehicle_id?: string | null
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          updated_at?: string
        }
        Update: {
          ai_optimized_at?: string | null
          ai_route_summary?: string | null
          created_at?: string
          created_by?: string | null
          driver_current_lat?: number | null
          driver_current_lng?: number | null
          final_destination_id?: string
          id?: string
          notes?: string | null
          order_number?: string
          organization_id?: string
          origin_location_id?: string
          primary_driver_id?: string | null
          primary_vehicle_id?: string | null
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_final_destination_id_fkey"
            columns: ["final_destination_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "delivery_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_origin_location_id_fkey"
            columns: ["origin_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_primary_driver_id_fkey"
            columns: ["primary_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_primary_vehicle_id_fkey"
            columns: ["primary_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_vehicle_assignments: {
        Row: {
          acknowledged_at: string | null
          assigned_at: string
          assigned_by: string | null
          assignment_role: string
          created_at: string
          driver_id: string
          id: string
          is_active: boolean
          organization_id: string
          responsibility_notes: string | null
          unassigned_at: string | null
          vehicle_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          assignment_role?: string
          created_at?: string
          driver_id: string
          id?: string
          is_active?: boolean
          organization_id: string
          responsibility_notes?: string | null
          unassigned_at?: string | null
          vehicle_id: string
        }
        Update: {
          acknowledged_at?: string | null
          assigned_at?: string
          assigned_by?: string | null
          assignment_role?: string
          created_at?: string
          driver_id?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          responsibility_notes?: string | null
          unassigned_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_vehicle_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_vehicle_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_vehicle_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "driver_vehicle_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_vehicle_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          created_at: string
          driver_code: string
          full_name: string
          id: string
          organization_id: string
          phone: string | null
          profile_id: string | null
          remarks: string | null
          route_description: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_code: string
          full_name: string
          id?: string
          organization_id: string
          phone?: string | null
          profile_id?: string | null
          remarks?: string | null
          route_description?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_code?: string
          full_name?: string
          id?: string
          organization_id?: string
          phone?: string | null
          profile_id?: string | null
          remarks?: string | null
          route_description?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "drivers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_agent_order_items: {
        Row: {
          factory_agent_order_id: string
          id: string
          quantity: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Insert: {
          factory_agent_order_id: string
          id?: string
          quantity: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Update: {
          factory_agent_order_id?: string
          id?: string
          quantity?: number
          stock_item_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "factory_agent_order_items_factory_agent_order_id_fkey"
            columns: ["factory_agent_order_id"]
            isOneToOne: false
            referencedRelation: "factory_agent_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_agent_order_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_agent_orders: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          agent_account_id: string
          agent_order_id: string
          company_name: string
          created_at: string
          id: string
          organization_id: string
          production_date: string
          status: string
          submitted_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          agent_account_id: string
          agent_order_id: string
          company_name: string
          created_at?: string
          id?: string
          organization_id: string
          production_date: string
          status?: string
          submitted_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          agent_account_id?: string
          agent_order_id?: string
          company_name?: string
          created_at?: string
          id?: string
          organization_id?: string
          production_date?: string
          status?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_agent_orders_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_agent_orders_agent_account_id_fkey"
            columns: ["agent_account_id"]
            isOneToOne: false
            referencedRelation: "sales_agent_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_agent_orders_agent_order_id_fkey"
            columns: ["agent_order_id"]
            isOneToOne: true
            referencedRelation: "agent_stock_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_agent_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "factory_agent_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_gmp_batch_checks: {
        Row: {
          actual_value: string | null
          batch_record_id: string
          check_code: string
          check_group: string
          check_name: string
          checked_at: string
          checked_by: string | null
          created_at: string
          expected_value: string | null
          id: string
          notes: string | null
          organization_id: string
          result: string
        }
        Insert: {
          actual_value?: string | null
          batch_record_id: string
          check_code: string
          check_group: string
          check_name: string
          checked_at?: string
          checked_by?: string | null
          created_at?: string
          expected_value?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          result?: string
        }
        Update: {
          actual_value?: string | null
          batch_record_id?: string
          check_code?: string
          check_group?: string
          check_name?: string
          checked_at?: string
          checked_by?: string | null
          created_at?: string
          expected_value?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_gmp_batch_checks_batch_record_id_fkey"
            columns: ["batch_record_id"]
            isOneToOne: false
            referencedRelation: "factory_gmp_batch_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_batch_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_batch_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "factory_gmp_batch_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_gmp_batch_records: {
        Row: {
          actual_qty: number
          batch_no: string
          created_at: string
          created_by: string | null
          deviation_notes: string | null
          gmp_product_id: string
          hq_factory_order_id: string | null
          id: string
          legal_entity_id: string | null
          organization_id: string
          packaging_trace: Json
          planned_qty: number
          process_readings: Json
          production_date: string
          production_lead_id: string | null
          qa_reviewer_id: string | null
          raw_material_lots: Json
          released_at: string | null
          status: string
          unit: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_qty?: number
          batch_no: string
          created_at?: string
          created_by?: string | null
          deviation_notes?: string | null
          gmp_product_id: string
          hq_factory_order_id?: string | null
          id?: string
          legal_entity_id?: string | null
          organization_id: string
          packaging_trace?: Json
          planned_qty?: number
          process_readings?: Json
          production_date: string
          production_lead_id?: string | null
          qa_reviewer_id?: string | null
          raw_material_lots?: Json
          released_at?: string | null
          status?: string
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_qty?: number
          batch_no?: string
          created_at?: string
          created_by?: string | null
          deviation_notes?: string | null
          gmp_product_id?: string
          hq_factory_order_id?: string | null
          id?: string
          legal_entity_id?: string | null
          organization_id?: string
          packaging_trace?: Json
          planned_qty?: number
          process_readings?: Json
          production_date?: string
          production_lead_id?: string | null
          qa_reviewer_id?: string | null
          raw_material_lots?: Json
          released_at?: string | null
          status?: string
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "factory_gmp_batch_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_batch_records_gmp_product_id_fkey"
            columns: ["gmp_product_id"]
            isOneToOne: false
            referencedRelation: "factory_gmp_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_batch_records_hq_factory_order_id_fkey"
            columns: ["hq_factory_order_id"]
            isOneToOne: false
            referencedRelation: "hq_factory_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_batch_records_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_batch_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "factory_gmp_batch_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_batch_records_production_lead_id_fkey"
            columns: ["production_lead_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_batch_records_qa_reviewer_id_fkey"
            columns: ["qa_reviewer_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_batch_records_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_gmp_non_conformances: {
        Row: {
          batch_record_id: string | null
          closed_at: string | null
          containment_action: string | null
          corrective_action: string | null
          created_at: string
          description: string
          id: string
          issue_type: string
          legal_entity_id: string | null
          organization_id: string
          owner_id: string | null
          raised_by: string | null
          root_cause: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          batch_record_id?: string | null
          closed_at?: string | null
          containment_action?: string | null
          corrective_action?: string | null
          created_at?: string
          description: string
          id?: string
          issue_type: string
          legal_entity_id?: string | null
          organization_id: string
          owner_id?: string | null
          raised_by?: string | null
          root_cause?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          batch_record_id?: string | null
          closed_at?: string | null
          containment_action?: string | null
          corrective_action?: string | null
          created_at?: string
          description?: string
          id?: string
          issue_type?: string
          legal_entity_id?: string | null
          organization_id?: string
          owner_id?: string | null
          raised_by?: string | null
          root_cause?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_gmp_non_conformances_batch_record_id_fkey"
            columns: ["batch_record_id"]
            isOneToOne: false
            referencedRelation: "factory_gmp_batch_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_non_conformances_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_non_conformances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "factory_gmp_non_conformances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_non_conformances_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_non_conformances_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_gmp_products: {
        Row: {
          batch_prefix: string
          created_at: string
          gmp_spec: Json
          id: string
          legal_entity_id: string | null
          organization_id: string
          pos_categories: string[]
          product_code: string
          product_name: string
          status: Database["public"]["Enums"]["entity_status"]
          stock_item_codes: string[]
          updated_at: string
        }
        Insert: {
          batch_prefix: string
          created_at?: string
          gmp_spec?: Json
          id?: string
          legal_entity_id?: string | null
          organization_id: string
          pos_categories?: string[]
          product_code: string
          product_name: string
          status?: Database["public"]["Enums"]["entity_status"]
          stock_item_codes?: string[]
          updated_at?: string
        }
        Update: {
          batch_prefix?: string
          created_at?: string
          gmp_spec?: Json
          id?: string
          legal_entity_id?: string | null
          organization_id?: string
          pos_categories?: string[]
          product_code?: string
          product_name?: string
          status?: Database["public"]["Enums"]["entity_status"]
          stock_item_codes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_gmp_products_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "factory_gmp_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_gmp_sanitation_logs: {
        Row: {
          area_code: string
          checklist: Json
          cleaned_by: string | null
          created_at: string
          id: string
          legal_entity_id: string | null
          notes: string | null
          organization_id: string
          production_date: string
          shift_name: string
          status: string
          updated_at: string
          verified_by: string | null
        }
        Insert: {
          area_code: string
          checklist?: Json
          cleaned_by?: string | null
          created_at?: string
          id?: string
          legal_entity_id?: string | null
          notes?: string | null
          organization_id: string
          production_date: string
          shift_name?: string
          status?: string
          updated_at?: string
          verified_by?: string | null
        }
        Update: {
          area_code?: string
          checklist?: Json
          cleaned_by?: string | null
          created_at?: string
          id?: string
          legal_entity_id?: string | null
          notes?: string | null
          organization_id?: string
          production_date?: string
          shift_name?: string
          status?: string
          updated_at?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "factory_gmp_sanitation_logs_cleaned_by_fkey"
            columns: ["cleaned_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_sanitation_logs_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_sanitation_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "factory_gmp_sanitation_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_sanitation_logs_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_gmp_staff_assignments: {
        Row: {
          assignment_code: string
          created_at: string
          department: string
          effective_from: string
          effective_to: string | null
          gmp_role: string
          id: string
          is_primary: boolean
          legal_entity_id: string | null
          notes: string | null
          organization_id: string
          reports_to_staff_id: string | null
          staff_id: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          assignment_code: string
          created_at?: string
          department: string
          effective_from?: string
          effective_to?: string | null
          gmp_role: string
          id?: string
          is_primary?: boolean
          legal_entity_id?: string | null
          notes?: string | null
          organization_id: string
          reports_to_staff_id?: string | null
          staff_id: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          assignment_code?: string
          created_at?: string
          department?: string
          effective_from?: string
          effective_to?: string | null
          gmp_role?: string
          id?: string
          is_primary?: boolean
          legal_entity_id?: string | null
          notes?: string | null
          organization_id?: string
          reports_to_staff_id?: string | null
          staff_id?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_gmp_staff_assignments_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_staff_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "factory_gmp_staff_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_staff_assignments_reports_to_staff_id_fkey"
            columns: ["reports_to_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_gmp_staff_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_production_days: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          orders_locked: boolean
          orders_locked_at: string | null
          production_date: string
          week_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          orders_locked?: boolean
          orders_locked_at?: string | null
          production_date: string
          week_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          orders_locked?: boolean
          orders_locked_at?: string | null
          production_date?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_production_days_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "factory_production_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_production_weeks: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          published_at: string | null
          published_by: string | null
          status: string
          updated_at: string
          week_start: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          updated_at?: string
          week_start: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_production_weeks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_production_weeks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "factory_production_weeks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_production_weeks_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      factory_raw_material_stock_cards: {
        Row: {
          balance_qty: number
          created_at: string
          id: string
          legal_entity_id: string | null
          location_id: string
          measurement_note: string | null
          notes: string | null
          organization_id: string
          production_date: string | null
          recorded_by: string | null
          source_month: string | null
          source_ref: string | null
          stock_date: string
          stock_in_qty: number
          stock_item_id: string
          stock_out_qty: number
          unit_label: string
          updated_at: string
        }
        Insert: {
          balance_qty?: number
          created_at?: string
          id?: string
          legal_entity_id?: string | null
          location_id: string
          measurement_note?: string | null
          notes?: string | null
          organization_id: string
          production_date?: string | null
          recorded_by?: string | null
          source_month?: string | null
          source_ref?: string | null
          stock_date: string
          stock_in_qty?: number
          stock_item_id: string
          stock_out_qty?: number
          unit_label: string
          updated_at?: string
        }
        Update: {
          balance_qty?: number
          created_at?: string
          id?: string
          legal_entity_id?: string | null
          location_id?: string
          measurement_note?: string | null
          notes?: string | null
          organization_id?: string
          production_date?: string | null
          recorded_by?: string | null
          source_month?: string | null
          source_ref?: string | null
          stock_date?: string
          stock_in_qty?: number
          stock_item_id?: string
          stock_out_qty?: number
          unit_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "factory_raw_material_stock_cards_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_raw_material_stock_cards_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_raw_material_stock_cards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "factory_raw_material_stock_cards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_raw_material_stock_cards_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factory_raw_material_stock_cards_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_collection_usages: {
        Row: {
          amount: number
          branch_id: string
          collection_id: string
          created_at: string
          description: string
          id: string
          organization_id: string
          proof_url: string | null
          receipt_number: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          spent_at: string
          spent_by: string
          status: string
          supply_request_id: string | null
          updated_at: string
          usage_number: string
          usage_type: string
          vehicle_reference: string | null
          vendor_name: string | null
        }
        Insert: {
          amount: number
          branch_id: string
          collection_id: string
          created_at?: string
          description: string
          id?: string
          organization_id: string
          proof_url?: string | null
          receipt_number?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent_at?: string
          spent_by: string
          status?: string
          supply_request_id?: string | null
          updated_at?: string
          usage_number: string
          usage_type: string
          vehicle_reference?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string
          collection_id?: string
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          proof_url?: string | null
          receipt_number?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent_at?: string
          spent_by?: string
          status?: string
          supply_request_id?: string | null
          updated_at?: string
          usage_number?: string
          usage_type?: string
          vehicle_reference?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_collection_usages_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_collection_usages_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "finance_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_collection_usages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "finance_collection_usages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_collection_usages_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_collection_usages_spent_by_fkey"
            columns: ["spent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_collection_usages_supply_request_id_fkey"
            columns: ["supply_request_id"]
            isOneToOne: false
            referencedRelation: "pos_branch_supply_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_collections: {
        Row: {
          amount: number
          branch_id: string | null
          collected_at: string | null
          collected_by: string | null
          collected_from: string | null
          collection_number: string
          collection_type: Database["public"]["Enums"]["collection_type"]
          collector_name: string | null
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          shift_id: string | null
          status: Database["public"]["Enums"]["collection_status"]
          third_party_name: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id?: string | null
          collected_at?: string | null
          collected_by?: string | null
          collected_from?: string | null
          collection_number: string
          collection_type: Database["public"]["Enums"]["collection_type"]
          collector_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          shift_id?: string | null
          status?: Database["public"]["Enums"]["collection_status"]
          third_party_name?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          collected_at?: string | null
          collected_by?: string | null
          collected_from?: string | null
          collection_number?: string
          collection_type?: Database["public"]["Enums"]["collection_type"]
          collector_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          shift_id?: string | null
          status?: Database["public"]["Enums"]["collection_status"]
          third_party_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_collections_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_collections_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_collections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "finance_collections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_collections_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_flow_config: {
        Row: {
          auto_recorded: boolean
          collection_type: Database["public"]["Enums"]["collection_type"]
          collector_role: string | null
          created_at: string
          flow_code: string
          from_entity: string
          id: string
          notes: string | null
          organization_id: string
          status: Database["public"]["Enums"]["entity_status"]
          to_entity: string
        }
        Insert: {
          auto_recorded?: boolean
          collection_type: Database["public"]["Enums"]["collection_type"]
          collector_role?: string | null
          created_at?: string
          flow_code: string
          from_entity: string
          id?: string
          notes?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["entity_status"]
          to_entity: string
        }
        Update: {
          auto_recorded?: boolean
          collection_type?: Database["public"]["Enums"]["collection_type"]
          collector_role?: string | null
          created_at?: string
          flow_code?: string
          from_entity?: string
          id?: string
          notes?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["entity_status"]
          to_entity?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_flow_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "finance_flow_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_driver_sessions: {
        Row: {
          checklist: Json
          created_at: string
          current_route_stop_id: string | null
          driver_id: string
          end_latitude: number | null
          end_longitude: number | null
          end_odometer_km: number | null
          ended_at: string | null
          id: string
          last_navigation_at: string | null
          notes: string | null
          organization_id: string
          profile_id: string | null
          route_preferences: Json
          safe_driving_mode: boolean
          start_latitude: number | null
          start_longitude: number | null
          start_odometer_km: number | null
          started_at: string
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          checklist?: Json
          created_at?: string
          current_route_stop_id?: string | null
          driver_id: string
          end_latitude?: number | null
          end_longitude?: number | null
          end_odometer_km?: number | null
          ended_at?: string | null
          id?: string
          last_navigation_at?: string | null
          notes?: string | null
          organization_id: string
          profile_id?: string | null
          route_preferences?: Json
          safe_driving_mode?: boolean
          start_latitude?: number | null
          start_longitude?: number | null
          start_odometer_km?: number | null
          started_at?: string
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          checklist?: Json
          created_at?: string
          current_route_stop_id?: string | null
          driver_id?: string
          end_latitude?: number | null
          end_longitude?: number | null
          end_odometer_km?: number | null
          ended_at?: string | null
          id?: string
          last_navigation_at?: string | null
          notes?: string | null
          organization_id?: string
          profile_id?: string | null
          route_preferences?: Json
          safe_driving_mode?: boolean
          start_latitude?: number | null
          start_longitude?: number | null
          start_odometer_km?: number | null
          started_at?: string
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_driver_sessions_current_route_stop_id_fkey"
            columns: ["current_route_stop_id"]
            isOneToOne: false
            referencedRelation: "hq_delivery_route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_driver_sessions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_driver_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "fleet_driver_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_driver_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_driver_sessions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_geofences: {
        Row: {
          branch_id: string | null
          confidence_score: number
          created_at: string
          created_by: string | null
          geofence_type: string
          id: string
          inventory_location_id: string | null
          is_active: boolean
          last_observed_at: string | null
          latitude: number
          location_source: string
          longitude: number
          name: string
          notify_arrival: boolean
          notify_departure: boolean
          observation_count: number
          organization_id: string
          radius_m: number
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          branch_id?: string | null
          confidence_score?: number
          created_at?: string
          created_by?: string | null
          geofence_type?: string
          id?: string
          inventory_location_id?: string | null
          is_active?: boolean
          last_observed_at?: string | null
          latitude: number
          location_source?: string
          longitude: number
          name: string
          notify_arrival?: boolean
          notify_departure?: boolean
          observation_count?: number
          organization_id: string
          radius_m?: number
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          branch_id?: string | null
          confidence_score?: number
          created_at?: string
          created_by?: string | null
          geofence_type?: string
          id?: string
          inventory_location_id?: string | null
          is_active?: boolean
          last_observed_at?: string | null
          latitude?: number
          location_source?: string
          longitude?: number
          name?: string
          notify_arrival?: boolean
          notify_departure?: boolean
          observation_count?: number
          organization_id?: string
          radius_m?: number
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_geofences_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_geofences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_geofences_inventory_location_id_fkey"
            columns: ["inventory_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_geofences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "fleet_geofences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_gps_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          dedupe_key: string
          delivery_order_id: string | null
          driver_id: string | null
          event_at: string
          geofence_id: string | null
          id: string
          message: string
          metadata: Json
          organization_id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          title: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          dedupe_key: string
          delivery_order_id?: string | null
          driver_id?: string | null
          event_at?: string
          geofence_id?: string | null
          id?: string
          message: string
          metadata?: Json
          organization_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          dedupe_key?: string
          delivery_order_id?: string | null
          driver_id?: string | null
          event_at?: string
          geofence_id?: string | null
          id?: string
          message?: string
          metadata?: Json
          organization_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_gps_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_gps_alerts_delivery_order_id_fkey"
            columns: ["delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_gps_alerts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_gps_alerts_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "fleet_geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_gps_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "fleet_gps_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_gps_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_gps_alerts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_gps_snapshots: {
        Row: {
          driver_name: string | null
          event_at: string
          fuel_level: number | null
          heading: number | null
          id: string
          ignition: boolean | null
          latitude: number | null
          location_description: string | null
          longitude: number | null
          odometer_km: number | null
          organization_id: string
          raw_status: string | null
          received_at: string
          registration: string | null
          speed_kph: number | null
          vehicle_id: string
        }
        Insert: {
          driver_name?: string | null
          event_at: string
          fuel_level?: number | null
          heading?: number | null
          id?: string
          ignition?: boolean | null
          latitude?: number | null
          location_description?: string | null
          longitude?: number | null
          odometer_km?: number | null
          organization_id: string
          raw_status?: string | null
          received_at?: string
          registration?: string | null
          speed_kph?: number | null
          vehicle_id: string
        }
        Update: {
          driver_name?: string | null
          event_at?: string
          fuel_level?: number | null
          heading?: number | null
          id?: string
          ignition?: boolean | null
          latitude?: number | null
          location_description?: string | null
          longitude?: number | null
          odometer_km?: number | null
          organization_id?: string
          raw_status?: string | null
          received_at?: string
          registration?: string | null
          speed_kph?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_gps_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "fleet_gps_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_gps_snapshots_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_location_observations: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          delivery_leg_id: string | null
          distance_to_center_m: number | null
          driver_id: string | null
          geofence_id: string | null
          gps_event_at: string | null
          id: string
          latitude: number
          longitude: number
          metadata: Json
          organization_id: string
          proof_of_delivery_id: string | null
          rejection_reason: string | null
          route_stop_id: string | null
          source: string
          speed_kph: number | null
          status: string
          vehicle_id: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          delivery_leg_id?: string | null
          distance_to_center_m?: number | null
          driver_id?: string | null
          geofence_id?: string | null
          gps_event_at?: string | null
          id?: string
          latitude: number
          longitude: number
          metadata?: Json
          organization_id: string
          proof_of_delivery_id?: string | null
          rejection_reason?: string | null
          route_stop_id?: string | null
          source: string
          speed_kph?: number | null
          status?: string
          vehicle_id?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          delivery_leg_id?: string | null
          distance_to_center_m?: number | null
          driver_id?: string | null
          geofence_id?: string | null
          gps_event_at?: string | null
          id?: string
          latitude?: number
          longitude?: number
          metadata?: Json
          organization_id?: string
          proof_of_delivery_id?: string | null
          rejection_reason?: string | null
          route_stop_id?: string | null
          source?: string
          speed_kph?: number | null
          status?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_location_observations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_location_observations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_location_observations_delivery_leg_id_fkey"
            columns: ["delivery_leg_id"]
            isOneToOne: false
            referencedRelation: "delivery_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_location_observations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_location_observations_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "fleet_geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_location_observations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "fleet_location_observations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_location_observations_proof_of_delivery_id_fkey"
            columns: ["proof_of_delivery_id"]
            isOneToOne: false
            referencedRelation: "proof_of_delivery"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_location_observations_route_stop_id_fkey"
            columns: ["route_stop_id"]
            isOneToOne: false
            referencedRelation: "hq_delivery_route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_location_observations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_maintenance_plans: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          interval_days: number | null
          interval_km: number | null
          last_service_date: string | null
          last_service_odometer_km: number | null
          next_service_date: string | null
          next_service_odometer_km: number | null
          notes: string | null
          organization_id: string
          service_name: string
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          interval_days?: number | null
          interval_km?: number | null
          last_service_date?: string | null
          last_service_odometer_km?: number | null
          next_service_date?: string | null
          next_service_odometer_km?: number | null
          notes?: string | null
          organization_id: string
          service_name: string
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          interval_days?: number | null
          interval_km?: number | null
          last_service_date?: string | null
          last_service_odometer_km?: number | null
          next_service_date?: string | null
          next_service_odometer_km?: number | null
          notes?: string | null
          organization_id?: string
          service_name?: string
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_maintenance_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_maintenance_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "fleet_maintenance_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_maintenance_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_navigation_events: {
        Row: {
          created_at: string
          created_by: string | null
          destination_latitude: number | null
          destination_longitude: number | null
          destination_name: string
          driver_id: string | null
          event_type: string
          geofence_id: string | null
          id: string
          metadata: Json
          navigation_provider: string
          organization_id: string
          origin_latitude: number | null
          origin_longitude: number | null
          reason: string | null
          route_plan_id: string | null
          route_stop_id: string | null
          session_id: string | null
          used_coordinate_fallback: boolean
          vehicle_id: string | null
          waze_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          destination_latitude?: number | null
          destination_longitude?: number | null
          destination_name: string
          driver_id?: string | null
          event_type: string
          geofence_id?: string | null
          id?: string
          metadata?: Json
          navigation_provider?: string
          organization_id: string
          origin_latitude?: number | null
          origin_longitude?: number | null
          reason?: string | null
          route_plan_id?: string | null
          route_stop_id?: string | null
          session_id?: string | null
          used_coordinate_fallback?: boolean
          vehicle_id?: string | null
          waze_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          destination_latitude?: number | null
          destination_longitude?: number | null
          destination_name?: string
          driver_id?: string | null
          event_type?: string
          geofence_id?: string | null
          id?: string
          metadata?: Json
          navigation_provider?: string
          organization_id?: string
          origin_latitude?: number | null
          origin_longitude?: number | null
          reason?: string | null
          route_plan_id?: string | null
          route_stop_id?: string | null
          session_id?: string | null
          used_coordinate_fallback?: boolean
          vehicle_id?: string | null
          waze_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_navigation_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_navigation_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_navigation_events_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "fleet_geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_navigation_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "fleet_navigation_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_navigation_events_route_plan_id_fkey"
            columns: ["route_plan_id"]
            isOneToOne: false
            referencedRelation: "hq_delivery_route_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_navigation_events_route_stop_id_fkey"
            columns: ["route_stop_id"]
            isOneToOne: false
            referencedRelation: "hq_delivery_route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_navigation_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "fleet_driver_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_navigation_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_status_log: {
        Row: {
          driver_id: string | null
          gps_latitude: number | null
          gps_longitude: number | null
          id: string
          location_description: string | null
          logged_at: string
          notes: string | null
          organization_id: string
          status: string
          vehicle_id: string
        }
        Insert: {
          driver_id?: string | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          location_description?: string | null
          logged_at?: string
          notes?: string | null
          organization_id: string
          status: string
          vehicle_id: string
        }
        Update: {
          driver_id?: string | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          id?: string
          location_description?: string | null
          logged_at?: string
          notes?: string | null
          organization_id?: string
          status?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_status_log_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_status_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "fleet_status_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_status_log_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      hq_delivery_route_plans: {
        Row: {
          ai_optimized_at: string | null
          ai_route_summary: string | null
          created_at: string
          created_by: string | null
          delivery_order_id: string | null
          depends_on_plan_id: string | null
          driver_id: string | null
          factory_order_id: string | null
          handoff_completed_at: string | null
          id: string
          instruction_code: string | null
          instruction_part: number
          notes: string | null
          organization_id: string
          production_date: string
          region_code: Database["public"]["Enums"]["region_code"] | null
          route_name: string
          route_pattern: string
          status: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          ai_optimized_at?: string | null
          ai_route_summary?: string | null
          created_at?: string
          created_by?: string | null
          delivery_order_id?: string | null
          depends_on_plan_id?: string | null
          driver_id?: string | null
          factory_order_id?: string | null
          handoff_completed_at?: string | null
          id?: string
          instruction_code?: string | null
          instruction_part?: number
          notes?: string | null
          organization_id: string
          production_date: string
          region_code?: Database["public"]["Enums"]["region_code"] | null
          route_name: string
          route_pattern?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          ai_optimized_at?: string | null
          ai_route_summary?: string | null
          created_at?: string
          created_by?: string | null
          delivery_order_id?: string | null
          depends_on_plan_id?: string | null
          driver_id?: string | null
          factory_order_id?: string | null
          handoff_completed_at?: string | null
          id?: string
          instruction_code?: string | null
          instruction_part?: number
          notes?: string | null
          organization_id?: string
          production_date?: string
          region_code?: Database["public"]["Enums"]["region_code"] | null
          route_name?: string
          route_pattern?: string
          status?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hq_delivery_route_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_delivery_route_plans_delivery_order_id_fkey"
            columns: ["delivery_order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_delivery_route_plans_depends_on_plan_id_fkey"
            columns: ["depends_on_plan_id"]
            isOneToOne: false
            referencedRelation: "hq_delivery_route_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_delivery_route_plans_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_delivery_route_plans_factory_order_id_fkey"
            columns: ["factory_order_id"]
            isOneToOne: false
            referencedRelation: "hq_factory_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_delivery_route_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "hq_delivery_route_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_delivery_route_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      hq_delivery_route_stop_items: {
        Row: {
          adjusted_quantity: number | null
          adjustment_reason: string | null
          id: string
          planned_quantity: number | null
          quantity: number
          stock_item_id: string
          stop_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Insert: {
          adjusted_quantity?: number | null
          adjustment_reason?: string | null
          id?: string
          planned_quantity?: number | null
          quantity: number
          stock_item_id: string
          stop_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Update: {
          adjusted_quantity?: number | null
          adjustment_reason?: string | null
          id?: string
          planned_quantity?: number | null
          quantity?: number
          stock_item_id?: string
          stop_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "hq_delivery_route_stop_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_delivery_route_stop_items_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "hq_delivery_route_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      hq_delivery_route_stops: {
        Row: {
          branch_id: string | null
          delivered_at: string | null
          delivered_by: string | null
          driver_id: string | null
          handoff_driver_id: string | null
          id: string
          is_handoff: boolean
          location_id: string
          notes: string | null
          route_plan_id: string
          status: string
          stock_transfer_id: string | null
          stop_sequence: number
        }
        Insert: {
          branch_id?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          driver_id?: string | null
          handoff_driver_id?: string | null
          id?: string
          is_handoff?: boolean
          location_id: string
          notes?: string | null
          route_plan_id: string
          status?: string
          stock_transfer_id?: string | null
          stop_sequence: number
        }
        Update: {
          branch_id?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          driver_id?: string | null
          handoff_driver_id?: string | null
          id?: string
          is_handoff?: boolean
          location_id?: string
          notes?: string | null
          route_plan_id?: string
          status?: string
          stock_transfer_id?: string | null
          stop_sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "hq_delivery_route_stops_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_delivery_route_stops_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_delivery_route_stops_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_delivery_route_stops_handoff_driver_id_fkey"
            columns: ["handoff_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_delivery_route_stops_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_delivery_route_stops_route_plan_id_fkey"
            columns: ["route_plan_id"]
            isOneToOne: false
            referencedRelation: "hq_delivery_route_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_delivery_route_stops_stock_transfer_id_fkey"
            columns: ["stock_transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      hq_factory_order_branch_items: {
        Row: {
          assigned_driver_id: string | null
          branch_id: string
          created_at: string
          id: string
          order_id: string
          quantity: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Insert: {
          assigned_driver_id?: string | null
          branch_id: string
          created_at?: string
          id?: string
          order_id: string
          quantity: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Update: {
          assigned_driver_id?: string | null
          branch_id?: string
          created_at?: string
          id?: string
          order_id?: string
          quantity?: number
          stock_item_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "hq_factory_order_branch_items_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_factory_order_branch_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_factory_order_branch_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "hq_factory_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_factory_order_branch_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      hq_factory_order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          quantity: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          quantity: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          quantity?: number
          stock_item_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "hq_factory_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "hq_factory_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_factory_order_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      hq_factory_orders: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          auto_received_at: string | null
          created_at: string
          created_by: string | null
          finalized_at: string | null
          fulfilled_at: string | null
          id: string
          notes: string | null
          order_number: string
          order_phase: string
          organization_id: string
          production_date: string
          routes_planned_at: string | null
          status: string
          stock_receive_id: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          auto_received_at?: string | null
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          fulfilled_at?: string | null
          id?: string
          notes?: string | null
          order_number: string
          order_phase?: string
          organization_id: string
          production_date: string
          routes_planned_at?: string | null
          status?: string
          stock_receive_id?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          auto_received_at?: string | null
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          fulfilled_at?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          order_phase?: string
          organization_id?: string
          production_date?: string
          routes_planned_at?: string | null
          status?: string
          stock_receive_id?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hq_factory_orders_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_factory_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_factory_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "hq_factory_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hq_factory_orders_stock_receive_id_fkey"
            columns: ["stock_receive_id"]
            isOneToOne: false
            referencedRelation: "stock_receives"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_balances: {
        Row: {
          adjustment_days: number
          carried_forward_days: number
          created_at: string
          entitlement_days: number
          id: string
          leave_type: string
          leave_year: number
          legal_entity_id: string | null
          notes: string | null
          organization_id: string
          pending_days: number
          profile_id: string | null
          remaining_days: number | null
          staff_id: string
          updated_at: string
          updated_by: string | null
          used_days: number
        }
        Insert: {
          adjustment_days?: number
          carried_forward_days?: number
          created_at?: string
          entitlement_days?: number
          id?: string
          leave_type: string
          leave_year?: number
          legal_entity_id?: string | null
          notes?: string | null
          organization_id: string
          pending_days?: number
          profile_id?: string | null
          remaining_days?: number | null
          staff_id: string
          updated_at?: string
          updated_by?: string | null
          used_days?: number
        }
        Update: {
          adjustment_days?: number
          carried_forward_days?: number
          created_at?: string
          entitlement_days?: number
          id?: string
          leave_type?: string
          leave_year?: number
          legal_entity_id?: string | null
          notes?: string | null
          organization_id?: string
          pending_days?: number
          profile_id?: string | null
          remaining_days?: number | null
          staff_id?: string
          updated_at?: string
          updated_by?: string | null
          used_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_balances_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_balances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "hr_leave_balances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_balances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_balances_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_balances_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_transactions: {
        Row: {
          balance_after_days: number | null
          created_at: string
          created_by: string | null
          days: number
          hr_service_request_id: string | null
          id: string
          leave_balance_id: string | null
          leave_type: string
          note: string | null
          organization_id: string
          profile_id: string | null
          staff_id: string
          transaction_type: string
        }
        Insert: {
          balance_after_days?: number | null
          created_at?: string
          created_by?: string | null
          days: number
          hr_service_request_id?: string | null
          id?: string
          leave_balance_id?: string | null
          leave_type: string
          note?: string | null
          organization_id: string
          profile_id?: string | null
          staff_id: string
          transaction_type: string
        }
        Update: {
          balance_after_days?: number | null
          created_at?: string
          created_by?: string | null
          days?: number
          hr_service_request_id?: string | null
          id?: string
          leave_balance_id?: string | null
          leave_type?: string
          note?: string | null
          organization_id?: string
          profile_id?: string | null
          staff_id?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_transactions_hr_service_request_id_fkey"
            columns: ["hr_service_request_id"]
            isOneToOne: false
            referencedRelation: "hr_service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_transactions_leave_balance_id_fkey"
            columns: ["leave_balance_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "hr_leave_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_transactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_transactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_service_requests: {
        Row: {
          branch_id: string | null
          created_at: string
          description: string
          end_date: string | null
          id: string
          legal_entity_id: string | null
          metadata: Json
          organization_id: string
          priority: string
          profile_id: string
          request_number: string
          request_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          staff_id: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          description: string
          end_date?: string | null
          id?: string
          legal_entity_id?: string | null
          metadata?: Json
          organization_id: string
          priority?: string
          profile_id: string
          request_number: string
          request_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          staff_id?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          legal_entity_id?: string | null
          metadata?: Json
          organization_id?: string
          priority?: string
          profile_id?: string
          request_number?: string
          request_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          staff_id?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_service_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_service_requests_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_service_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "hr_service_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_service_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_service_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_service_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_balances: {
        Row: {
          id: string
          last_movement_at: string | null
          location_id: string
          organization_id: string
          quantity: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
          updated_at: string
        }
        Insert: {
          id?: string
          last_movement_at?: string | null
          location_id: string
          organization_id: string
          quantity?: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
          updated_at?: string
        }
        Update: {
          id?: string
          last_movement_at?: string | null
          location_id?: string
          organization_id?: string
          quantity?: number
          stock_item_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "inventory_balances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_locations: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_active: boolean
          location_type: Database["public"]["Enums"]["location_type"]
          name: string
          organization_id: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location_type: Database["public"]["Enums"]["location_type"]
          name: string
          organization_id: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location_type?: Database["public"]["Enums"]["location_type"]
          name?: string
          organization_id?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_locations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "inventory_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_locations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_entities: {
        Row: {
          bank_account_name: string | null
          bank_account_no: string | null
          bank_name: string | null
          code: string
          created_at: string
          email: string | null
          id: string
          legal_name: string
          name: string
          office_address: string | null
          organization_id: string
          phone: string | null
          registration_no: string | null
          scope: string | null
          sort_order: number
          status: Database["public"]["Enums"]["entity_status"]
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          bank_account_name?: string | null
          bank_account_no?: string | null
          bank_name?: string | null
          code: string
          created_at?: string
          email?: string | null
          id?: string
          legal_name: string
          name: string
          office_address?: string | null
          organization_id: string
          phone?: string | null
          registration_no?: string | null
          scope?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["entity_status"]
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          bank_account_name?: string | null
          bank_account_no?: string | null
          bank_name?: string | null
          code?: string
          created_at?: string
          email?: string | null
          id?: string
          legal_name?: string
          name?: string
          office_address?: string | null
          organization_id?: string
          phone?: string | null
          registration_no?: string | null
          scope?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["entity_status"]
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_entities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "legal_entities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_entity_documents: {
        Row: {
          branch_name: string | null
          created_at: string
          document_type: string
          expiry_date: string | null
          file_name: string
          file_size: number | null
          folder_path: string | null
          id: string
          issue_date: string | null
          legal_entity_id: string
          metadata: Json
          mime_type: string | null
          notes: string | null
          organization_id: string
          source_path: string | null
          status: string
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          branch_name?: string | null
          created_at?: string
          document_type?: string
          expiry_date?: string | null
          file_name: string
          file_size?: number | null
          folder_path?: string | null
          id?: string
          issue_date?: string | null
          legal_entity_id: string
          metadata?: Json
          mime_type?: string | null
          notes?: string | null
          organization_id: string
          source_path?: string | null
          status?: string
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          branch_name?: string | null
          created_at?: string
          document_type?: string
          expiry_date?: string | null
          file_name?: string
          file_size?: number | null
          folder_path?: string | null
          id?: string
          issue_date?: string | null
          legal_entity_id?: string
          metadata?: Json
          mime_type?: string | null
          notes?: string | null
          organization_id?: string
          source_path?: string | null
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_entity_documents_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_entity_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "legal_entity_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_reports: {
        Row: {
          assigned_to: string | null
          branch_id: string | null
          category: string
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          description: string
          id: string
          manager_notes: string | null
          organization_id: string
          preferred_visit_date: string | null
          priority: string
          report_number: string
          report_type: string
          reported_by: string | null
          resolved_at: string | null
          status: string
          substitute_required: boolean
          substitute_status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          branch_id?: string | null
          category?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          description: string
          id?: string
          manager_notes?: string | null
          organization_id: string
          preferred_visit_date?: string | null
          priority?: string
          report_number: string
          report_type?: string
          reported_by?: string | null
          resolved_at?: string | null
          status?: string
          substitute_required?: boolean
          substitute_status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          branch_id?: string | null
          category?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string
          id?: string
          manager_notes?: string | null
          organization_id?: string
          preferred_visit_date?: string | null
          priority?: string
          report_number?: string
          report_type?: string
          reported_by?: string | null
          resolved_at?: string | null
          status?: string
          substitute_required?: boolean
          substitute_status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_reports_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_reports_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "maintenance_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      malaysia_holidays: {
        Row: {
          demand_multiplier: number
          holiday_date: string
          holiday_type: Database["public"]["Enums"]["malaysia_holiday_type"]
          id: string
          name: string
          notes: string | null
          region_code: Database["public"]["Enums"]["region_code"] | null
        }
        Insert: {
          demand_multiplier?: number
          holiday_date: string
          holiday_type: Database["public"]["Enums"]["malaysia_holiday_type"]
          id?: string
          name: string
          notes?: string | null
          region_code?: Database["public"]["Enums"]["region_code"] | null
        }
        Update: {
          demand_multiplier?: number
          holiday_date?: string
          holiday_type?: Database["public"]["Enums"]["malaysia_holiday_type"]
          id?: string
          name?: string
          notes?: string | null
          region_code?: Database["public"]["Enums"]["region_code"] | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          link: string | null
          message: string
          organization_id: string
          read_at: string | null
          recipient_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          organization_id: string
          read_at?: string | null
          recipient_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          organization_id?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_sync_queue: {
        Row: {
          attempts: number
          branch_id: string
          created_at: string
          device_id: string
          error_message: string | null
          id: string
          organization_id: string
          payload: Json
          payload_type: string
          status: string
          synced_at: string | null
        }
        Insert: {
          attempts?: number
          branch_id: string
          created_at?: string
          device_id: string
          error_message?: string | null
          id?: string
          organization_id: string
          payload: Json
          payload_type: string
          status?: string
          synced_at?: string | null
        }
        Update: {
          attempts?: number
          branch_id?: string
          created_at?: string
          device_id?: string
          error_message?: string | null
          id?: string
          organization_id?: string
          payload?: Json
          payload_type?: string
          status?: string
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offline_sync_queue_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_sync_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "offline_sync_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_stock_planning_settings: {
        Row: {
          organization_id: string
          safety_buffer_pcs: number
          stock_coverage_days: number
          updated_at: string
        }
        Insert: {
          organization_id: string
          safety_buffer_pcs?: number
          stock_coverage_days?: number
          updated_at?: string
        }
        Update: {
          organization_id?: string
          safety_buffer_pcs?: number
          stock_coverage_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_stock_planning_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "org_stock_planning_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          code: string
          created_at: string
          hq_address: string | null
          hq_city: string | null
          id: string
          name: string
          settings: Json
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          hq_address?: string | null
          hq_city?: string | null
          id?: string
          name: string
          settings?: Json
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          hq_address?: string | null
          hq_city?: string | null
          id?: string
          name?: string
          settings?: Json
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: []
      }
      payroll_line_items: {
        Row: {
          attendance_allowance: number
          basic_salary: number
          commission: number
          contract_bonus: number
          created_at: string
          eis: number
          epf: number
          gross_pay: number
          hours_worked: number | null
          id: string
          kiosk_deduction: number
          kiosk_excess_minutes: number
          net_pay: number
          notes: string | null
          ot_hours: number | null
          ot_pay: number
          payroll_run_id: string
          sales_total: number | null
          shift_pay: number
          socso: number
          staff_id: string
          worker_type: Database["public"]["Enums"]["worker_type"]
        }
        Insert: {
          attendance_allowance?: number
          basic_salary?: number
          commission?: number
          contract_bonus?: number
          created_at?: string
          eis?: number
          epf?: number
          gross_pay?: number
          hours_worked?: number | null
          id?: string
          kiosk_deduction?: number
          kiosk_excess_minutes?: number
          net_pay?: number
          notes?: string | null
          ot_hours?: number | null
          ot_pay?: number
          payroll_run_id: string
          sales_total?: number | null
          shift_pay?: number
          socso?: number
          staff_id: string
          worker_type: Database["public"]["Enums"]["worker_type"]
        }
        Update: {
          attendance_allowance?: number
          basic_salary?: number
          commission?: number
          contract_bonus?: number
          created_at?: string
          eis?: number
          epf?: number
          gross_pay?: number
          hours_worked?: number | null
          id?: string
          kiosk_deduction?: number
          kiosk_excess_minutes?: number
          net_pay?: number
          notes?: string | null
          ot_hours?: number | null
          ot_pay?: number
          payroll_run_id?: string
          sales_total?: number | null
          shift_pay?: number
          socso?: number
          staff_id?: string
          worker_type?: Database["public"]["Enums"]["worker_type"]
        }
        Relationships: [
          {
            foreignKeyName: "payroll_line_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_line_items_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_rules: {
        Row: {
          component: string
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          period: Database["public"]["Enums"]["payroll_period"]
          rate: number | null
          rule_code: string
          shift_hours: number | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
          worker_type: Database["public"]["Enums"]["worker_type"]
        }
        Insert: {
          component: string
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          period: Database["public"]["Enums"]["payroll_period"]
          rate?: number | null
          rule_code: string
          shift_hours?: number | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          worker_type: Database["public"]["Enums"]["worker_type"]
        }
        Update: {
          component?: string
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          period?: Database["public"]["Enums"]["payroll_period"]
          rate?: number | null
          rule_code?: string
          shift_hours?: number | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          worker_type?: Database["public"]["Enums"]["worker_type"]
        }
        Relationships: [
          {
            foreignKeyName: "payroll_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "payroll_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_by: string | null
          created_at: string
          id: string
          legal_entity_id: string | null
          organization_id: string
          period_end: string
          period_start: string
          processed_by: string | null
          report_type: string
          run_number: string
          status: Database["public"]["Enums"]["approval_status"]
          total_deductions: number
          total_gross: number
          total_net: number
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          id?: string
          legal_entity_id?: string | null
          organization_id: string
          period_end: string
          period_start: string
          processed_by?: string | null
          report_type?: string
          run_number: string
          status?: Database["public"]["Enums"]["approval_status"]
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          id?: string
          legal_entity_id?: string | null
          organization_id?: string
          period_end?: string
          period_start?: string
          processed_by?: string | null
          report_type?: string
          run_number?: string
          status?: Database["public"]["Enums"]["approval_status"]
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "payroll_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_web_vitals: {
        Row: {
          connection_type: string | null
          created_at: string
          device_memory: number | null
          id: string
          metric_delta: number | null
          metric_name: string
          metric_rating: string | null
          metric_value: number
          navigation_type: string | null
          organization_id: string
          profile_id: string
          route: string
          user_agent: string | null
        }
        Insert: {
          connection_type?: string | null
          created_at?: string
          device_memory?: number | null
          id?: string
          metric_delta?: number | null
          metric_name: string
          metric_rating?: string | null
          metric_value: number
          navigation_type?: string | null
          organization_id: string
          profile_id: string
          route: string
          user_agent?: string | null
        }
        Update: {
          connection_type?: string | null
          created_at?: string
          device_memory?: number | null
          id?: string
          metric_delta?: number | null
          metric_name?: string
          metric_rating?: string | null
          metric_value?: number
          navigation_type?: string | null
          organization_id?: string
          profile_id?: string
          route?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_web_vitals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "performance_web_vitals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_web_vitals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_branch_supply_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          created_at: string
          id: string
          items: Json
          location_id: string
          needed_by: string | null
          notes: string | null
          organization_id: string
          priority: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          request_type: string
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          created_at?: string
          id?: string
          items?: Json
          location_id: string
          needed_by?: string | null
          notes?: string | null
          organization_id: string
          priority?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          request_type?: string
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          id?: string
          items?: Json
          location_id?: string
          needed_by?: string | null
          notes?: string | null
          organization_id?: string
          priority?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          request_type?: string
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_branch_supply_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_branch_supply_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_branch_supply_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_branch_supply_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "pos_branch_supply_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_branch_supply_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_branch_supply_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_daily_summaries: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          organization_id: string
          refund_count: number
          shift_count: number
          summary_date: string
          total_cash: number
          total_qr: number
          total_sales: number
          transaction_count: number
          updated_at: string
          void_count: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          organization_id: string
          refund_count?: number
          shift_count?: number
          summary_date: string
          total_cash?: number
          total_qr?: number
          total_sales?: number
          transaction_count?: number
          updated_at?: string
          void_count?: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          refund_count?: number
          shift_count?: number
          summary_date?: string
          total_cash?: number
          total_qr?: number
          total_sales?: number
          transaction_count?: number
          updated_at?: string
          void_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_daily_summaries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_daily_summaries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "pos_daily_summaries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_devices: {
        Row: {
          asset_verified_at: string | null
          asset_verified_by: string | null
          branch_id: string
          created_at: string
          created_by: string | null
          device_code: string
          device_name: string
          enrolled_at: string | null
          enrolled_by: string | null
          enrollment_code_hash: string | null
          enrollment_expires_at: string | null
          enrollment_used_at: string | null
          id: string
          imei: string | null
          last_seen_at: string | null
          metadata: Json
          organization_id: string
          purchase_date: string | null
          revoked_at: string | null
          revoked_by: string | null
          secret_hash: string | null
          serial_number: string | null
          status: string
          updated_at: string
          warranty_expires_at: string | null
        }
        Insert: {
          asset_verified_at?: string | null
          asset_verified_by?: string | null
          branch_id: string
          created_at?: string
          created_by?: string | null
          device_code: string
          device_name: string
          enrolled_at?: string | null
          enrolled_by?: string | null
          enrollment_code_hash?: string | null
          enrollment_expires_at?: string | null
          enrollment_used_at?: string | null
          id?: string
          imei?: string | null
          last_seen_at?: string | null
          metadata?: Json
          organization_id: string
          purchase_date?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          secret_hash?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          warranty_expires_at?: string | null
        }
        Update: {
          asset_verified_at?: string | null
          asset_verified_by?: string | null
          branch_id?: string
          created_at?: string
          created_by?: string | null
          device_code?: string
          device_name?: string
          enrolled_at?: string | null
          enrolled_by?: string | null
          enrollment_code_hash?: string | null
          enrollment_expires_at?: string | null
          enrollment_used_at?: string | null
          id?: string
          imei?: string | null
          last_seen_at?: string | null
          metadata?: Json
          organization_id?: string
          purchase_date?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          secret_hash?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          warranty_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_devices_asset_verified_by_fkey"
            columns: ["asset_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_devices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_devices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_devices_enrolled_by_fkey"
            columns: ["enrolled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_devices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "pos_devices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_devices_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_online_payments: {
        Row: {
          amount_rm: number
          branch_id: string
          checkout_url: string | null
          created_at: string
          created_by: string | null
          failed_at: string | null
          gateway_ref: string | null
          id: string
          organization_id: string
          paid_at: string | null
          provider: string
          sale_payload: Json
          shift_id: string
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_rm: number
          branch_id: string
          checkout_url?: string | null
          created_at?: string
          created_by?: string | null
          failed_at?: string | null
          gateway_ref?: string | null
          id?: string
          organization_id: string
          paid_at?: string | null
          provider?: string
          sale_payload: Json
          shift_id: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_rm?: number
          branch_id?: string
          checkout_url?: string | null
          created_at?: string
          created_by?: string | null
          failed_at?: string | null
          gateway_ref?: string | null
          id?: string
          organization_id?: string
          paid_at?: string | null
          provider?: string
          sale_payload?: Json
          shift_id?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_online_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_online_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_online_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "pos_online_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_online_payments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_online_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference: string | null
          transaction_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          transaction_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_receipts: {
        Row: {
          created_at: string
          id: string
          pdf_url: string | null
          receipt_data: Json
          receipt_number: string
          sent_to: string | null
          sent_via: string | null
          transaction_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pdf_url?: string | null
          receipt_data: Json
          receipt_number: string
          sent_to?: string | null
          sent_via?: string | null
          transaction_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pdf_url?: string | null
          receipt_data?: Json
          receipt_number?: string
          sent_to?: string | null
          sent_via?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_receipts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_shift_staff_members: {
        Row: {
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          created_at: string
          ended_at: string | null
          ended_by: string | null
          full_name: string
          id: string
          notes: string | null
          organization_id: string
          profile_id: string | null
          role_in_shift: string
          shift_id: string
          staff_id: string | null
          started_at: string
          started_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          created_at?: string
          ended_at?: string | null
          ended_by?: string | null
          full_name: string
          id?: string
          notes?: string | null
          organization_id: string
          profile_id?: string | null
          role_in_shift?: string
          shift_id: string
          staff_id?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          ended_at?: string | null
          ended_by?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          organization_id?: string
          profile_id?: string | null
          role_in_shift?: string
          shift_id?: string
          staff_id?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_shift_staff_members_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_staff_members_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_staff_members_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_staff_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "pos_shift_staff_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_staff_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_staff_members_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_staff_members_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_staff_members_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_shift_stock_check_logs: {
        Row: {
          branch_id: string
          check_type: string
          completed_at: string
          completed_by: string
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          production_date: string
          shift_id: string
          stock_count_id: string | null
        }
        Insert: {
          branch_id: string
          check_type: string
          completed_at?: string
          completed_by: string
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          production_date: string
          shift_id: string
          stock_count_id?: string | null
        }
        Update: {
          branch_id?: string
          check_type?: string
          completed_at?: string
          completed_by?: string
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          production_date?: string
          shift_id?: string
          stock_count_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_shift_stock_check_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_stock_check_logs_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_stock_check_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "pos_shift_stock_check_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_stock_check_logs_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shift_stock_check_logs_stock_count_id_fkey"
            columns: ["stock_count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_shifts: {
        Row: {
          actual_work_ended_at: string | null
          branch_id: string
          business_started_at: string | null
          cash_variance: number | null
          closed_at: string | null
          closed_by: string | null
          closing_cash: number | null
          created_at: string
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          organization_id: string
          payroll_started_at: string | null
          shift_number: string
          staff_id: string | null
          status: Database["public"]["Enums"]["pos_shift_status"]
          total_cash: number
          total_qr: number
          total_sales: number
          transaction_count: number
          updated_at: string
        }
        Insert: {
          actual_work_ended_at?: string | null
          branch_id: string
          business_started_at?: string | null
          cash_variance?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_cash?: number
          organization_id: string
          payroll_started_at?: string | null
          shift_number: string
          staff_id?: string | null
          status?: Database["public"]["Enums"]["pos_shift_status"]
          total_cash?: number
          total_qr?: number
          total_sales?: number
          transaction_count?: number
          updated_at?: string
        }
        Update: {
          actual_work_ended_at?: string | null
          branch_id?: string
          business_started_at?: string | null
          cash_variance?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash?: number
          organization_id?: string
          payroll_started_at?: string | null
          shift_number?: string
          staff_id?: string | null
          status?: Database["public"]["Enums"]["pos_shift_status"]
          total_cash?: number
          total_qr?: number
          total_sales?: number
          transaction_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "pos_shifts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_staff_presence_checks: {
        Row: {
          branch_id: string
          check_type: string
          confirmed_at: string | null
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          prompt_reason: string | null
          prompted_at: string
          response_seconds: number | null
          shift_id: string | null
          staff_id: string | null
          staff_profile_id: string
          status: string
        }
        Insert: {
          branch_id: string
          check_type?: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          prompt_reason?: string | null
          prompted_at?: string
          response_seconds?: number | null
          shift_id?: string | null
          staff_id?: string | null
          staff_profile_id: string
          status?: string
        }
        Update: {
          branch_id?: string
          check_type?: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          prompt_reason?: string | null
          prompted_at?: string
          response_seconds?: number | null
          shift_id?: string | null
          staff_id?: string | null
          staff_profile_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_staff_presence_checks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_staff_presence_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "pos_staff_presence_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_staff_presence_checks_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_staff_presence_checks_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_staff_presence_checks_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_staff_presence_logs: {
        Row: {
          branch_id: string
          created_at: string
          duration_minutes: number | null
          excess_minutes: number
          id: string
          left_at: string
          notes: string | null
          organization_id: string
          payroll_deductible: boolean
          reason: string
          returned_at: string | null
          shift_id: string | null
          staff_id: string | null
          staff_profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          duration_minutes?: number | null
          excess_minutes?: number
          id?: string
          left_at?: string
          notes?: string | null
          organization_id: string
          payroll_deductible?: boolean
          reason: string
          returned_at?: string | null
          shift_id?: string | null
          staff_id?: string | null
          staff_profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          duration_minutes?: number | null
          excess_minutes?: number
          id?: string
          left_at?: string
          notes?: string | null
          organization_id?: string
          payroll_deductible?: boolean
          reason?: string
          returned_at?: string | null
          shift_id?: string | null
          staff_id?: string | null
          staff_profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_staff_presence_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_staff_presence_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "pos_staff_presence_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_staff_presence_logs_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_staff_presence_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_staff_presence_logs_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_stock_deductions: {
        Row: {
          created_at: string
          id: string
          location_id: string
          movement_id: string | null
          quantity: number
          stock_item_id: string
          transaction_id: string
          transaction_item_id: string | null
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          movement_id?: string | null
          quantity: number
          stock_item_id: string
          transaction_id: string
          transaction_item_id?: string | null
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          movement_id?: string | null
          quantity?: number
          stock_item_id?: string
          transaction_id?: string
          transaction_item_id?: string | null
          unit?: Database["public"]["Enums"]["stock_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "pos_stock_deductions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_deductions_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_deductions_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_deductions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_deductions_transaction_item_id_fkey"
            columns: ["transaction_item_id"]
            isOneToOne: false
            referencedRelation: "pos_transaction_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_stock_receipt_items: {
        Row: {
          actual_quantity: number | null
          created_at: string
          expected_quantity: number
          id: string
          production_date: string | null
          receipt_id: string
          staff_note: string | null
          stock_item_id: string
          stock_transfer_item_id: string | null
          unit: Database["public"]["Enums"]["stock_unit"]
          variance_quantity: number | null
        }
        Insert: {
          actual_quantity?: number | null
          created_at?: string
          expected_quantity?: number
          id?: string
          production_date?: string | null
          receipt_id: string
          staff_note?: string | null
          stock_item_id: string
          stock_transfer_item_id?: string | null
          unit: Database["public"]["Enums"]["stock_unit"]
          variance_quantity?: number | null
        }
        Update: {
          actual_quantity?: number | null
          created_at?: string
          expected_quantity?: number
          id?: string
          production_date?: string | null
          receipt_id?: string
          staff_note?: string | null
          stock_item_id?: string
          stock_transfer_item_id?: string | null
          unit?: Database["public"]["Enums"]["stock_unit"]
          variance_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_stock_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "pos_stock_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_receipt_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_receipt_items_stock_transfer_item_id_fkey"
            columns: ["stock_transfer_item_id"]
            isOneToOne: false
            referencedRelation: "stock_transfer_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_stock_receipts: {
        Row: {
          branch_id: string
          created_at: string
          delivered_at: string | null
          delivered_by: string | null
          driver_id: string | null
          driver_notes: string | null
          id: string
          location_id: string
          manager_approved_at: string | null
          manager_approved_by: string | null
          manager_notes: string | null
          metadata: Json
          organization_id: string
          receiver_name: string | null
          route_stop_id: string | null
          staff_confirmed_at: string | null
          staff_confirmed_by: string | null
          staff_notes: string | null
          status: string
          stock_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          driver_id?: string | null
          driver_notes?: string | null
          id?: string
          location_id: string
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          manager_notes?: string | null
          metadata?: Json
          organization_id: string
          receiver_name?: string | null
          route_stop_id?: string | null
          staff_confirmed_at?: string | null
          staff_confirmed_by?: string | null
          staff_notes?: string | null
          status?: string
          stock_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          driver_id?: string | null
          driver_notes?: string | null
          id?: string
          location_id?: string
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          manager_notes?: string | null
          metadata?: Json
          organization_id?: string
          receiver_name?: string | null
          route_stop_id?: string | null
          staff_confirmed_at?: string | null
          staff_confirmed_by?: string | null
          staff_notes?: string | null
          status?: string
          stock_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_stock_receipts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_receipts_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_receipts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_receipts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_receipts_manager_approved_by_fkey"
            columns: ["manager_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "pos_stock_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_receipts_route_stop_id_fkey"
            columns: ["route_stop_id"]
            isOneToOne: false
            referencedRelation: "hq_delivery_route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_receipts_staff_confirmed_by_fkey"
            columns: ["staff_confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_stock_receipts_stock_transfer_id_fkey"
            columns: ["stock_transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_transaction_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          product_id: string
          product_name: string
          quantity: number
          sku: string
          transaction_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          product_id: string
          product_name: string
          quantity?: number
          sku: string
          transaction_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string
          product_name?: string
          quantity?: number
          sku?: string
          transaction_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_transaction_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_transactions: {
        Row: {
          branch_id: string
          cash_amount: number
          change_amount: number
          created_at: string
          created_by: string
          discount: number
          id: string
          offline_id: string | null
          organization_id: string
          original_transaction_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          qr_amount: number
          receipt_email: string | null
          receipt_phone: string | null
          receipt_sent: boolean
          refund_reason: string | null
          refunded_at: string | null
          refunded_by: string | null
          shift_id: string
          status: Database["public"]["Enums"]["pos_tx_status"]
          subtotal: number
          synced_at: string | null
          total: number
          transaction_number: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          branch_id: string
          cash_amount?: number
          change_amount?: number
          created_at?: string
          created_by: string
          discount?: number
          id?: string
          offline_id?: string | null
          organization_id: string
          original_transaction_id?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          qr_amount?: number
          receipt_email?: string | null
          receipt_phone?: string | null
          receipt_sent?: boolean
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          shift_id: string
          status?: Database["public"]["Enums"]["pos_tx_status"]
          subtotal?: number
          synced_at?: string | null
          total?: number
          transaction_number: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          branch_id?: string
          cash_amount?: number
          change_amount?: number
          created_at?: string
          created_by?: string
          discount?: number
          id?: string
          offline_id?: string | null
          organization_id?: string
          original_transaction_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          qr_amount?: number
          receipt_email?: string | null
          receipt_phone?: string | null
          receipt_sent?: boolean
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          shift_id?: string
          status?: Database["public"]["Enums"]["pos_tx_status"]
          subtotal?: number
          synced_at?: string | null
          total?: number
          transaction_number?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "pos_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transactions_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transactions_refunded_by_fkey"
            columns: ["refunded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transactions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transactions_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_bom: {
        Row: {
          auto_deduct: boolean
          created_at: string
          id: string
          max_qty: number | null
          min_qty: number | null
          notes: string | null
          organization_id: string
          product_id: string
          quantity: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
          updated_at: string
        }
        Insert: {
          auto_deduct?: boolean
          created_at?: string
          id?: string
          max_qty?: number | null
          min_qty?: number | null
          notes?: string | null
          organization_id: string
          product_id: string
          quantity: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
          updated_at?: string
        }
        Update: {
          auto_deduct?: boolean
          created_at?: string
          id?: string
          max_qty?: number | null
          min_qty?: number | null
          notes?: string | null
          organization_id?: string
          product_id?: string
          quantity?: number
          stock_item_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_bom_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "product_bom_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bom_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bom_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      production_output: {
        Row: {
          created_at: string
          id: string
          location_id: string
          notes: string | null
          organization_id: string
          output_date: string
          product_id: string | null
          quantity: number
          recorded_by: string | null
          stock_item_id: string | null
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          notes?: string | null
          organization_id: string
          output_date?: string
          product_id?: string | null
          quantity: number
          recorded_by?: string | null
          stock_item_id?: string | null
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          notes?: string | null
          organization_id?: string
          output_date?: string
          product_id?: string | null
          quantity?: number
          recorded_by?: string | null
          stock_item_id?: string | null
          unit?: Database["public"]["Enums"]["stock_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "production_output_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_output_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "production_output_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_output_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_output_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_output_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          organization_id: string
          price: number
          sale_unit: string | null
          sku: string
          sort_order: number
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          price?: number
          sale_unit?: string | null
          sku: string
          sort_order?: number
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          price?: number
          sale_unit?: string | null
          sku?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_branch_access: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_branch_access_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_branch_access_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          avatar_url: string | null
          branch_id: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          employee_code: string | null
          full_name: string
          gender: string | null
          ic_number: string | null
          id: string
          last_login_at: string | null
          legal_entity_id: string | null
          metadata: Json
          must_change_password: boolean
          nationality: string | null
          organization_id: string
          phone: string | null
          postcode: string | null
          profile_completed_at: string | null
          region_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          state: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_code?: string | null
          full_name: string
          gender?: string | null
          ic_number?: string | null
          id: string
          last_login_at?: string | null
          legal_entity_id?: string | null
          metadata?: Json
          must_change_password?: boolean
          nationality?: string | null
          organization_id: string
          phone?: string | null
          postcode?: string | null
          profile_completed_at?: string | null
          region_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          avatar_url?: string | null
          branch_id?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_code?: string | null
          full_name?: string
          gender?: string | null
          ic_number?: string | null
          id?: string
          last_login_at?: string | null
          legal_entity_id?: string | null
          metadata?: Json
          must_change_password?: boolean
          nationality?: string | null
          organization_id?: string
          phone?: string | null
          postcode?: string | null
          profile_completed_at?: string | null
          region_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      proof_of_delivery: {
        Row: {
          created_at: string
          created_by: string | null
          delivered_at: string
          delivery_leg_id: string
          distance_from_destination_m: number | null
          driver_id: string | null
          driver_notes: string | null
          geofence_id: string | null
          gps_latitude: number | null
          gps_longitude: number | null
          gps_verification_status: string
          id: string
          organization_id: string
          receiver_name: string | null
          receiver_signature_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivered_at?: string
          delivery_leg_id: string
          distance_from_destination_m?: number | null
          driver_id?: string | null
          driver_notes?: string | null
          geofence_id?: string | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          gps_verification_status?: string
          id?: string
          organization_id: string
          receiver_name?: string | null
          receiver_signature_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivered_at?: string
          delivery_leg_id?: string
          distance_from_destination_m?: number | null
          driver_id?: string | null
          driver_notes?: string | null
          geofence_id?: string | null
          gps_latitude?: number | null
          gps_longitude?: number | null
          gps_verification_status?: string
          id?: string
          organization_id?: string
          receiver_name?: string | null
          receiver_signature_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proof_of_delivery_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_of_delivery_delivery_leg_id_fkey"
            columns: ["delivery_leg_id"]
            isOneToOne: false
            referencedRelation: "delivery_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_of_delivery_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_of_delivery_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "fleet_geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_of_delivery_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "proof_of_delivery_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          code: Database["public"]["Enums"]["region_code"]
          created_at: string
          id: string
          manager_name: string | null
          manager_profile_id: string | null
          name: string
          organization_id: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          code: Database["public"]["Enums"]["region_code"]
          created_at?: string
          id?: string
          manager_name?: string | null
          manager_profile_id?: string | null
          name: string
          organization_id: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          code?: Database["public"]["Enums"]["region_code"]
          created_at?: string
          id?: string
          manager_name?: string | null
          manager_profile_id?: string | null
          name?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_regions_manager"
            columns: ["manager_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "regions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          module: string
          organization_id: string
          permission: Database["public"]["Enums"]["permission_level"]
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          module: string
          organization_id: string
          permission?: Database["public"]["Enums"]["permission_level"]
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          module?: string
          organization_id?: string
          permission?: Database["public"]["Enums"]["permission_level"]
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "role_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_agent_accounts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          assigned_driver_name: string | null
          assigned_price_group_id: string | null
          business_address: string | null
          company_name: string
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          id: string
          legal_entity_id: string
          notes: string | null
          organization_id: string
          pickup_location: string | null
          profile_id: string
          registration_no: string | null
          source_reference: string | null
          status: Database["public"]["Enums"]["agent_account_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_driver_name?: string | null
          assigned_price_group_id?: string | null
          business_address?: string | null
          company_name: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          legal_entity_id: string
          notes?: string | null
          organization_id: string
          pickup_location?: string | null
          profile_id: string
          registration_no?: string | null
          source_reference?: string | null
          status?: Database["public"]["Enums"]["agent_account_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assigned_driver_name?: string | null
          assigned_price_group_id?: string | null
          business_address?: string | null
          company_name?: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          legal_entity_id?: string
          notes?: string | null
          organization_id?: string
          pickup_location?: string | null
          profile_id?: string
          registration_no?: string | null
          source_reference?: string | null
          status?: Database["public"]["Enums"]["agent_account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_agent_accounts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_agent_accounts_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_agent_accounts_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_agent_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "sales_agent_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_agent_accounts_price_group_fkey"
            columns: ["assigned_price_group_id"]
            isOneToOne: false
            referencedRelation: "agent_price_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_agent_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_templates: {
        Row: {
          created_at: string
          crosses_midnight: boolean
          default_hours: number | null
          end_time: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          start_time: string | null
          status: Database["public"]["Enums"]["entity_status"]
          template_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          crosses_midnight?: boolean
          default_hours?: number | null
          end_time?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          template_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          crosses_midnight?: boolean
          default_hours?: number | null
          end_time?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          template_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "shift_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          account_holder: string | null
          account_number: string | null
          bank_name: string | null
          branch_id: string | null
          created_at: string
          full_name: string
          id: string
          legal_entity_id: string | null
          monthly_amount: number | null
          on_hold: boolean
          organization_id: string
          profile_id: string | null
          region_id: string | null
          remarks: string | null
          shift_hours: number | null
          shifts_per_week: number | null
          staff_code: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
          weekly_amount: number | null
          worker_type: Database["public"]["Enums"]["worker_type"] | null
        }
        Insert: {
          account_holder?: string | null
          account_number?: string | null
          bank_name?: string | null
          branch_id?: string | null
          created_at?: string
          full_name: string
          id?: string
          legal_entity_id?: string | null
          monthly_amount?: number | null
          on_hold?: boolean
          organization_id: string
          profile_id?: string | null
          region_id?: string | null
          remarks?: string | null
          shift_hours?: number | null
          shifts_per_week?: number | null
          staff_code: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          weekly_amount?: number | null
          worker_type?: Database["public"]["Enums"]["worker_type"] | null
        }
        Update: {
          account_holder?: string | null
          account_number?: string | null
          bank_name?: string | null
          branch_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          legal_entity_id?: string | null
          monthly_amount?: number | null
          on_hold?: boolean
          organization_id?: string
          profile_id?: string | null
          region_id?: string | null
          remarks?: string | null
          shift_hours?: number | null
          shifts_per_week?: number | null
          staff_code?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          weekly_amount?: number | null
          worker_type?: Database["public"]["Enums"]["worker_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "staff_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_payslips: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          gross_pay: number | null
          id: string
          legal_entity_id: string | null
          mime_type: string | null
          net_pay: number | null
          notes: string | null
          organization_id: string
          payroll_line_item_id: string | null
          payroll_run_id: string | null
          period_end: string | null
          period_label: string
          period_start: string | null
          profile_id: string
          published_by: string | null
          source: string
          staff_id: string | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          gross_pay?: number | null
          id?: string
          legal_entity_id?: string | null
          mime_type?: string | null
          net_pay?: number | null
          notes?: string | null
          organization_id: string
          payroll_line_item_id?: string | null
          payroll_run_id?: string | null
          period_end?: string | null
          period_label: string
          period_start?: string | null
          profile_id: string
          published_by?: string | null
          source?: string
          staff_id?: string | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          gross_pay?: number | null
          id?: string
          legal_entity_id?: string | null
          mime_type?: string | null
          net_pay?: number | null
          notes?: string | null
          organization_id?: string
          payroll_line_item_id?: string | null
          payroll_run_id?: string | null
          period_end?: string | null
          period_label?: string
          period_start?: string | null
          profile_id?: string
          published_by?: string | null
          source?: string
          staff_id?: string | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_payslips_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "legal_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payslips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "staff_payslips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payslips_payroll_line_item_id_fkey"
            columns: ["payroll_line_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payslips_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payslips_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payslips_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payslips_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payslips_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_portal_credentials: {
        Row: {
          created_at: string
          login_email: string
          organization_id: string
          portal_password: string
          staff_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          login_email: string
          organization_id: string
          portal_password: string
          staff_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          login_email?: string
          organization_id?: string
          portal_password?: string
          staff_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_portal_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "staff_portal_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_portal_credentials_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_portal_credentials_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          actual_end: string | null
          actual_hours: number | null
          actual_start: string | null
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          ot_hours: number
          scheduled_end: string | null
          scheduled_hours: number | null
          scheduled_start: string | null
          shift_date: string
          staff_id: string
          status: Database["public"]["Enums"]["approval_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_hours?: number | null
          actual_start?: string | null
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          ot_hours?: number
          scheduled_end?: string | null
          scheduled_hours?: number | null
          scheduled_start?: string | null
          shift_date: string
          staff_id: string
          status?: Database["public"]["Enums"]["approval_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_hours?: number | null
          actual_start?: string | null
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          ot_hours?: number
          scheduled_end?: string | null
          scheduled_hours?: number | null
          scheduled_start?: string | null
          shift_date?: string
          staff_id?: string
          status?: Database["public"]["Enums"]["approval_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_shifts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "staff_shifts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shift_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustment_items: {
        Row: {
          adjustment_id: string
          id: string
          notes: string | null
          quantity_after: number
          quantity_before: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Insert: {
          adjustment_id: string
          id?: string
          notes?: string | null
          quantity_after: number
          quantity_before: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Update: {
          adjustment_id?: string
          id?: string
          notes?: string | null
          quantity_after?: number
          quantity_before?: number
          stock_item_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustment_items_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "stock_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjustment_number: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          organization_id: string
          reason: string
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
        }
        Insert: {
          adjustment_number: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          organization_id: string
          reason: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Update: {
          adjustment_number?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          organization_id?: string
          reason?: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "stock_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_batches: {
        Row: {
          created_at: string
          expires_on: string
          id: string
          inbound_movement_id: string | null
          location_id: string
          organization_id: string
          production_date: string
          quantity_remaining: number
          status: string
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_on: string
          id?: string
          inbound_movement_id?: string | null
          location_id: string
          organization_id: string
          production_date: string
          quantity_remaining?: number
          status?: string
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_on?: string
          id?: string
          inbound_movement_id?: string | null
          location_id?: string
          organization_id?: string
          production_date?: string
          quantity_remaining?: number
          status?: string
          stock_item_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_batches_inbound_movement_id_fkey"
            columns: ["inbound_movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "stock_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_items: {
        Row: {
          count_id: string
          counted_quantity: number
          id: string
          notes: string | null
          production_date: string | null
          stock_item_id: string
          system_quantity: number
          unit: Database["public"]["Enums"]["stock_unit"]
          variance: number | null
        }
        Insert: {
          count_id: string
          counted_quantity: number
          id?: string
          notes?: string | null
          production_date?: string | null
          stock_item_id: string
          system_quantity: number
          unit: Database["public"]["Enums"]["stock_unit"]
          variance?: number | null
        }
        Update: {
          count_id?: string
          counted_quantity?: number
          id?: string
          notes?: string | null
          production_date?: string | null
          stock_item_id?: string
          system_quantity?: number
          unit?: Database["public"]["Enums"]["stock_unit"]
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_counts: {
        Row: {
          approved_by: string | null
          count_date: string
          count_number: string
          counted_by: string | null
          created_at: string
          id: string
          location_id: string
          notes: string | null
          organization_id: string
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          count_date?: string
          count_number: string
          counted_by?: string | null
          created_at?: string
          id?: string
          location_id: string
          notes?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          count_date?: string
          count_number?: string
          counted_by?: string | null
          created_at?: string
          id?: string
          location_id?: string
          notes?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_counts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_counts_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_counts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_counts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "stock_counts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          base_unit: Database["public"]["Enums"]["stock_unit"]
          category: string | null
          conversion_text: string | null
          created_at: string
          critical_threshold: number | null
          id: string
          item_code: string
          min_threshold: number | null
          name: string
          notes: string | null
          organization_id: string
          pack_quantity: number | null
          pack_unit: Database["public"]["Enums"]["stock_unit"] | null
          status: Database["public"]["Enums"]["entity_status"]
          storage_unit: string | null
          updated_at: string
        }
        Insert: {
          base_unit?: Database["public"]["Enums"]["stock_unit"]
          category?: string | null
          conversion_text?: string | null
          created_at?: string
          critical_threshold?: number | null
          id?: string
          item_code: string
          min_threshold?: number | null
          name: string
          notes?: string | null
          organization_id: string
          pack_quantity?: number | null
          pack_unit?: Database["public"]["Enums"]["stock_unit"] | null
          status?: Database["public"]["Enums"]["entity_status"]
          storage_unit?: string | null
          updated_at?: string
        }
        Update: {
          base_unit?: Database["public"]["Enums"]["stock_unit"]
          category?: string | null
          conversion_text?: string | null
          created_at?: string
          critical_threshold?: number | null
          id?: string
          item_code?: string
          min_threshold?: number | null
          name?: string
          notes?: string | null
          organization_id?: string
          pack_quantity?: number | null
          pack_unit?: Database["public"]["Enums"]["stock_unit"] | null
          status?: Database["public"]["Enums"]["entity_status"]
          storage_unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "stock_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          balance_after: number | null
          balance_before: number | null
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes: string | null
          organization_id: string
          production_date: string | null
          quantity: number
          reference_id: string | null
          reference_type: string | null
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Insert: {
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          organization_id: string
          production_date?: string | null
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Update: {
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          organization_id?: string
          production_date?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          stock_item_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receive_items: {
        Row: {
          id: string
          quantity: number
          receive_id: string
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Insert: {
          id?: string
          quantity: number
          receive_id: string
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Update: {
          id?: string
          quantity?: number
          receive_id?: string
          stock_item_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_receive_items_receive_id_fkey"
            columns: ["receive_id"]
            isOneToOne: false
            referencedRelation: "stock_receives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receive_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receives: {
        Row: {
          created_at: string
          id: string
          location_id: string
          notes: string | null
          organization_id: string
          receive_number: string
          received_at: string
          received_by: string | null
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          notes?: string | null
          organization_id: string
          receive_number: string
          received_at?: string
          received_by?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          notes?: string | null
          organization_id?: string
          receive_number?: string
          received_at?: string
          received_by?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_receives_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "stock_receives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receives_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          production_date: string | null
          quantity: number
          received_quantity: number | null
          stock_item_id: string
          transfer_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          production_date?: string | null
          quantity: number
          received_quantity?: number | null
          stock_item_id: string
          transfer_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          production_date?: string | null
          quantity?: number
          received_quantity?: number | null
          stock_item_id?: string
          transfer_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          dispatched_at: string | null
          driver_id: string | null
          from_location_id: string
          id: string
          notes: string | null
          organization_id: string
          scheduled_at: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
          transfer_number: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          dispatched_at?: string | null
          driver_id?: string | null
          from_location_id: string
          id?: string
          notes?: string | null
          organization_id: string
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
          transfer_number: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          dispatched_at?: string | null
          driver_id?: string | null
          from_location_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location_id?: string
          transfer_number?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "stock_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_write_off_items: {
        Row: {
          id: string
          notes: string | null
          production_date: string | null
          quantity: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
          write_off_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          production_date?: string | null
          quantity: number
          stock_item_id: string
          unit: Database["public"]["Enums"]["stock_unit"]
          write_off_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          production_date?: string | null
          quantity?: number
          stock_item_id?: string
          unit?: Database["public"]["Enums"]["stock_unit"]
          write_off_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_write_off_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_write_off_items_write_off_id_fkey"
            columns: ["write_off_id"]
            isOneToOne: false
            referencedRelation: "stock_write_offs"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_write_offs: {
        Row: {
          approved_by: string | null
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          organization_id: string
          reason: string
          status: Database["public"]["Enums"]["approval_status"]
          write_off_number: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          organization_id: string
          reason: string
          status?: Database["public"]["Enums"]["approval_status"]
          write_off_number: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          organization_id?: string
          reason?: string
          status?: Database["public"]["Enums"]["approval_status"]
          write_off_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_write_offs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_write_offs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_write_offs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_write_offs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "stock_write_offs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          capacity: string | null
          company_assigned_at: string | null
          company_custodian_profile_id: string | null
          company_usage_note: string | null
          compliance_notes: string | null
          created_at: string
          default_driver_id: string | null
          id: string
          inspection_expiry: string | null
          insurance_expiry: string | null
          organization_id: string
          permit_expiry: string | null
          plate_number: string | null
          remarks: string | null
          road_tax_expiry: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
          vehicle_category: string
          vehicle_code: string
          vehicle_type: string
        }
        Insert: {
          capacity?: string | null
          company_assigned_at?: string | null
          company_custodian_profile_id?: string | null
          company_usage_note?: string | null
          compliance_notes?: string | null
          created_at?: string
          default_driver_id?: string | null
          id?: string
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          organization_id: string
          permit_expiry?: string | null
          plate_number?: string | null
          remarks?: string | null
          road_tax_expiry?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          vehicle_category?: string
          vehicle_code: string
          vehicle_type: string
        }
        Update: {
          capacity?: string | null
          company_assigned_at?: string | null
          company_custodian_profile_id?: string | null
          company_usage_note?: string | null
          compliance_notes?: string | null
          created_at?: string
          default_driver_id?: string | null
          id?: string
          inspection_expiry?: string | null
          insurance_expiry?: string | null
          organization_id?: string
          permit_expiry?: string | null
          plate_number?: string | null
          remarks?: string | null
          road_tax_expiry?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
          vehicle_category?: string
          vehicle_code?: string
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_company_custodian_profile_id_fkey"
            columns: ["company_custodian_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_default_driver_id_fkey"
            columns: ["default_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_audit_items: {
        Row: {
          audit_id: string
          audited_quantity: number
          id: string
          stock_item_id: string
          system_quantity: number
          unit: Database["public"]["Enums"]["stock_unit"]
          variance: number | null
        }
        Insert: {
          audit_id: string
          audited_quantity: number
          id?: string
          stock_item_id: string
          system_quantity: number
          unit: Database["public"]["Enums"]["stock_unit"]
          variance?: number | null
        }
        Update: {
          audit_id?: string
          audited_quantity?: number
          id?: string
          stock_item_id?: string
          system_quantity?: number
          unit?: Database["public"]["Enums"]["stock_unit"]
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_audit_items_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "warehouse_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_audit_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_audits: {
        Row: {
          approved_by: string | null
          audit_date: string
          audit_number: string
          audited_by: string | null
          created_at: string
          id: string
          location_id: string
          notes: string | null
          organization_id: string
          status: Database["public"]["Enums"]["approval_status"]
        }
        Insert: {
          approved_by?: string | null
          audit_date?: string
          audit_number: string
          audited_by?: string | null
          created_at?: string
          id?: string
          location_id: string
          notes?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Update: {
          approved_by?: string | null
          audit_date?: string
          audit_number?: string
          audited_by?: string | null
          created_at?: string
          id?: string
          location_id?: string
          notes?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_audits_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_audits_audited_by_fkey"
            columns: ["audited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_audits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_audits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "warehouse_audits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_roster_entries: {
        Row: {
          created_at: string
          day_index: number
          id: string
          is_off: boolean
          notes: string | null
          plan_id: string
          scheduled_end: string | null
          scheduled_start: string | null
          staff_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_index: number
          id?: string
          is_off?: boolean
          notes?: string | null
          plan_id: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          staff_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_index?: number
          id?: string
          is_off?: boolean
          notes?: string | null
          plan_id?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          staff_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_roster_entries_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_roster_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_roster_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_roster_entries_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shift_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_roster_plans: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          published_at: string | null
          published_by: string | null
          status: Database["public"]["Enums"]["weekly_roster_status"]
          updated_at: string
          week_start_date: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["weekly_roster_status"]
          updated_at?: string
          week_start_date: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          published_at?: string | null
          published_by?: string | null
          status?: Database["public"]["Enums"]["weekly_roster_status"]
          updated_at?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_roster_plans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_roster_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_roster_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "weekly_roster_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_roster_plans_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_roster_reminder_log: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          manager_profile_id: string
          organization_id: string
          reminder_date: string
          week_start_date: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          manager_profile_id: string
          organization_id: string
          reminder_date: string
          week_start_date: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          manager_profile_id?: string
          organization_id?: string
          reminder_date?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_roster_reminder_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_roster_reminder_log_manager_profile_id_fkey"
            columns: ["manager_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_roster_reminder_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "weekly_roster_reminder_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      dashboard_daily_rollups: {
        Row: {
          branch_count: number | null
          organization_id: string | null
          source_updated_at: string | null
          summary_date: string | null
          total_sales: number | null
          transaction_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_daily_summaries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "pos_daily_summaries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_stats: {
        Row: {
          critical_stock_count: number | null
          low_stock_count: number | null
          organization_id: string | null
          outstanding_cash: number | null
          pending_approvals: number | null
          sales_this_month: number | null
          sales_this_week: number | null
          sales_today: number | null
        }
        Insert: {
          critical_stock_count?: never
          low_stock_count?: never
          organization_id?: string | null
          outstanding_cash?: never
          pending_approvals?: never
          sales_this_month?: never
          sales_this_week?: never
          sales_today?: never
        }
        Update: {
          critical_stock_count?: never
          low_stock_count?: never
          organization_id?: string | null
          outstanding_cash?: never
          pending_approvals?: never
          sales_this_month?: never
          sales_this_week?: never
          sales_today?: never
        }
        Relationships: []
      }
    }
    Functions: {
      _internal_create_dispatch_transfer: {
        Args: {
          p_driver_id: string
          p_from_location_id: string
          p_items: Json
          p_notes: string
          p_org_id: string
          p_to_location_id: string
          p_user_id: string
          p_vehicle_id: string
        }
        Returns: string
      }
      _internal_receive_stock: {
        Args: {
          p_items: Json
          p_location_id: string
          p_notes: string
          p_org_id: string
          p_source: string
          p_user_id: string
        }
        Returns: string
      }
      _pos_apply_receipt_stock: {
        Args: { p_receipt_id: string; p_user_id: string }
        Returns: undefined
      }
      acknowledge_hq_factory_order: {
        Args: { p_order_id: string }
        Returns: Json
      }
      adjust_route_stop_items: {
        Args: { p_adjustments: Json; p_reason?: string; p_stop_id: string }
        Returns: Json
      }
      admin_create_branch: {
        Args: {
          p_area?: string
          p_branch_code: string
          p_branch_name: string
          p_manager_name?: string
          p_region_id: string
        }
        Returns: Json
      }
      admin_delete_branch: { Args: { p_branch_id: string }; Returns: Json }
      agent_outlet_has_active_subscription: {
        Args: { p_outlet_id: string }
        Returns: boolean
      }
      approve_cash_reconciliation: {
        Args: { p_reconciliation_id: string }
        Returns: Json
      }
      approve_payroll_run: { Args: { p_run_id: string }; Returns: Json }
      approve_pos_branch_supply_request: {
        Args: { p_request_id: string }
        Returns: Json
      }
      approve_pos_stock_receipt: {
        Args: { p_receipt_id: string }
        Returns: Json
      }
      approve_staff_shift: { Args: { p_shift_id: string }; Returns: Json }
      approve_stock_adjustment: {
        Args: { p_adjustment_id: string }
        Returns: Json
      }
      approve_stock_count: { Args: { p_count_id: string }; Returns: Json }
      approve_stock_write_off: {
        Args: { p_write_off_id: string }
        Returns: Json
      }
      approve_warehouse_audit: { Args: { p_audit_id: string }; Returns: Json }
      assert_published_production_date: {
        Args: { p_org_id: string; p_production_date: string }
        Returns: undefined
      }
      assert_rkj_authenticated: { Args: never; Returns: string }
      assert_rkj_hq_access: {
        Args: { p_target_org_id: string }
        Returns: undefined
      }
      assign_branch_drivers: {
        Args: { p_assignments: Json; p_order_id: string }
        Returns: Json
      }
      auto_fulfill_acknowledged_factory_order: {
        Args: { p_order_id: string; p_user_id: string }
        Returns: Json
      }
      branch_delivery_priority: {
        Args: { p_branch_id: string; p_org_id: string }
        Returns: number
      }
      branch_roti_daily_pcs: {
        Args: {
          p_avg_sales: number
          p_branch_id: string
          p_branch_name: string
          p_location_id: string
          p_org_id: string
          p_pack_qty: number
          p_stock_item_id: string
        }
        Returns: number
      }
      branch_route_stop_meta: {
        Args: { p_location_ids: string[]; p_org_id: string }
        Returns: Json
      }
      branch_sales_potential_factor: {
        Args: { p_branch_id: string; p_branch_name: string; p_org_id: string }
        Returns: number
      }
      branch_supply_suggested_qty: {
        Args: {
          p_branch_roti_bags: Json
          p_category: string
          p_item_code: string
        }
        Returns: number
      }
      calculate_commission: {
        Args: { p_org_id: string; p_sales_amount: number }
        Returns: number
      }
      calculate_foreign_shift_pay: {
        Args: { p_hours: number; p_org_id: string }
        Returns: number
      }
      can_access_roster_plan: { Args: { p_plan_id: string }; Returns: boolean }
      can_admin_settings: { Args: never; Returns: boolean }
      can_manage_factory_production_schedule: { Args: never; Returns: boolean }
      can_manage_personnel: { Args: never; Returns: boolean }
      can_set_roti_production_date: { Args: never; Returns: boolean }
      can_set_roti_production_date_on_kiosk_transfer: {
        Args: never
        Returns: boolean
      }
      cancel_agent_payment: {
        Args: {
          p_gateway_ref?: string
          p_payment_id: string
          p_reason?: string
        }
        Returns: Json
      }
      check_low_stock: { Args: { p_org_id: string }; Returns: undefined }
      clock_in_staff: {
        Args: { p_branch_id: string; p_staff_id: string }
        Returns: Json
      }
      clock_out_staff: { Args: { p_staff_id: string }; Returns: Json }
      close_expired_production_order_windows: { Args: never; Returns: number }
      close_pos_shift: {
        Args: { p_closing_cash: number; p_notes?: string; p_shift_id: string }
        Returns: Json
      }
      complete_route_handoff: {
        Args: { p_primary_plan_id: string }
        Returns: Json
      }
      complete_stock_transfer:
        | { Args: { p_transfer_id: string }; Returns: Json }
        | {
            Args: { p_production_date?: string; p_transfer_id: string }
            Returns: Json
          }
      confirm_agent_payment_and_fulfill: {
        Args: { p_gateway_ref?: string; p_payment_id: string }
        Returns: Json
      }
      confirm_route_stop_delivery: {
        Args: {
          p_driver_notes?: string
          p_receiver_name?: string
          p_stop_id: string
        }
        Returns: Json
      }
      consume_stock_batches_fifo: {
        Args: { p_location_id: string; p_qty: number; p_stock_item_id: string }
        Returns: undefined
      }
      consume_stock_batches_targeted: {
        Args: {
          p_full_consume_status?: string
          p_location_id: string
          p_production_date?: string
          p_qty: number
          p_stock_item_id: string
        }
        Returns: undefined
      }
      create_delivery_order:
        | {
            Args: {
              p_final_destination_id: string
              p_legs: Json
              p_notes?: string
              p_origin_location_id: string
              p_primary_driver_id?: string
              p_primary_vehicle_id?: string
              p_scheduled_date?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_ai_route_summary?: string
              p_final_destination_id: string
              p_legs: Json
              p_notes?: string
              p_origin_location_id: string
              p_primary_driver_id?: string
              p_primary_vehicle_id?: string
              p_scheduled_date?: string
            }
            Returns: Json
          }
      create_delivery_routes_for_factory_order:
        | { Args: { p_order_id: string }; Returns: Json }
        | { Args: { p_order_id: string; p_replace?: boolean }; Returns: Json }
      create_finance_collection: {
        Args: {
          p_amount: number
          p_branch_id?: string
          p_collected_from?: string
          p_collection_type: Database["public"]["Enums"]["collection_type"]
          p_notes?: string
          p_shift_id?: string
        }
        Returns: Json
      }
      create_hq_factory_order: {
        Args: {
          p_branch_items?: Json
          p_items: Json
          p_notes?: string
          p_production_date: string
        }
        Returns: Json
      }
      create_pos_branch_supply_request: {
        Args: {
          p_branch_id: string
          p_items: Json
          p_needed_by?: string
          p_notes?: string
          p_priority?: string
        }
        Returns: Json
      }
      create_staff_shift: {
        Args: {
          p_branch_id: string
          p_notes?: string
          p_scheduled_end?: string
          p_scheduled_start?: string
          p_shift_date: string
          p_staff_id: string
          p_template_id?: string
        }
        Returns: Json
      }
      create_stock_transfer: {
        Args: {
          p_driver_id?: string
          p_from_location_id: string
          p_items: Json
          p_notes?: string
          p_to_location_id: string
          p_vehicle_id?: string
        }
        Returns: Json
      }
      default_driver_for_region: {
        Args: {
          p_org_id: string
          p_region: Database["public"]["Enums"]["region_code"]
        }
        Returns: {
          driver_id: string
          route_name: string
          vehicle_id: string
        }[]
      }
      default_driver_id_for_branch: {
        Args: { p_branch_id: string; p_org_id: string }
        Returns: string
      }
      dispatch_delivery_leg: { Args: { p_leg_id: string }; Returns: Json }
      dispatch_stock_transfer: {
        Args: { p_transfer_id: string }
        Returns: Json
      }
      driver_route_role: { Args: { p_driver_code: string }; Returns: string }
      expire_agent_subscriptions: {
        Args: { p_org_id?: string }
        Returns: number
      }
      factory_order_cutoff_at: {
        Args: { p_production_date: string }
        Returns: string
      }
      fail_agent_payment: {
        Args: {
          p_gateway_ref?: string
          p_payment_id: string
          p_reason?: string
        }
        Returns: Json
      }
      finalize_hq_factory_order: { Args: { p_order_id: string }; Returns: Json }
      generate_daily_financial_report: {
        Args: { p_branch_id?: string; p_report_date: string }
        Returns: Json
      }
      generate_doc_number: {
        Args: { p_org_id: string; p_prefix: string }
        Returns: string
      }
      generate_fleet_number: { Args: { p_prefix: string }; Returns: string }
      generate_inv_number: {
        Args: { p_org_id: string; p_prefix: string }
        Returns: string
      }
      generate_payroll_run: {
        Args: {
          p_branch_id?: string
          p_period_end: string
          p_period_start: string
        }
        Returns: Json
      }
      generate_pos_number: {
        Args: { p_org_id: string; p_prefix: string }
        Returns: string
      }
      geo_distance_km: {
        Args: { p_lat1: number; p_lat2: number; p_lng1: number; p_lng2: number }
        Returns: number
      }
      get_dashboard_snapshot: {
        Args: { p_branch_ids?: string[]; p_org_id: string }
        Returns: {
          critical_stock_count: number
          low_stock_count: number
          organization_id: string
          outstanding_cash: number
          pending_approvals: number
          sales_this_month: number
          sales_this_week: number
          sales_today: number
        }[]
      }
      get_driver_work_schedule: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      get_expired_roti_stock: { Args: { p_location_id: string }; Returns: Json }
      get_factory_order_report: { Args: { p_order_id: string }; Returns: Json }
      get_pos_product_availability: {
        Args: { p_branch_id: string }
        Returns: Json
      }
      get_published_production_dates: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      get_roti_expiry_summary: {
        Args: { p_location_id: string }
        Returns: Json
      }
      has_branch_access: { Args: { p_branch_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_factory_order_window_open: {
        Args: { p_org_id: string; p_production_date: string }
        Returns: boolean
      }
      is_own_published_roster_entry: {
        Args: { p_entry_id: string }
        Returns: boolean
      }
      is_own_published_roster_plan: {
        Args: { p_plan_id: string }
        Returns: boolean
      }
      is_published_production_date: {
        Args: { p_org_id: string; p_production_date: string }
        Returns: boolean
      }
      is_roti_stock_item: {
        Args: { p_stock_item_id: string }
        Returns: boolean
      }
      log_fleet_status: {
        Args: {
          p_driver_id?: string
          p_gps_latitude?: number
          p_gps_longitude?: number
          p_location_description?: string
          p_notes?: string
          p_status: string
          p_vehicle_id: string
        }
        Returns: Json
      }
      malaysia_effective_consumption_days: {
        Args: { p_branch_name: string; p_from: string; p_to: string }
        Returns: number
      }
      malaysia_highway_demand_multiplier: {
        Args: { p_branch_name: string; p_date: string }
        Returns: number
      }
      malaysia_holidays_in_range: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      mark_collection_collected: {
        Args: {
          p_collection_id: string
          p_collector_name?: string
          p_third_party_name?: string
        }
        Returns: Json
      }
      mark_expired_roti_batches: { Args: never; Returns: undefined }
      next_agent_order_number: { Args: { p_org_id: string }; Returns: string }
      next_agent_receipt_number: { Args: { p_org_id: string }; Returns: string }
      next_maintenance_report_number: {
        Args: { p_org_id: string }
        Returns: string
      }
      open_pos_shift: {
        Args: {
          p_branch_id: string
          p_opening_cash?: number
          p_staff_id?: string
        }
        Returns: Json
      }
      optimize_delivery_order_route: {
        Args: {
          p_current_lat?: number
          p_current_lng?: number
          p_order_id: string
        }
        Returns: Json
      }
      optimize_delivery_route_stops: {
        Args: { p_plan_id: string }
        Returns: Json
      }
      organization_id: { Args: never; Returns: string }
      pos_sop_status: { Args: { p_branch_id: string }; Returns: Json }
      pos_staff_confirm_stock_delivery: {
        Args: { p_items: Json; p_receipt_id: string; p_staff_notes?: string }
        Returns: Json
      }
      pos_staff_leave_return: { Args: { p_presence_id: string }; Returns: Json }
      pos_staff_leave_start: {
        Args: {
          p_branch_id: string
          p_notes?: string
          p_reason: string
          p_shift_id: string
        }
        Returns: Json
      }
      pos_staff_presence_check: {
        Args: {
          p_branch_id: string
          p_notes?: string
          p_prompt_reason?: string
          p_prompted_at?: string
          p_shift_id: string
          p_status?: string
        }
        Returns: Json
      }
      post_process_driver_instructions: {
        Args: { p_max_stops?: number; p_order_id: string }
        Returns: Json
      }
      process_pos_sale: {
        Args: {
          p_branch_id: string
          p_cash_amount: number
          p_discount?: number
          p_items: Json
          p_offline_id?: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_qr_amount: number
          p_receipt_email?: string
          p_receipt_phone?: string
          p_shift_id: string
        }
        Returns: Json
      }
      publish_weekly_roster: { Args: { p_plan_id: string }; Returns: Json }
      receive_stock: {
        Args: {
          p_items: Json
          p_location_id: string
          p_notes?: string
          p_source?: string
        }
        Returns: Json
      }
      record_bank_in: {
        Args: {
          p_amount: number
          p_bank_name?: string
          p_banked_at?: string
          p_collection_id?: string
          p_notes?: string
          p_reference_number?: string
          p_slip_url?: string
        }
        Returns: Json
      }
      record_collection_cash_usage: {
        Args: {
          p_amount: number
          p_collection_id: string
          p_description: string
          p_proof_url?: string
          p_receipt_number?: string
          p_spent_at?: string
          p_supply_request_id?: string
          p_usage_type: string
          p_vehicle_reference?: string
          p_vendor_name?: string
        }
        Returns: Json
      }
      record_factory_raw_material_usage: {
        Args: { p_items: Json; p_notes?: string; p_production_date: string }
        Returns: Json
      }
      refresh_dashboard_daily_rollups: { Args: never; Returns: undefined }
      refresh_pos_daily_summary: {
        Args: { p_branch_id: string; p_date: string; p_org_id: string }
        Returns: undefined
      }
      refund_agent_payment: {
        Args: {
          p_gateway_ref?: string
          p_payment_id: string
          p_reason?: string
          p_refund_ref?: string
        }
        Returns: Json
      }
      refund_pos_transaction: {
        Args: { p_reason: string; p_transaction_id: string }
        Returns: Json
      }
      reject_pos_branch_supply_request: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: Json
      }
      reject_pos_stock_receipt: {
        Args: { p_reason?: string; p_receipt_id: string }
        Returns: Json
      }
      resolve_approval_request: {
        Args: { p_action: string; p_reason?: string; p_request_id: string }
        Returns: Json
      }
      review_collection_cash_usage: {
        Args: { p_review_notes?: string; p_status: string; p_usage_id: string }
        Returns: Json
      }
      roti_shelf_life_days: { Args: never; Returns: number }
      route_stop_sort_key: {
        Args: { p_branch_code: string; p_branch_name: string }
        Returns: number
      }
      split_route_plan_max_stops: {
        Args: { p_max?: number; p_plan_id: string }
        Returns: Json
      }
      submit_cash_reconciliation: {
        Args: {
          p_actual_cash: number
          p_branch_id: string
          p_expected_cash: number
          p_notes?: string
          p_reconciliation_date: string
        }
        Returns: Json
      }
      submit_proof_of_delivery: {
        Args: {
          p_driver_notes?: string
          p_gps_latitude?: number
          p_gps_longitude?: number
          p_image_urls?: Json
          p_leg_id: string
          p_receiver_name: string
          p_receiver_signature_url?: string
        }
        Returns: Json
      }
      submit_stock_adjustment: {
        Args: { p_items: Json; p_location_id: string; p_reason: string }
        Returns: Json
      }
      submit_stock_count: {
        Args: { p_items: Json; p_location_id: string; p_notes?: string }
        Returns: Json
      }
      submit_stock_write_off: {
        Args: { p_items: Json; p_location_id: string; p_reason: string }
        Returns: Json
      }
      submit_warehouse_audit: {
        Args: { p_items: Json; p_location_id: string; p_notes?: string }
        Returns: Json
      }
      suggest_hq_factory_order: {
        Args: { p_production_date: string }
        Returns: Json
      }
      update_delivery_route_plan: {
        Args: {
          p_driver_id?: string
          p_plan_id: string
          p_stop_order?: string[]
          p_vehicle_id?: string
        }
        Returns: Json
      }
      update_payroll_rule: {
        Args: { p_notes?: string; p_rate?: number; p_rule_id: string }
        Returns: Json
      }
      upsert_factory_production_week: {
        Args: {
          p_notes?: string
          p_production_dates: string[]
          p_publish?: boolean
          p_week_start: string
        }
        Returns: Json
      }
      user_branch_id: { Args: never; Returns: string }
      user_region_id: { Args: never; Returns: string }
      user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      validate_pos_sale_stock: {
        Args: { p_items: Json; p_location_id: string }
        Returns: undefined
      }
      void_pos_transaction: {
        Args: { p_reason: string; p_transaction_id: string }
        Returns: Json
      }
      week_start_monday: { Args: { p_date: string }; Returns: string }
    }
    Enums: {
      agent_account_status: "PENDING" | "ACTIVE" | "SUSPENDED"
      agent_order_status:
        | "DRAFT"
        | "PENDING_PAYMENT"
        | "PAID"
        | "SUBMITTED_FACTORY"
        | "ACKNOWLEDGED"
        | "FULFILLED"
        | "CANCELLED"
      agent_outlet_status: "PENDING" | "ACTIVE" | "SUSPENDED"
      agent_payment_purpose: "STOCK_ORDER" | "POS_SUBSCRIPTION"
      agent_payment_status: "PENDING" | "PAID" | "FAILED" | "REFUNDED"
      approval_entity_type:
        | "STOCK_TRANSFER"
        | "STOCK_ADJUSTMENT"
        | "STOCK_WRITE_OFF"
        | "VOID_SALE"
        | "REFUND"
        | "SHIFT"
        | "PAYROLL"
        | "BANK_IN"
        | "CASH_RECONCILIATION"
        | "POS_SHIFT_STAFF"
      approval_status: "PENDING" | "APPROVED" | "REJECTED"
      collection_status: "PENDING" | "COLLECTED" | "BANKED" | "VERIFIED"
      collection_type:
        | "QR"
        | "CASH_KIOSK"
        | "MANAGER"
        | "THIRD_PARTY"
        | "BANK_IN"
      delivery_leg_type:
        | "FACTORY_TO_HQ"
        | "HQ_TO_VEHICLE"
        | "VEHICLE_TO_VEHICLE"
        | "VEHICLE_TO_BRANCH"
      entity_status: "ACTIVE" | "INACTIVE" | "SUSPENDED"
      location_type:
        | "FACTORY"
        | "HQ_WAREHOUSE"
        | "FLEET_VEHICLE"
        | "BRANCH_KIOSK"
      malaysia_holiday_type:
        | "CUTI_UMUM"
        | "CUTI_NEGERI"
        | "CUTI_SEKOLAH"
        | "CUTI_FESTIF"
        | "CUTI_BALIK_KAMPUNG"
      movement_type:
        | "RECEIVE"
        | "TRANSFER_OUT"
        | "TRANSFER_IN"
        | "ADJUSTMENT"
        | "COUNT"
        | "WRITE_OFF"
        | "SALE_DEDUCT"
        | "PRODUCTION"
      notification_type:
        | "LOW_STOCK"
        | "CRITICAL_STOCK"
        | "PENDING_SHIFT"
        | "PENDING_APPROVAL"
        | "PENDING_BANK_IN"
        | "DELIVERY_STATUS"
        | "ROSTER_DUE"
        | "ROSTER_PUBLISHED"
      online_payment_method: "CARD" | "DEBIT" | "FPX"
      payment_method: "CASH" | "QR" | "MIXED"
      payroll_period: "PER_SHIFT" | "HOURLY" | "MONTHLY" | "ONE_TIME"
      permission_level:
        | "NONE"
        | "VIEW"
        | "VIEW_AREA"
        | "FULL"
        | "FULL_OWN"
        | "OWN"
      pos_shift_status: "OPEN" | "CLOSED"
      pos_tx_status: "COMPLETED" | "VOIDED" | "REFUNDED"
      region_code: "UTARA" | "TENGAH" | "SELATAN"
      stock_unit:
        | "PCS"
        | "GRAM"
        | "KG"
        | "BAG"
        | "PACK"
        | "TONG"
        | "SET"
        | "CUP"
      transfer_status:
        | "DRAFT"
        | "PENDING"
        | "IN_TRANSIT"
        | "DELIVERED"
        | "CANCELLED"
        | "REJECTED"
      user_role:
        | "SUPER_ADMIN"
        | "ADMIN"
        | "HR"
        | "OPERATION_MANAGER"
        | "CEO_FACTORY"
        | "AREA_MANAGER"
        | "DRIVER"
        | "STAFF"
        | "FINANCE"
        | "MAINTENANCE_MANAGER"
        | "SALES_AGENT"
      weekly_roster_status: "DRAFT" | "PUBLISHED"
      worker_type: "FOREIGN" | "LOCAL"
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
      agent_account_status: ["PENDING", "ACTIVE", "SUSPENDED"],
      agent_order_status: [
        "DRAFT",
        "PENDING_PAYMENT",
        "PAID",
        "SUBMITTED_FACTORY",
        "ACKNOWLEDGED",
        "FULFILLED",
        "CANCELLED",
      ],
      agent_outlet_status: ["PENDING", "ACTIVE", "SUSPENDED"],
      agent_payment_purpose: ["STOCK_ORDER", "POS_SUBSCRIPTION"],
      agent_payment_status: ["PENDING", "PAID", "FAILED", "REFUNDED"],
      approval_entity_type: [
        "STOCK_TRANSFER",
        "STOCK_ADJUSTMENT",
        "STOCK_WRITE_OFF",
        "VOID_SALE",
        "REFUND",
        "SHIFT",
        "PAYROLL",
        "BANK_IN",
        "CASH_RECONCILIATION",
        "POS_SHIFT_STAFF",
      ],
      approval_status: ["PENDING", "APPROVED", "REJECTED"],
      collection_status: ["PENDING", "COLLECTED", "BANKED", "VERIFIED"],
      collection_type: [
        "QR",
        "CASH_KIOSK",
        "MANAGER",
        "THIRD_PARTY",
        "BANK_IN",
      ],
      delivery_leg_type: [
        "FACTORY_TO_HQ",
        "HQ_TO_VEHICLE",
        "VEHICLE_TO_VEHICLE",
        "VEHICLE_TO_BRANCH",
      ],
      entity_status: ["ACTIVE", "INACTIVE", "SUSPENDED"],
      location_type: [
        "FACTORY",
        "HQ_WAREHOUSE",
        "FLEET_VEHICLE",
        "BRANCH_KIOSK",
      ],
      malaysia_holiday_type: [
        "CUTI_UMUM",
        "CUTI_NEGERI",
        "CUTI_SEKOLAH",
        "CUTI_FESTIF",
        "CUTI_BALIK_KAMPUNG",
      ],
      movement_type: [
        "RECEIVE",
        "TRANSFER_OUT",
        "TRANSFER_IN",
        "ADJUSTMENT",
        "COUNT",
        "WRITE_OFF",
        "SALE_DEDUCT",
        "PRODUCTION",
      ],
      notification_type: [
        "LOW_STOCK",
        "CRITICAL_STOCK",
        "PENDING_SHIFT",
        "PENDING_APPROVAL",
        "PENDING_BANK_IN",
        "DELIVERY_STATUS",
        "ROSTER_DUE",
        "ROSTER_PUBLISHED",
      ],
      online_payment_method: ["CARD", "DEBIT", "FPX"],
      payment_method: ["CASH", "QR", "MIXED"],
      payroll_period: ["PER_SHIFT", "HOURLY", "MONTHLY", "ONE_TIME"],
      permission_level: [
        "NONE",
        "VIEW",
        "VIEW_AREA",
        "FULL",
        "FULL_OWN",
        "OWN",
      ],
      pos_shift_status: ["OPEN", "CLOSED"],
      pos_tx_status: ["COMPLETED", "VOIDED", "REFUNDED"],
      region_code: ["UTARA", "TENGAH", "SELATAN"],
      stock_unit: ["PCS", "GRAM", "KG", "BAG", "PACK", "TONG", "SET", "CUP"],
      transfer_status: [
        "DRAFT",
        "PENDING",
        "IN_TRANSIT",
        "DELIVERED",
        "CANCELLED",
        "REJECTED",
      ],
      user_role: [
        "SUPER_ADMIN",
        "ADMIN",
        "HR",
        "OPERATION_MANAGER",
        "CEO_FACTORY",
        "AREA_MANAGER",
        "DRIVER",
        "STAFF",
        "FINANCE",
        "MAINTENANCE_MANAGER",
        "SALES_AGENT",
      ],
      weekly_roster_status: ["DRAFT", "PUBLISHED"],
      worker_type: ["FOREIGN", "LOCAL"],
    },
  },
} as const

// Hand-written application domain types preserved from the repository.
export interface Organization {
 id: string;
 code: string;
 name: string;
 hq_address: string | null;
 hq_city: string;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 settings: Json;
 created_at: string;
 updated_at: string;
}

export interface Region {
 id: string;
 organization_id: string;
 code: 'UTARA' | 'TENGAH' | 'SELATAN';
 name: string;
 manager_name: string | null;
 manager_profile_id: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 created_at: string;
 updated_at: string;
}

export interface Branch {
 id: string;
 organization_id: string;
 region_id: string;
 branch_code: string;
 branch_name: string;
 area: string | null;
 manager_name: string | null;
 latitude: number | null;
 longitude: number | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 remarks: string | null;
 created_at: string;
 updated_at: string;
}

export interface Profile {
 id: string;
 organization_id: string;
 employee_code: string | null;
 full_name: string;
 email: string | null;
 phone: string | null;
 role: UserRole;
 legal_entity_id: string | null;
 legal_entity?: LegalEntity | null;
 operating_legal_entity_id?: string | null;
 operating_legal_entity?: LegalEntity | null;
 region_id: string | null;
 branch_id: string | null;
 avatar_url: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 must_change_password: boolean;
 last_login_at: string | null;
 ic_number: string | null;
 date_of_birth: string | null;
 gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
 nationality: string | null;
 address_line1: string | null;
 address_line2: string | null;
 city: string | null;
 state: string | null;
 postcode: string | null;
 emergency_contact_name: string | null;
 emergency_contact_phone: string | null;
 emergency_contact_relation: string | null;
 profile_completed_at: string | null;
 metadata: Json;
 created_at: string;
 updated_at: string;
}

export interface LegalEntity {
 id: string;
 organization_id: string;
 code: string;
 name: string;
 legal_name: string;
 scope: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 sort_order: number;
 created_at?: string;
 updated_at?: string;
}

export interface MaintenanceReport {
 id: string;
 organization_id: string;
 report_number: string;
 branch_id: string | null;
 reported_by: string | null;
 assigned_to: string | null;
 report_type: 'MAINTENANCE' | 'STAFF_SHORTAGE' | 'EMERGENCY';
 category: 'GENERAL' | 'ELECTRICAL' | 'PLUMBING' | 'EQUIPMENT' | 'SIGNAGE' | 'CLEANLINESS' | 'SAFETY' | 'STAFFING';
 priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
 status: 'NEW' | 'REVIEWING' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'RESOLVED' | 'CANCELLED';
 title: string;
 description: string;
 substitute_required: boolean;
 substitute_status: 'NOT_REQUIRED' | 'REQUESTED' | 'HANIF_ASSIGNED' | 'COVERED' | 'CANCELLED';
 preferred_visit_date: string | null;
 contact_name: string | null;
 contact_phone: string | null;
 manager_notes: string | null;
 resolved_at: string | null;
 created_at: string;
 updated_at: string;
}

export interface RolePermission {
 id: string;
 organization_id: string;
 role: UserRole;
 module: string;
 permission: PermissionLevel;
 created_at: string;
 updated_at: string;
}

export interface Staff {
 id: string;
 organization_id: string;
 staff_code: string;
 full_name: string;
 legal_entity_id: string | null;
 branch_id: string | null;
 region_id: string | null;
 worker_type: 'FOREIGN' | 'LOCAL' | null;
 bank_name: string | null;
 account_number: string | null;
 account_holder: string | null;
 weekly_amount: number | null;
 monthly_amount: number | null;
 shift_hours: number | null;
 shifts_per_week: number | null;
 profile_id: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 on_hold: boolean;
 remarks: string | null;
 created_at: string;
 updated_at: string;
}

export interface Driver {
 id: string;
 organization_id: string;
 driver_code: string;
 full_name: string;
 route_description: string | null;
 phone: string | null;
 profile_id: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 remarks: string | null;
 created_at: string;
 updated_at: string;
}

export interface Vehicle {
 id: string;
 organization_id: string;
 vehicle_code: string;
 plate_number: string | null;
 vehicle_type: string;
 capacity: string | null;
 default_driver_id: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 remarks: string | null;
 created_at: string;
 updated_at: string;
}

export interface Product {
 id: string;
 organization_id: string;
 sku: string;
 name: string;
 category: string | null;
 price: number;
 sale_unit: string | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 notes: string | null;
 sort_order: number;
 created_at: string;
 updated_at: string;
}

export interface StockItem {
 id: string;
 organization_id: string;
 item_code: string;
 name: string;
 category: string | null;
 base_unit: string;
 storage_unit: string | null;
 conversion_text: string | null;
 pack_quantity: number | null;
 pack_unit: string | null;
 min_threshold: number | null;
 critical_threshold: number | null;
 status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
 notes: string | null;
 created_at: string;
 updated_at: string;
}

export interface ProductBom {
 id: string;
 organization_id: string;
 product_id: string;
 stock_item_id: string;
 quantity: number;
 unit: string;
 min_qty: number | null;
 max_qty: number | null;
 auto_deduct: boolean;
 notes: string | null;
 created_at: string;
 updated_at: string;
}

export interface InventoryLocation {
 id: string;
 organization_id: string;
 location_type: 'FACTORY' | 'HQ_WAREHOUSE' | 'FLEET_VEHICLE' | 'BRANCH_KIOSK';
 name: string;
 branch_id: string | null;
 vehicle_id: string | null;
 is_active: boolean;
 created_at: string;
 updated_at: string;
}

export interface InventoryBalance {
 id: string;
 organization_id: string;
 location_id: string;
 stock_item_id: string;
 quantity: number;
 unit: string;
 last_movement_at: string | null;
 updated_at: string;
}

export interface PosShift {
 id: string;
 organization_id: string;
 branch_id: string;
 shift_number: string;
 staff_id: string | null;
 opened_by: string;
 closed_by: string | null;
 status: 'OPEN' | 'CLOSED';
 opening_cash: number;
 closing_cash: number | null;
 expected_cash: number | null;
 cash_variance: number | null;
 total_sales: number;
 total_cash: number;
 total_qr: number;
 transaction_count: number;
 opened_at: string;
 closed_at: string | null;
 notes: string | null;
 created_at: string;
 updated_at: string;
}

export interface PosTransaction {
 id: string;
 organization_id: string;
 branch_id: string;
 shift_id: string;
 transaction_number: string;
 status: 'COMPLETED' | 'VOIDED' | 'REFUNDED';
 subtotal: number;
 discount: number;
 total: number;
 payment_method: 'CASH' | 'QR' | 'MIXED';
 cash_amount: number;
 qr_amount: number;
 change_amount: number;
 void_reason: string | null;
 voided_by: string | null;
 voided_at: string | null;
 refund_reason: string | null;
 refunded_by: string | null;
 refunded_at: string | null;
 original_transaction_id: string | null;
 receipt_sent: boolean;
 receipt_email: string | null;
 receipt_phone: string | null;
 offline_id: string | null;
 synced_at: string | null;
 created_by: string;
 created_at: string;
 updated_at: string;
}

export interface PosTransactionItem {
 id: string;
 transaction_id: string;
 product_id: string;
 product_name: string;
 sku: string;
 quantity: number;
 unit_price: number;
 line_total: number;
 created_at: string;
}

export interface Notification {
 id: string;
 organization_id: string;
 recipient_id: string;
 type: Database['public']['Enums']['notification_type'];
 title: string;
 message: string;
 link: string | null;
 entity_type: string | null;
 entity_id: string | null;
 is_read: boolean;
 read_at: string | null;
 created_at: string;
}

export interface ApprovalRequest {
 id: string;
 organization_id: string;
 entity_type: string;
 entity_id: string;
 title: string;
 description: string | null;
 status: 'PENDING' | 'APPROVED' | 'REJECTED';
 requested_by: string;
 assigned_to: string | null;
 approved_by: string | null;
 rejected_by: string | null;
 rejection_reason: string | null;
 branch_id: string | null;
 region_id: string | null;
 metadata: Json;
 created_at: string;
 updated_at: string;
 resolved_at: string | null;
}

export type HrServiceRequestType =
 | 'LEAVE'
 | 'PROFILE_UPDATE'
 | 'DOCUMENT'
 | 'PAYROLL'
 | 'TRANSFER'
 | 'ATTENDANCE'
 | 'UNIFORM_EQUIPMENT'
 | 'OVERTIME'
 | 'CLAIM'
 | 'TRAINING'
 | 'RESIGNATION'
 | 'DISCIPLINE'
 | 'ASSET'
 | 'LOAN_ADVANCE'
 | 'HR_HELP';

export type HrServiceRequestStatus =
 | 'SUBMITTED'
 | 'IN_REVIEW'
 | 'APPROVED'
 | 'REJECTED'
 | 'CANCELLED'
 | 'COMPLETED';

export type HrServiceRequestPriority = 'LOW' | 'NORMAL' | 'HIGH';

export type HrLeaveType = 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'UNPAID' | 'REPLACEMENT';

export type HrLeaveTransactionType =
 | 'ENTITLEMENT'
 | 'CARRY_FORWARD'
 | 'ADJUSTMENT'
 | 'PENDING'
 | 'APPROVED_USAGE'
 | 'REJECT_RELEASE'
 | 'CANCEL_RELEASE';

export interface HrServiceRequest {
 id: string;
 organization_id: string;
 legal_entity_id: string | null;
 branch_id: string | null;
 profile_id: string;
 staff_id: string | null;
 request_number: string;
 request_type: HrServiceRequestType;
 title: string;
 description: string;
 start_date: string | null;
 end_date: string | null;
 priority: HrServiceRequestPriority;
 status: HrServiceRequestStatus;
 reviewed_by: string | null;
 reviewed_at: string | null;
 reviewer_note: string | null;
 metadata: Json;
 created_at: string;
 updated_at: string;
}

export interface HrLeaveBalance {
 id: string;
 organization_id: string;
 legal_entity_id: string | null;
 staff_id: string;
 profile_id: string | null;
 leave_year: number;
 leave_type: HrLeaveType;
 entitlement_days: number;
 carried_forward_days: number;
 used_days: number;
 pending_days: number;
 adjustment_days: number;
 remaining_days: number;
 notes: string | null;
 updated_by: string | null;
 created_at: string;
 updated_at: string;
}

export interface HrLeaveTransaction {
 id: string;
 organization_id: string;
 leave_balance_id: string | null;
 staff_id: string;
 profile_id: string | null;
 hr_service_request_id: string | null;
 leave_type: HrLeaveType;
 transaction_type: HrLeaveTransactionType;
 days: number;
 balance_after_days: number | null;
 note: string | null;
 created_by: string | null;
 created_at: string;
}

export interface DashboardStats {
 organization_id: string;
 sales_today: number;
 sales_this_week: number;
 sales_this_month: number;
 pending_approvals: number;
 critical_stock_count: number;
 low_stock_count: number;
 outstanding_cash: number;
}

export interface OrgStockPlanningSettings {
 organization_id: string;
 stock_coverage_days: number;
 safety_buffer_pcs: number;
 updated_at: string;
}

export interface MalaysiaHoliday {
 id: string;
 holiday_date: string;
 name: string;
 holiday_type: string;
 region_code: string | null;
 demand_multiplier: number;
 notes: string | null;
}

export type ProfileWithBranch = Profile & {
 branch?: Branch | null;
 region?: Region | null;
 legal_entity_id?: string | null;
 legal_entity?: LegalEntity | null;
};
