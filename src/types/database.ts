export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          roll_number: string | null;
          email: string | null;
          role: "student" | "security" | "admin";
          batch: string | null;
          section: string | null;
          phone: string | null;
          hostel: string | null;
          room_number: string | null;
          first_name: string | null;
          last_name: string | null;
          batch_id: string | null;
          registration_form_id: string | null;
          registration_status: "pending" | "approved" | "rejected" | "active";
          registered_at: string | null;
          rejection_reason: string | null;
          status: "active" | "inactive" | "archived";
          created_at: string;
          updated_at: string;
          id_card_path: string | null;
        };
        Insert: {
          id: string;
          full_name: string;
          roll_number?: string | null;
          email?: string | null;
          role: "student" | "security" | "admin";
          batch?: string | null;
          section?: string | null;
          phone?: string | null;
          hostel?: string | null;
          room_number?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          batch_id?: string | null;
          registration_form_id?: string | null;
          registration_status?: "pending" | "approved" | "rejected" | "active";
          registered_at?: string | null;
          rejection_reason?: string | null;
          status?: "active" | "inactive" | "archived";
          created_at?: string;
          updated_at?: string;
          id_card_path?: string | null;
        };
        Update: {
          id?: string;
          full_name?: string;
          roll_number?: string | null;
          email?: string | null;
          role?: "student" | "security" | "admin";
          batch?: string | null;
          section?: string | null;
          phone?: string | null;
          hostel?: string | null;
          room_number?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          batch_id?: string | null;
          registration_form_id?: string | null;
          registration_status?: "pending" | "approved" | "rejected" | "active";
          registered_at?: string | null;
          rejection_reason?: string | null;
          status?: "active" | "inactive" | "archived";
          created_at?: string;
          updated_at?: string;
          id_card_path?: string | null;
        };
        Relationships: [];
      };
      batches: {
        Row: {
          id: string;
          batch_number: string;
          name: string;
          status: "active" | "archived";
          created_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          batch_number: string;
          name: string;
          status?: "active" | "archived";
          created_at?: string;
          archived_at?: string | null;
        };
        Update: {
          id?: string;
          batch_number?: string;
          name?: string;
          status?: "active" | "archived";
          created_at?: string;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      registration_forms: {
        Row: {
          id: string;
          batch_id: string;
          name: string;
          slug: string;
          email_domain: string;
          status: "active" | "inactive";
          auto_approve: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          batch_id: string;
          name: string;
          slug: string;
          email_domain: string;
          status?: "active" | "inactive";
          auto_approve?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          batch_id?: string;
          name?: string;
          slug?: string;
          email_domain?: string;
          status?: "active" | "inactive";
          auto_approve?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      hostels: {
        Row: {
          id: string;
          name: string;
          status: "active" | "inactive";
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          status?: "active" | "inactive";
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          status?: "active" | "inactive";
          created_at?: string;
        };
        Relationships: [];
      };
      gates: {
        Row: {
          id: string;
          name: string;
          location: string | null;
          status: "active" | "inactive";
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          location?: string | null;
          status?: "active" | "inactive";
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          location?: string | null;
          status?: "active" | "inactive";
          created_at?: string;
        };
        Relationships: [];
      };
      security_gate_assignments: {
        Row: {
          id: string;
          security_user_id: string;
          gate_id: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          security_user_id: string;
          gate_id: string;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          security_user_id?: string;
          gate_id?: string;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      student_qr_codes: {
        Row: {
          id: string;
          student_id: string;
          token: string;
          status: "active" | "revoked";
          created_at: string;
          expires_at: string | null;
        };
        Insert: {
          id?: string;
          student_id: string;
          token: string;
          status?: "active" | "revoked";
          created_at?: string;
          expires_at?: string | null;
        };
        Update: {
          id?: string;
          student_id?: string;
          token?: string;
          status?: "active" | "revoked";
          created_at?: string;
          expires_at?: string | null;
        };
        Relationships: [];
      };
      entry_exit_logs: {
        Row: {
          id: string;
          student_id: string;
          gate_id: string;
          action: "ENTRY" | "EXIT";
          timestamp: string;
          recorded_by: string | null;
          verification_method: string;
          device_id: string | null;
          is_admin_override: boolean;
          remarks: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          gate_id: string;
          action: "ENTRY" | "EXIT";
          timestamp?: string;
          recorded_by?: string | null;
          verification_method?: string;
          device_id?: string | null;
          is_admin_override?: boolean;
          remarks?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          gate_id?: string;
          action?: "ENTRY" | "EXIT";
          timestamp?: string;
          recorded_by?: string | null;
          verification_method?: string;
          device_id?: string | null;
          is_admin_override?: boolean;
          remarks?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entry_exit_logs_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entry_exit_logs_gate_id_fkey";
            columns: ["gate_id"];
            isOneToOne: false;
            referencedRelation: "gates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entry_exit_logs_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_student_campus_status: {
        Args: { p_student_id?: string; p_day?: string };
        Returns: string;
      };
      get_campus_summary: {
        Args: { p_day?: string };
        Returns: Json;
      };
      get_campus_status_board: {
        Args: { p_day?: string; p_status?: string; p_search?: string; p_batch?: string };
        Returns: {
          student_id: string;
          full_name: string;
          roll_number: string | null;
          batch: string | null;
          section: string | null;
          hostel: string | null;
          room_number: string | null;
          campus_status: string;
          last_action: string | null;
          last_gate_id: string | null;
          last_gate_name: string | null;
          last_activity: string | null;
        }[];
      };
      get_public_registration_form: {
        Args: { p_slug: string };
        Returns: Json;
      };
      check_student_registration: {
        Args: { p_slug: string; p_email: string; p_serial: string };
        Returns: Json;
      };
      archive_batch: {
        Args: { p_batch_id: string };
        Returns: Json;
      };
      delete_batch_permanently: {
        Args: { p_batch_id: string; p_confirmation: string };
        Returns: Json;
      };
      delete_student: {
        Args: { p_student_id: string; p_confirmation: string };
        Returns: Json;
      };
      lookup_student_by_qr: {
        Args: { p_qr_token: string };
        Returns: Json;
      };
      lookup_student_by_roll: {
        Args: { p_roll_number: string };
        Returns: Json;
      };
      record_campus_movement: {
        Args: { p_qr_token: string; p_device_id?: string };
        Returns: Json;
      };
      record_campus_movement_manual: {
        Args: { p_roll_number: string; p_action: string; p_device_id?: string };
        Returns: Json;
      };
      admin_correct_movement: {
        Args: {
          p_student_id: string;
          p_gate_id: string;
          p_action: string;
          p_remarks: string;
        };
        Returns: Json;
      };
      regenerate_student_qr: {
        Args: { p_student_id?: string };
        Returns: Json;
      };
      get_my_assigned_gate: {
        Args: Record<string, never>;
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Batch = Database["public"]["Tables"]["batches"]["Row"];
export type RegistrationForm = Database["public"]["Tables"]["registration_forms"]["Row"];
export type Hostel = Database["public"]["Tables"]["hostels"]["Row"];
export type Gate = Database["public"]["Tables"]["gates"]["Row"];
export type EntryExitLog = Database["public"]["Tables"]["entry_exit_logs"]["Row"];
export type StudentQrCode = Database["public"]["Tables"]["student_qr_codes"]["Row"];
export type SecurityGateAssignment =
  Database["public"]["Tables"]["security_gate_assignments"]["Row"];

export type CampusBoardRow =
  Database["public"]["Functions"]["get_campus_status_board"]["Returns"][number];

export type CampusSummary = {
  day: string;
  total_students: number;
  inside: number;
  outside: number;
  unknown: number;
  entries_today: number;
  exits_today: number;
};
