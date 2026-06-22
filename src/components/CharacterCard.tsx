import type { Character, UserCustomCard } from '../lib/database.types'
import { detectTone, TONE_STYLES } from '../lib/tones'

// Core-card props (existing usage in StudyPage learn mode)
interface CoreProps {
  character: Character
  showFull: boolean
  customCard?: never
}

// Custom-card props (add-card preview, manage cards, review queue)
interface CustomProps {
  customCard: UserCustomCard
  showFull: boolean
  character?: never
}

type Props = CoreProps | CustomProps

function resolveDisplay(props: Props) {
  if (props.character) {
    const c = props.character
    return {
      text: c.char,
      pinyin: c.pinyin,
      meaning: c.meaning,
      radical: c.radical as string | null,
      radical_pinyin: c.radical_pinyin as string | null,
      radical_meaning: c.radical_meaning as string | null,
      mnemonic: c.mnemonic,
      mnemonic_type: c.mnemonic_type as 'C' | 'H' | null,
      example: c.example,
      example_pinyin: c.example_pinyin,
      example_english: c.example_english,
      is_phrase: false,
    }
  }
  const c = props.customCard
  return {
    text: c.text,
    pinyin: c.pinyin,
    meaning: c.meaning,
    radical: c.radical,
    radical_pinyin: c.radical_pinyin,
    radical_meaning: c.radical_meaning,
    mnemonic: c.mnemonic,
    mnemonic_type: null as 'C' | 'H' | null,
    example: c.example,
    example_pinyin: c.example_pinyin,
    example_english: c.example_english,
    is_phrase: c.is_phrase,
  }
}

export default function CharacterCard(props: Props) {
  const d = resolveDisplay(props)
  const { showFull } = props

  // Tone colour only for single characters; phrases use off-white (tone 0)
  const tone = (!d.is_phrase && !d.pinyin.includes('/'))
    ? detectTone(d.pinyin)
    : 0
  const style = showFull ? TONE_STYLES[tone] : TONE_STYLES[0]

  function speak() {
    if (!window.speechSynthesis) return
    const utt = new SpeechSynthesisUtterance(d.text)
    utt.lang = 'zh-CN'
    window.speechSynthesis.speak(utt)
  }

  return (
    <div className={`rounded-3xl border-2 transition-colors duration-300 ${style.card} w-full`}>
      {/* ── Hanzi / text face ───────────────────────────────────────────────── */}
      <div className="flex flex-col items-center pt-10 pb-6 px-6">
        <span
          className={`font-cjk font-bold leading-none select-none transition-colors duration-300 ${style.hanzi}`}
          style={{ fontSize: d.text.length > 2 ? '4rem' : '7rem' }}
        >
          {d.text}
        </span>

        <button
          onClick={speak}
          aria-label="Play pronunciation"
          className={`mt-4 p-2 rounded-full transition-colors ${
            showFull
              ? 'text-current opacity-50 hover:opacity-100'
              : 'text-muted hover:text-accent'
          }`}
        >
          <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
          </svg>
        </button>
      </div>

      {/* ── Answer panel ────────────────────────────────────────────────────── */}
      {showFull && (
        <div className="border-t border-current border-opacity-10 px-6 pb-8 pt-5 space-y-4">
          {/* Pinyin + tone label */}
          <div className="flex items-center justify-between">
            <span className={`text-2xl font-semibold font-cjk ${style.hanzi}`}>
              {d.pinyin}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${style.badge} ${style.badgeText}`}>
              {style.label}
            </span>
          </div>

          {/* Meaning */}
          <p className="text-base text-ink leading-snug">{d.meaning}</p>

          {/* Radical — only when present */}
          {d.radical && (
            <div className="rounded-xl bg-white/60 px-4 py-3 text-sm">
              <span className="text-muted font-medium">Radical </span>
              <span className="font-cjk font-bold text-ink">{d.radical}</span>
              <span className="text-muted">
                {' '}({d.radical_pinyin}) — {d.radical_meaning}
              </span>
            </div>
          )}

          {/* Mnemonic */}
          <div className="rounded-xl bg-white/60 px-4 py-3 text-sm">
            {d.mnemonic_type && (
              <span
                className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded mr-1.5 mb-1 ${
                  d.mnemonic_type === 'C'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {d.mnemonic_type === 'C' ? 'Component' : 'Hook'}
              </span>
            )}
            <span className="text-ink">{d.mnemonic}</span>
          </div>

          {/* Example sentence */}
          {d.example && (
            <div className="rounded-xl bg-white/60 px-4 py-3 text-sm space-y-1">
              <span className="text-muted font-medium text-xs uppercase tracking-wide">Example</span>
              <div className="font-cjk font-bold text-ink text-base">
                {d.example.split(d.text).map((part, i, arr) => (
                  <span key={i}>
                    {part}
                    {i < arr.length - 1 && <span className="text-red-600">{d.text}</span>}
                  </span>
                ))}
              </div>
              <div className="text-muted">{d.example_pinyin}</div>
              <div className="text-ink">{d.example_english}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
