// Hand-written to match supabase/schema.sql.
type Rel<FK extends string, Col extends string, Ref extends string> = {
  foreignKeyName: FK;
  columns: [Col];
  isOneToOne: false;
  referencedRelation: Ref;
  referencedColumns: ["id"];
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; email: string; display_name: string; created_at: string };
        Insert: { id: string; email: string; display_name: string; created_at?: string };
        Update: { display_name?: string };
        Relationships: [];
      };
      groups: {
        Row: { id: string; name: string; join_code: string; created_by: string; created_at: string };
        Insert: never;
        Update: { name?: string };
        Relationships: [Rel<"groups_created_by_fkey", "created_by", "profiles">];
      };
      group_members: {
        Row: { group_id: string; user_id: string; joined_at: string };
        Insert: never;
        Update: never;
        Relationships: [
          Rel<"group_members_group_id_fkey", "group_id", "groups">,
          Rel<"group_members_user_id_fkey", "user_id", "profiles">,
        ];
      };
      expenses: {
        Row: {
          id: string;
          group_id: string;
          description: string;
          amount_cents: number;
          paid_by: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          group_id: string;
          description: string;
          amount_cents: number;
          paid_by: string;
          created_by?: string;
        };
        Update: { description?: string; amount_cents?: number; paid_by?: string };
        Relationships: [
          Rel<"expenses_group_id_fkey", "group_id", "groups">,
          Rel<"expenses_paid_by_fkey", "paid_by", "profiles">,
          Rel<"expenses_created_by_fkey", "created_by", "profiles">,
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_group: { Args: { group_name: string }; Returns: string };
      join_group: { Args: { code: string }; Returns: string };
      is_group_member: { Args: { gid: string }; Returns: boolean };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
