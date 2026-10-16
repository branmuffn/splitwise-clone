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
        Row: { id: string; email: string; display_name: string; default_currency: string; created_at: string };
        Insert: never;
        Update: { display_name?: string; default_currency?: string };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          join_code: string;
          created_by: string;
          default_currency: string;
          simplify_debts: boolean;
          created_at: string;
        };
        Insert: never;
        Update: { name?: string; default_currency?: string; simplify_debts?: boolean };
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
          currency: string;
          paid_by: string;
          category: string;
          notes: string | null;
          expense_date: string;
          split_type: "equal" | "exact" | "percent" | "shares";
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: never; // use the save_expense RPC
        Update: never;
        Relationships: [
          Rel<"expenses_group_id_fkey", "group_id", "groups">,
          Rel<"expenses_paid_by_fkey", "paid_by", "profiles">,
          Rel<"expenses_created_by_fkey", "created_by", "profiles">,
        ];
      };
      expense_splits: {
        Row: { expense_id: string; group_id: string; user_id: string; share_cents: number };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_group_id_fkey";
            columns: ["expense_id", "group_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id", "group_id"];
          },
          Rel<"expense_splits_user_id_fkey", "user_id", "profiles">,
        ];
      };
      payments: {
        Row: {
          id: string;
          group_id: string;
          from_user: string;
          to_user: string;
          amount_cents: number;
          currency: string;
          note: string | null;
          paid_on: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          group_id: string;
          from_user: string;
          to_user: string;
          amount_cents: number;
          currency: string;
          note?: string | null;
          paid_on?: string;
        };
        Update: never;
        Relationships: [Rel<"payments_group_id_fkey", "group_id", "groups">];
      };
      activity: {
        Row: {
          id: number;
          group_id: string;
          actor_id: string | null;
          kind: string;
          details: Record<string, string | number | null>;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [Rel<"activity_group_id_fkey", "group_id", "groups">];
      };
    };
    Views: Record<never, never>;
    Functions: {
      create_group: { Args: { group_name: string; group_currency?: string }; Returns: string };
      join_group: { Args: { code: string }; Returns: string };
      regenerate_join_code: { Args: { gid: string }; Returns: string };
      leave_group: { Args: { gid: string }; Returns: undefined };
      remove_member: { Args: { gid: string; uid: string }; Returns: undefined };
      save_expense: {
        Args: {
          p_expense_id: string | null;
          p_group_id: string;
          p_description: string;
          p_amount_cents: number;
          p_currency: string;
          p_paid_by: string;
          p_category: string;
          p_notes: string | null;
          p_expense_date: string;
          p_split_type: string;
          p_splits: { user_id: string; share_cents: number }[];
        };
        Returns: string;
      };
      is_group_member: { Args: { gid: string }; Returns: boolean };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
