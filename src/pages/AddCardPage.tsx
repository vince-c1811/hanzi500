import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import CharacterCard from '../components/CharacterCard'
import { newCard, cardToDbFields } from '../lib/fsrs'
import type { UserCustomCard } from '../lib/database.types'

interface Proposed {
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
}

type Step = 'input' | 'loading' | 'preview' | 'saving' | 'done'

export default function AddCardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('input')
  const [inputText, setInputText] = useState('')
  const [proposed, setProposed] = useState<Proposed | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [dupMsg, setDupMsg] = useState<string | null>(null)
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!inputText.trim() || !user) return
    setStep('loading')
    setErrorMsg(null)
    setDupMsg(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-custom-card`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ input: inputText }),
        }
      )
      const json = await res.json()

      if (json.error) {
        setErrorMsg(json.message ?? 'Something went wrong. Please try again.')
        setStep('input')
        return
      }

      setProposed(json.proposed)
      setStep('preview')
    } catch {
      setErrorMsg('Network error. Please try again.')
      setStep('input')
    }
  }

  async function handleSave() {
    if (!proposed || !user) return
    setDupMsg(null)

    // Duplicate check: core 500
    const { data: coreMatch } = await supabase
      .from('characters')
      .select('id, char')
      .eq('char', proposed.text)
      .maybeSingle()

    if (coreMatch) {
      setDupMsg(`"${proposed.text}" is already in the core 500 deck.`)
      return
    }

    // Duplicate check: existing custom cards
    const { data: customMatch } = await supabase
      .from('user_custom_cards')
      .select('id, text')
      .eq('user_id', user.id)
      .eq('text', proposed.text)
      .maybeSingle()

    if (customMatch) {
      setDupMsg(`You already have a custom card for "${proposed.text}".`)
      return
    }

    setStep('saving')

    // Insert user_custom_cards row
    const { data: inserted, error: insertErr } = await supabase
      .from('user_custom_cards')
      .insert({
        user_id: user.id,
        text: proposed.text,
        pinyin: proposed.pinyin,
        meaning: proposed.meaning,
        radical: proposed.radical,
        radical_pinyin: proposed.radical_pinyin,
        radical_meaning: proposed.radical_meaning,
        mnemonic: proposed.mnemonic,
        example: proposed.example,
        example_pinyin: proposed.example_pinyin,
        example_english: proposed.example_english,
        is_phrase: proposed.is_phrase,
      })
      .select()
      .single()

    if (insertErr || !inserted) {
      if (insertErr?.code === '23505') {
        setDupMsg(`You already have a custom card for "${proposed.text}".`)
      } else {
        setErrorMsg('Failed to save card. Please try again.')
      }
      setStep('preview')
      return
    }

    // Insert user_cards FSRS row
    const empty = newCard()
    const fsrsFields = cardToDbFields(empty)
    await supabase.from('user_cards').insert({
      user_id: user.id,
      character_id: null,
      custom_card_id: (inserted as UserCustomCard).id,
      ...fsrsFields,
      due: new Date().toISOString(),
    })

    setLastAdded(proposed.text)
    setStep('done')
  }

  function handleAddAnother() {
    setInputText('')
    setProposed(null)
    setErrorMsg(null)
    setDupMsg(null)
    setStep('input')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="text-muted hover:text-ink transition-colors flex items-center gap-1 text-sm"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <span className="text-xs font-medium text-muted uppercase tracking-wider">Add card</span>
          <div className="w-12" />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">

        {/* ── Done state ──────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="text-center py-12 space-y-4">
            <div className="text-5xl">✓</div>
            <div className="text-xl font-semibold text-ink">"{lastAdded}" added to your deck</div>
            <p className="text-sm text-muted">It's in your review queue now.</p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={handleAddAnother}
                className="px-6 py-2.5 border border-gray-200 rounded-xl text-sm text-ink hover:border-gray-300 transition-colors bg-white"
              >
                Add another
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-2.5 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* ── Input / loading ─────────────────────────────────────────────── */}
        {(step === 'input' || step === 'loading') && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Describe a character, word, or phrase to add — in Chinese, pinyin, English, or a mix.
            </p>
            <form onSubmit={handleGenerate} className="space-y-3">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder='e.g. "add a card for 猫 (cat)" or "谢谢"'
                disabled={step === 'loading'}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-ink placeholder-muted focus:outline-none focus:border-accent text-sm bg-white disabled:opacity-50"
              />
              {errorMsg && (
                <p className="text-sm text-red-600">{errorMsg}</p>
              )}
              <button
                type="submit"
                disabled={!inputText.trim() || step === 'loading'}
                className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white font-medium rounded-xl transition-colors text-sm"
              >
                {step === 'loading' ? 'Generating…' : 'Generate card'}
              </button>
            </form>

            <div className="rounded-xl bg-white border border-gray-100 px-4 py-3 text-xs text-muted space-y-1">
              <p className="font-medium text-ink">Examples</p>
              <p>"add a card for 猫 (cat)"</p>
              <p>"谢谢"</p>
              <p>"how do you write thank you"</p>
              <p>"对不起 — sorry/apologise"</p>
            </div>
          </div>
        )}

        {/* ── Preview ─────────────────────────────────────────────────────── */}
        {(step === 'preview' || step === 'saving') && proposed && (
          <div className="space-y-5">
            <p className="text-sm text-muted">Review and edit before adding to your deck.</p>

            {/* Editable fields */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
              {[
                { label: 'Text', key: 'text' as const },
                { label: 'Pinyin', key: 'pinyin' as const },
                { label: 'Meaning', key: 'meaning' as const },
                { label: 'Radical', key: 'radical' as const },
                { label: 'Radical pinyin', key: 'radical_pinyin' as const },
                { label: 'Radical meaning', key: 'radical_meaning' as const },
                { label: 'Mnemonic', key: 'mnemonic' as const },
                { label: 'Example', key: 'example' as const },
                { label: 'Example pinyin', key: 'example_pinyin' as const },
                { label: 'Example English', key: 'example_english' as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="text-xs text-muted font-medium">{label}</label>
                  <input
                    type="text"
                    value={proposed[key] ?? ''}
                    onChange={(e) => setProposed({ ...proposed, [key]: e.target.value || null })}
                    className="w-full mt-0.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-ink focus:outline-none focus:border-accent bg-white"
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_phrase"
                  checked={proposed.is_phrase}
                  onChange={(e) => setProposed({ ...proposed, is_phrase: e.target.checked })}
                  className="accent-accent"
                />
                <label htmlFor="is_phrase" className="text-sm text-ink">Multi-character phrase (hides radical, uses off-white background)</label>
              </div>
            </div>

            {/* Card preview */}
            <div>
              <p className="text-xs text-muted font-medium mb-2 uppercase tracking-wide">Preview</p>
              <CharacterCard
                customCard={{ ...proposed, id: '', user_id: '', created_at: '', updated_at: '' }}
                showFull
              />
            </div>

            {dupMsg && (
              <p className="text-sm text-red-600">{dupMsg}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('input'); setDupMsg(null) }}
                disabled={step === 'saving'}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-ink hover:border-gray-300 transition-colors bg-white disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={step === 'saving'}
                className="flex-1 py-3 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white font-medium rounded-xl transition-colors text-sm"
              >
                {step === 'saving' ? 'Saving…' : 'Add to deck'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
