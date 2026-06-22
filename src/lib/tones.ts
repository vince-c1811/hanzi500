export type Tone = 0 | 1 | 2 | 3 | 4  // 0 = neutral

const TONE_MARKS: Record<string, Tone> = {
  'ā': 1, 'Ā': 1, 'ē': 1, 'Ē': 1, 'ī': 1, 'Ī': 1,
  'ō': 1, 'Ō': 1, 'ū': 1, 'Ū': 1, 'ǖ': 1, 'Ǖ': 1,
  'á': 2, 'Á': 2, 'é': 2, 'É': 2, 'í': 2, 'Í': 2,
  'ó': 2, 'Ó': 2, 'ú': 2, 'Ú': 2, 'ǘ': 2, 'Ǘ': 2,
  'ǎ': 3, 'Ǎ': 3, 'ě': 3, 'Ě': 3, 'ǐ': 3, 'Ǐ': 3,
  'ǒ': 3, 'Ǒ': 3, 'ǔ': 3, 'Ǔ': 3, 'ǚ': 3, 'Ǚ': 3,
  'à': 4, 'À': 4, 'è': 4, 'È': 4, 'ì': 4, 'Ì': 4,
  'ò': 4, 'Ò': 4, 'ù': 4, 'Ù': 4, 'ǜ': 4, 'Ǜ': 4,
}

export function detectTone(pinyin: string): Tone {
  // Use first reading only (before '/')
  const firstReading = pinyin.split('/')[0]
  for (const ch of firstReading) {
    const tone = TONE_MARKS[ch]
    if (tone) return tone
  }
  return 0
}

export interface ToneStyle {
  card: string      // card background + border
  hanzi: string     // hanzi text colour
  badge: string     // pinyin pill
  badgeText: string
  label: string     // human name
}

export const TONE_STYLES: Record<Tone, ToneStyle> = {
  0: {
    card: 'bg-[#FAFAF8] border-gray-200 shadow-md',
    hanzi: 'text-ink',
    badge: 'bg-gray-100',
    badgeText: 'text-gray-600',
    label: 'Neutral',
  },
  1: {
    card: 'bg-orange-50 border-orange-200 shadow-orange-100 shadow-md',
    hanzi: 'text-orange-700',
    badge: 'bg-orange-100',
    badgeText: 'text-orange-700',
    label: 'Tone 1 — high',
  },
  2: {
    card: 'bg-sky-50 border-sky-200 shadow-sky-100 shadow-md',
    hanzi: 'text-sky-700',
    badge: 'bg-sky-100',
    badgeText: 'text-sky-700',
    label: 'Tone 2 — rising',
  },
  3: {
    card: 'bg-indigo-50 border-indigo-200 shadow-indigo-100 shadow-md',
    hanzi: 'text-indigo-700',
    badge: 'bg-indigo-100',
    badgeText: 'text-indigo-700',
    label: 'Tone 3 — falling-rising',
  },
  4: {
    card: 'bg-gray-100 border-gray-300 shadow-gray-200 shadow-md',
    hanzi: 'text-gray-700',
    badge: 'bg-gray-200',
    badgeText: 'text-gray-600',
    label: 'Tone 4 — falling',
  },
}
