export interface Database {
  public: {
    Tables: {
      characters: {
        Row: {
          id: number
          char: string
          pinyin: string
          meaning: string
          radical: string
          radical_pinyin: string
          radical_meaning: string
          mnemonic: string
          mnemonic_type: 'C' | 'H'
          example: string | null
          example_pinyin: string | null
          example_english: string | null
        }
        Insert: never
        Update: never
      }
      user_cards: {
        Row: {
          id: string
          user_id: string
          character_id: number
          stability: number
          difficulty: number
          elapsed_days: number
          scheduled_days: number
          reps: number
          lapses: number
          state: number
          due: string
          last_review: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['user_cards']['Row'], 'id' | 'created_at'>
        Update: Partial<Omit<Database['public']['Tables']['user_cards']['Row'], 'id' | 'user_id' | 'character_id' | 'created_at'>>
      }
      review_log: {
        Row: {
          id: string
          user_id: string
          character_id: number
          rating: number
          reviewed_at: string
          state_before: Record<string, unknown> | null
          state_after: Record<string, unknown> | null
        }
        Insert: Omit<Database['public']['Tables']['review_log']['Row'], 'id' | 'reviewed_at'>
      }
      user_progress: {
        Row: {
          user_id: string
          daily_new_card_limit: number
          timezone: string
          created_at: string
        }
        Insert: Pick<Database['public']['Tables']['user_progress']['Row'], 'user_id' | 'daily_new_card_limit' | 'timezone'>
        Update: Partial<Pick<Database['public']['Tables']['user_progress']['Row'], 'daily_new_card_limit' | 'timezone'>>
      }
    }
  }
}

export type Character = Database['public']['Tables']['characters']['Row']
export type UserCard = Database['public']['Tables']['user_cards']['Row']
export type ReviewLog = Database['public']['Tables']['review_log']['Row']
export type UserProgress = Database['public']['Tables']['user_progress']['Row']
