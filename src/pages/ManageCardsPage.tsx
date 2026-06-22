import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import CharacterCard from '../components/CharacterCard'
import type { UserCustomCard } from '../lib/database.types'

type View = 'list' | 'edit' | 'confirm-delete'

export default function ManageCardsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [cards, setCards] = useState<UserCustomCard[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<UserCustomCard | null>(null)
  const [editDraft, setEditDraft] = useState<UserCustomCard | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (user) loadCards()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadCards() {
    setLoading(true)
    const { data } = await supabase
      .from('user_custom_cards')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
    setCards((data as UserCustomCard[]) ?? [])
    setLoading(false)
  }

  function openEdit(card: UserCustomCard) {
    setSelected(card)
    setEditDraft({ ...card })
    setView('edit')
  }

  function openDelete(card: UserCustomCard) {
    setSelected(card)
    setView('confirm-delete')
  }

  async function handleSaveEdit() {
    if (!editDraft || !user) return
    setSaving(true)
    const { error } = await supabase
      .from('user_custom_cards')
      .update({
        text: editDraft.text,
        pinyin: editDraft.pinyin,
        meaning: editDraft.meaning,
        radical: editDraft.radical,
        radical_pinyin: editDraft.radical_pinyin,
        radical_meaning: editDraft.radical_meaning,
        mnemonic: editDraft.mnemonic,
        example: editDraft.example,
        example_pinyin: editDraft.example_pinyin,
        example_english: editDraft.example_english,
        is_phrase: editDraft.is_phrase,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editDraft.id)
      .eq('user_id', user.id)

    setSaving(false)
    if (!error) {
      await loadCards()
      setView('list')
    }
  }

  async function handleDelete() {
    if (!selected || !user) return
    setDeleting(true)
    await supabase
      .from('user_custom_cards')
      .delete()
      .eq('id', selected.id)
      .eq('user_id', user.id)
    setDeleting(false)
    await loadCards()
    setView('list')
  }

  // ── List view ─────────────────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <div className="min-h-screen bg-bg">
        <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
            <button
              onClick={() => navigate('/')}
              className="text-muted hover:text-ink transition-colors flex items-center gap-1 text-sm"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Dashboard
            </button>
            <span className="text-xs font-medium text-muted uppercase tracking-wider">My cards</span>
            <button
              onClick={() => navigate('/add-card')}
              className="text-sm text-accent hover:text-accent-hover font-medium transition-colors"
            >
              + Add
            </button>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted text-sm">Loading…</div>
          ) : cards.length === 0 ? (
            <div className="text-center py-20 space-y-4">
              <div className="text-4xl">📭</div>
              <div className="text-lg font-semibold text-ink">No custom cards yet</div>
              <p className="text-sm text-muted">Add characters, words, or phrases beyond the core 500.</p>
              <button
                onClick={() => navigate('/add-card')}
                className="mt-2 px-6 py-2.5 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                Add your first card
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-cjk font-bold text-xl text-ink shrink-0">{card.text}</span>
                    <div className="min-w-0">
                      <div className="text-sm text-muted truncate">{card.pinyin}</div>
                      <div className="text-sm text-ink truncate">{card.meaning}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {card.is_phrase && (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">phrase</span>
                    )}
                    <button
                      onClick={() => openEdit(card)}
                      className="text-xs text-muted hover:text-ink px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => openDelete(card)}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    )
  }

  // ── Edit view ─────────────────────────────────────────────────────────────

  if (view === 'edit' && editDraft) {
    return (
      <div className="min-h-screen bg-bg">
        <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
            <button
              onClick={() => setView('list')}
              className="text-muted hover:text-ink transition-colors flex items-center gap-1 text-sm"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              My cards
            </button>
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Edit card</span>
            <div className="w-12" />
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            {([
              ['Text', 'text'],
              ['Pinyin', 'pinyin'],
              ['Meaning', 'meaning'],
              ['Radical', 'radical'],
              ['Radical pinyin', 'radical_pinyin'],
              ['Radical meaning', 'radical_meaning'],
              ['Mnemonic', 'mnemonic'],
              ['Example', 'example'],
              ['Example pinyin', 'example_pinyin'],
              ['Example English', 'example_english'],
            ] as [string, keyof UserCustomCard][]).map(([label, key]) => (
              <div key={key}>
                <label className="text-xs text-muted font-medium">{label}</label>
                <input
                  type="text"
                  value={(editDraft[key] as string) ?? ''}
                  onChange={(e) => setEditDraft({ ...editDraft, [key]: e.target.value || null })}
                  className="w-full mt-0.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-ink focus:outline-none focus:border-accent bg-white"
                />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit_is_phrase"
                checked={editDraft.is_phrase}
                onChange={(e) => setEditDraft({ ...editDraft, is_phrase: e.target.checked })}
                className="accent-accent"
              />
              <label htmlFor="edit_is_phrase" className="text-sm text-ink">Multi-character phrase</label>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted font-medium mb-2 uppercase tracking-wide">Preview</p>
            <CharacterCard customCard={editDraft} showFull />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setView('list')}
              disabled={saving}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-ink hover:border-gray-300 transition-colors bg-white disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className="flex-1 py-3 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white font-medium rounded-xl transition-colors text-sm"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>

          <p className="text-xs text-muted text-center">Editing content does not reset your review progress for this card.</p>
        </main>
      </div>
    )
  }

  // ── Delete confirmation ───────────────────────────────────────────────────

  if (view === 'confirm-delete' && selected) {
    return (
      <div className="min-h-screen bg-bg flex flex-col">
        <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
            <button
              onClick={() => setView('list')}
              className="text-muted hover:text-ink transition-colors flex items-center gap-1 text-sm"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Cancel
            </button>
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Delete card</span>
            <div className="w-12" />
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-12 flex flex-col items-center text-center space-y-4">
          <div className="text-5xl font-cjk font-bold text-ink">{selected.text}</div>
          <div className="text-lg font-semibold text-ink">Delete this card?</div>
          <p className="text-sm text-muted max-w-xs">
            This will permanently delete "{selected.text}" and all its review history. Your progress for this card will be lost and cannot be recovered.
          </p>
          <div className="flex gap-3 pt-4 w-full max-w-xs">
            <button
              onClick={() => setView('list')}
              disabled={deleting}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-ink hover:border-gray-300 transition-colors bg-white"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white font-medium rounded-xl transition-colors text-sm"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </main>
      </div>
    )
  }

  return null
}
