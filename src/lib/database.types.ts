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
      user_custom_cards: {
        Row: {
          id: string
          user_id: string
          text: string
          pinyin: string
          meaning: string
          radical: string | null
          radical_pinyin: string | null
          radical_meaning: string | null
          mnemonic: string
          example: string
          example_pinyin: string
          example_english: string
          is_phrase: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['user_custom_cards']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Pick<Database['public']['Tables']['user_custom_cards']['Row'],
          'text' | 'pinyin' | 'meaning' | 'radical' | 'radical_pinyin' | 'radical_meaning' |
          'mnemonic' | 'example' | 'example_pinyin' | 'example_english' | 'is_phrase' | 'updated_at'>>
      }
      user_cards: {
        Row: {
          id: string
          user_id: string
          character_id: number | null
          custom_card_id: string | null
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
        Update: Partial<Omit<Database['public']['Tables']['user_cards']['Row'], 'id' | 'user_id' | 'created_at'>>
      }
      review_log: {
        Row: {
          id: string
          user_id: string
          character_id: number | null
          custom_card_id: string | null
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
export type UserCustomCard = Database['public']['Tables']['user_custom_cards']['Row']
export type UserCard = Database['public']['Tables']['user_cards']['Row']
export type ReviewLog = Database['public']['Tables']['review_log']['Row']
export type UserProgress = Database['public']['Tables']['user_progress']['Row']

// A unified card shape for the review renderer — either source
export interface ReviewItem {
  userCard: UserCard
  // Exactly one of these is set
  character: Character | null
  customCard: UserCustomCard | null
  // Derived display fields (normalised from whichever source is set)
  display: {
    text: string          // char (core) or text (custom)
    pinyin: string
    meaning: string
    radical: string | null
    radical_pinyin: string | null
    radical_meaning: string | null
    mnemonic: string
    mnemonic_type: 'C' | 'H' | null
    example: string | null
    example_pinyin: string | null
    example_english: string | null
    is_phrase: boolean
  }
}

export function toReviewItem(userCard: UserCard, character: Character | null, customCard: UserCustomCard | null): ReviewItem {
  if (character) {
    return {
      userCard,
      character,
      customCard: null,
      display: {
        text: character.char,
        pinyin: character.pinyin,
        meaning: character.meaning,
        radical: character.radical,
        radical_pinyin: character.radical_pinyin,
        radical_meaning: character.radical_meaning,
        mnemonic: character.mnemonic,
        mnemonic_type: character.mnemonic_type,
        example: character.example,
        example_pinyin: character.example_pinyin,
        example_english: character.example_english,
        is_phrase: false,
      },
    }
  }
  if (customCard) {
    return {
      userCard,
      character: null,
      customCard,
      display: {
        text: customCard.text,
        pinyin: customCard.pinyin,
        meaning: customCard.meaning,
        radical: customCard.radical,
        radical_pinyin: customCard.radical_pinyin,
        radical_meaning: customCard.radical_meaning,
        mnemonic: customCard.mnemonic,
        mnemonic_type: null,
        example: customCard.example,
        example_pinyin: customCard.example_pinyin,
        example_english: customCard.example_english,
        is_phrase: customCard.is_phrase,
      },
    }
  }
  throw new Error('toReviewItem: both character and customCard are null')
}
