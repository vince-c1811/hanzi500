import type { Character } from '../lib/database.types'
import { detectTone, TONE_STYLES } from '../lib/tones'

interface Props {
  character: Character
  showFull: boolean
}

export default function CharacterCard({ character, showFull }: Props) {
  const tone = detectTone(character.pinyin)
  const style = showFull ? TONE_STYLES[tone] : TONE_STYLES[0]

  function speak() {
    if (!window.speechSynthesis) return
    const utt = new SpeechSynthesisUtterance(character.char)
    utt.lang = 'zh-CN'
    window.speechSynthesis.speak(utt)
  }

  return (
    <div className={`rounded-3xl border-2 transition-colors duration-300 ${style.card} w-full`}>
      {/* ── Hanzi face ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center pt-10 pb-6 px-6">
        <span
          className={`font-cjk font-bold leading-none select-none transition-colors duration-300 ${style.hanzi}`}
          style={{ fontSize: '7rem' }}
        >
          {character.char}
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

      {/* ── Answer panel ───────────────────────────────────────────────────── */}
      {showFull && (
        <div className="border-t border-current border-opacity-10 px-6 pb-8 pt-5 space-y-4">
          {/* Pinyin + tone label */}
          <div className="flex items-center justify-between">
            <span className={`text-2xl font-semibold font-cjk ${style.hanzi}`}>
              {character.pinyin}
            </span>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${style.badge} ${style.badgeText}`}>
              {style.label}
            </span>
          </div>

          {/* Meaning */}
          <p className="text-base text-ink leading-snug">{character.meaning}</p>

          {/* Radical */}
          <div className="rounded-xl bg-white/60 px-4 py-3 text-sm">
            <span className="text-muted font-medium">Radical </span>
            <span className="font-cjk font-bold text-ink">{character.radical}</span>
            <span className="text-muted">
              {' '}({character.radical_pinyin}) — {character.radical_meaning}
            </span>
          </div>

          {/* Mnemonic */}
          <div className="rounded-xl bg-white/60 px-4 py-3 text-sm">
            <span
              className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded mr-1.5 mb-1 ${
                character.mnemonic_type === 'C'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {character.mnemonic_type === 'C' ? 'Component' : 'Hook'}
            </span>
            <span className="text-ink">{character.mnemonic}</span>
          </div>
        </div>
      )}
    </div>
  )
}
