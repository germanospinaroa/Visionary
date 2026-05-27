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
    PostgrestVersion: "14.5"
  }
  pilot: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      answers: {
        Row: {
          confidence: string | null
          created_at: string
          created_by: string | null
          evidence_coordinates: string | null
          evidence_crop_path: string | null
          evidence_image_id: string | null
          evidence_section: string | null
          explanation: string | null
          final_payload: Json
          hallucination_risk: string | null
          id: string
          internal_response: string | null
          no_puedo_responder: boolean
          no_puedo_responder_reason: string | null
          ocr_evidence: string | null
          question_id: string
          reasoning: Json
          selected_option_label: string | null
          selected_option_text: string | null
          supervisor_rationale: string | null
          supervisor_status: string
          updated_at: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          evidence_coordinates?: string | null
          evidence_crop_path?: string | null
          evidence_image_id?: string | null
          evidence_section?: string | null
          explanation?: string | null
          final_payload?: Json
          hallucination_risk?: string | null
          id?: string
          internal_response?: string | null
          no_puedo_responder?: boolean
          no_puedo_responder_reason?: string | null
          ocr_evidence?: string | null
          question_id: string
          reasoning?: Json
          selected_option_label?: string | null
          selected_option_text?: string | null
          supervisor_rationale?: string | null
          supervisor_status?: string
          updated_at?: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          evidence_coordinates?: string | null
          evidence_crop_path?: string | null
          evidence_image_id?: string | null
          evidence_section?: string | null
          explanation?: string | null
          final_payload?: Json
          hallucination_risk?: string | null
          id?: string
          internal_response?: string | null
          no_puedo_responder?: boolean
          no_puedo_responder_reason?: string | null
          ocr_evidence?: string | null
          question_id?: string
          reasoning?: Json
          selected_option_label?: string | null
          selected_option_text?: string | null
          supervisor_rationale?: string | null
          supervisor_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_evidence_image_id_fkey"
            columns: ["evidence_image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      browser_events: {
        Row: {
          created_at: string
          details: Json
          event_type: string
          id: string
          level: string
          message: string
          screenshot_bucket: string | null
          screenshot_path: string | null
          survey_run_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          level?: string
          message: string
          screenshot_bucket?: string | null
          screenshot_path?: string | null
          survey_run_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          level?: string
          message?: string
          screenshot_bucket?: string | null
          screenshot_path?: string | null
          survey_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "browser_events_survey_run_id_fkey"
            columns: ["survey_run_id"]
            isOneToOne: false
            referencedRelation: "survey_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      human_reviews: {
        Row: {
          action: string
          answer_id: string
          corrected_option_label: string | null
          corrected_option_text: string | null
          created_at: string
          id: string
          reason: string | null
          reviewer_user_id: string | null
        }
        Insert: {
          action: string
          answer_id: string
          corrected_option_label?: string | null
          corrected_option_text?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          reviewer_user_id?: string | null
        }
        Update: {
          action?: string
          answer_id?: string
          corrected_option_label?: string | null
          corrected_option_text?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          reviewer_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "human_reviews_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
        ]
      }
      images: {
        Row: {
          created_at: string
          created_by: string | null
          crops: Json
          id: string
          image_role: string
          metadata: Json
          ocr_regions: Json
          product_candidate_zones: Json
          quality_score: number | null
          section_estimates: Json
          source_url: string | null
          storage_bucket: string
          storage_path: string
          survey_run_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          crops?: Json
          id?: string
          image_role: string
          metadata?: Json
          ocr_regions?: Json
          product_candidate_zones?: Json
          quality_score?: number | null
          section_estimates?: Json
          source_url?: string | null
          storage_bucket: string
          storage_path: string
          survey_run_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          crops?: Json
          id?: string
          image_role?: string
          metadata?: Json
          ocr_regions?: Json
          product_candidate_zones?: Json
          quality_score?: number | null
          section_estimates?: Json
          source_url?: string | null
          storage_bucket?: string
          storage_path?: string
          survey_run_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "images_survey_run_id_fkey"
            columns: ["survey_run_id"]
            isOneToOne: false
            referencedRelation: "survey_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          clarifications: Json
          created_at: string
          created_by: string | null
          detected_question: string | null
          id: string
          instructions: Json
          options: Json
          question_index: number
          question_type: string
          registry_metadata: Json
          screenshot_bucket: string | null
          screenshot_path: string | null
          status: string
          survey_run_id: string
          updated_at: string
        }
        Insert: {
          clarifications?: Json
          created_at?: string
          created_by?: string | null
          detected_question?: string | null
          id?: string
          instructions?: Json
          options?: Json
          question_index: number
          question_type?: string
          registry_metadata?: Json
          screenshot_bucket?: string | null
          screenshot_path?: string | null
          status?: string
          survey_run_id: string
          updated_at?: string
        }
        Update: {
          clarifications?: Json
          created_at?: string
          created_by?: string | null
          detected_question?: string | null
          id?: string
          instructions?: Json
          options?: Json
          question_index?: number
          question_type?: string
          registry_metadata?: Json
          screenshot_bucket?: string | null
          screenshot_path?: string | null
          status?: string
          survey_run_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_survey_run_id_fkey"
            columns: ["survey_run_id"]
            isOneToOne: false
            referencedRelation: "survey_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          metadata: Json
          status: string
          store_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json
          status?: string
          store_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json
          status?: string
          store_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      survey_runs: {
        Row: {
          browser_config: Json
          browser_session_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_question_index: number | null
          current_question_text: string | null
          current_screenshot_bucket: string | null
          current_screenshot_path: string | null
          current_screenshot_updated_at: string | null
          current_step: string | null
          error_screenshot_bucket: string | null
          error_screenshot_path: string | null
          final_code: string | null
          id: string
          last_error_code: string | null
          last_heartbeat_at: string | null
          last_reasoning_summary: string | null
          last_selected_option_text: string | null
          last_supervisor_decision: string | null
          run_metadata: Json
          started_at: string | null
          status: string
          store_id: string
          survey_url: string | null
          updated_at: string
          validator_code: string | null
        }
        Insert: {
          browser_config?: Json
          browser_session_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_question_index?: number | null
          current_question_text?: string | null
          current_screenshot_bucket?: string | null
          current_screenshot_path?: string | null
          current_screenshot_updated_at?: string | null
          current_step?: string | null
          error_screenshot_bucket?: string | null
          error_screenshot_path?: string | null
          final_code?: string | null
          id?: string
          last_error_code?: string | null
          last_heartbeat_at?: string | null
          last_reasoning_summary?: string | null
          last_selected_option_text?: string | null
          last_supervisor_decision?: string | null
          run_metadata?: Json
          started_at?: string | null
          status?: string
          store_id: string
          survey_url?: string | null
          updated_at?: string
          validator_code?: string | null
        }
        Update: {
          browser_config?: Json
          browser_session_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_question_index?: number | null
          current_question_text?: string | null
          current_screenshot_bucket?: string | null
          current_screenshot_path?: string | null
          current_screenshot_updated_at?: string | null
          current_step?: string | null
          error_screenshot_bucket?: string | null
          error_screenshot_path?: string | null
          final_code?: string | null
          id?: string
          last_error_code?: string | null
          last_heartbeat_at?: string | null
          last_reasoning_summary?: string | null
          last_selected_option_text?: string | null
          last_supervisor_decision?: string | null
          run_metadata?: Json
          started_at?: string | null
          status?: string
          store_id?: string
          survey_url?: string | null
          updated_at?: string
          validator_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_runs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
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
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
  pilot: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
