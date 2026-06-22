import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { Character, UserCard, UserCustomCard } from '../lib/database.types'
import { detectTone, TONE_STYLES } from '../lib/tones'

// ── Types ─────────────────────────────────────────────────────────────────────

type CardStatus = 'not-started' | 'introduced' | 'learning' | 'known'
type FilterType = 'all' | 'not-started' | 'learning' | 'known'
type View = 'list' | 'edit'

interface TileData {
  type: 'core' | 'custom'
  id: string | number
  text: string
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
  status: CardStatus
  customCard?: UserCustomCard
}

const STATUS_DOT: Record<CardStatus, string> = {
  'not-started': 'bg-gray-300',
  'introduced':  'bg-blue-400',
  'learning':    'bg-amber-400',
  'known':       'bg-green-500',
}

const STATUS_LABEL: Record<CardStatus, string> = {
  'not-started': 'Not started',
  'introduced':  'Introduced',
  'learning':    'Learning',
  'known':       'Known',
}

function getStatus(userCard?: UserCard): CardStatus {
  if (!userCard) return 'not-started'
  if (userCard.state === 2) return 'known'
  if (userCard.state === 1 || userCard.state === 3) return 'learning'
  return 'introduced'
}

function matchesFilter(status: CardStatus, filter: FilterType): boolean {
  if (filter === 'all') return true
  if (filter === 'not-started') return status === 'not-started'
  if (filter === 'learning') return status === 'introduced' || status === 'learning'
  if (filter === 'known') return status === 'known'
  return true
}

function charFontSize(text: string): string {
  if (text.length === 1) return 'text-5xl'
  if (text.length === 2) return 'text-3xl'
  return 'text-2xl'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ManageCardsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tiles, setTiles] = useState<TileData[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [sheet, setSheet] = useState<TileData | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [view, setView] = useState<View>('list')
  const [editDraft, setEditDraft] = useState<UserCustomCard | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (user) loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadAll() {
    setLoading(true)

    const [
      { data: charsData },
      { data: customData },
      { data: userCardsData },
    ] = await Promise.all([
      supabase.from('characters').select('*').order('id', { ascending: true }),
      supabase.from('user_custom_cards').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
      supabase.from('user_cards').select('*').eq('user_id', user!.id),
    ])

    const chars = (charsData as Character[]) ?? []
    const customs = (customData as UserCustomCard[]) ?? []
    const userCards = (userCardsData as UserCard[]) ?? []

    const coreMap = new Map<number, UserCard>()
    const customMap = new Map<string, UserCard>()
    for (const uc of userCards) {
      if (uc.character_id !== null) coreMap.set(uc.character_id, uc)
      if (uc.custom_card_id !== null) customMap.set(uc.custom_card_id, uc)
    }

    const customTiles: TileData[] = customs.map((c) => ({
      type: 'custom',
      id: c.id,
      text: c.text,
      pinyin: c.pinyin,
      meaning: c.meaning,
      radical: c.radical,
      radical_pinyin: c.radical_pinyin,
      radical_meaning: c.radical_meaning,
      mnemonic: c.mnemonic,
      mnemonic_type: null,
      example: c.example,
      example_pinyin: c.example_pinyin,
      example_english: c.example_english,
      is_phrase: c.is_phrase,
      status: getStatus(customMap.get(c.id)),
      customCard: c,
    }))

    const coreTiles: TileData[] = chars.map((c) => ({
      type: 'core',
      id: c.id,
      text: c.char,
      pinyin: c.pinyin,
      meaning: c.meaning,
      radical: c.radical,
      radical_pinyin: c.radical_pinyin,
      radical_meaning: c.radical_meaning,
      mnemonic: c.mnemonic,
      mnemonic_type: c.mnemonic_type,
      example: c.example,
      example_pinyin: c.example_pinyin,
      example_english: c.example_english,
      is_phrase: false,
      status: getStatus(coreMap.get(c.id as number)),
    }))

    setTiles([...customTiles, ...coreTiles])
    setLoading(false)
  }

  // ── Edit / delete handlers ────────────────────────────────────────────────

  async function handleSaveEdit() {
    if (!editDraft || !user) return
    setSaving(true)
    await supabase
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
    setView('list')
    setSheet(null)
    await loadAll()
  }

  async function handleDelete() {
    if (!sheet?.customCard || !user) return
    setDeleting(true)
    await supabase
      .from('user_custom_cards')
      .delete()
      .eq('id', sheet.customCard.id)
      .eq('user_id', user.id)
    setDeleting(false)
    setConfirmDelete(false)
    setSheet(null)
    await loadAll()
  }

  // ── Filter counts ─────────────────────────────────────────────────────────

  const counts = {
    all: tiles.length,
    'not-started': tiles.filter((t) => t.status === 'not-started').length,
    learning: tiles.filter((t) => t.status === 'introduced' || t.status === 'learning').length,
    known: tiles.filter((t) => t.status === 'known').length,
  }

  const filtered = tiles.filter((t) => matchesFilter(t.status, filter))

  // ── Edit view ─────────────────────────────────────────────────────────────

  if (view === 'edit' && editDraft) {
    return (
      <div className="min-h-screen bg-bg">
        <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
            <button onClick={() => setView('list')} className="text-muted hover:text-ink transition-colors flex items-center gap-1 text-sm">
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

          <div className="flex gap-3">
            <button onClick={() => setView('list')} disabled={saving} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-ink hover:border-gray-300 bg-white disabled:opacity-40">
              Cancel
            </button>
            <button onClick={handleSaveEdit} disabled={saving} className="flex-1 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl text-sm disabled:opacity-40">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
          <p className="text-xs text-muted text-center">Editing content does not reset your review progress.</p>
        </main>
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="text-muted hover:text-ink transition-colors flex items-center gap-1 text-sm">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dashboard
          </button>
          <span className="text-xs font-medium text-muted uppercase tracking-wider">My cards</span>
          <button onClick={() => navigate('/add-card')} className="text-sm text-accent hover:text-accent-hover font-medium transition-colors">
            + Add
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5">
        {/* Filter chips */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-4 px-4">
          {([
            ['all', 'All'],
            ['not-started', 'Not started'],
            ['learning', 'Learning'],
            ['known', 'Known'],
          ] as [FilterType, string][]).map(([key, label]) => {
            const count = key === 'all' ? counts.all : key === 'not-started' ? counts['not-started'] : key === 'learning' ? counts.learning : counts.known
            const active = filter === key
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? 'bg-accent text-white'
                    : 'bg-white border border-gray-200 text-muted hover:border-gray-300 hover:text-ink'
                }`}
              >
                {label} <span className={active ? 'opacity-70' : 'opacity-50'}>{count}</span>
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted text-sm">Loading…</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((tile) => (
              <CardTile
                key={`${tile.type}-${tile.id}`}
                tile={tile}
                onClick={() => setSheet(tile)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Bottom sheet */}
      {sheet && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => { setSheet(null); setConfirmDelete(false) }}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto">
            <div className="max-w-lg mx-auto px-6 pt-5 pb-8">
              {/* Handle */}
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

              {/* Card header */}
              <div className="flex items-start justify-between mb-1">
                <div>
                  <div className={`font-cjk font-bold ${charFontSize(sheet.text)} text-ink`}>{sheet.text}</div>
                  <div className="text-muted text-sm mt-0.5">{sheet.pinyin}</div>
                  <div className="text-ink text-sm mt-0.5">{sheet.meaning}</div>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`w-2 h-2 rounded-full ${STATUS_DOT[sheet.status]}`} />
                  <span className="text-xs text-muted">{STATUS_LABEL[sheet.status]}</span>
                </div>
              </div>

              {/* Radical */}
              {sheet.radical && (
                <div className="mt-3 rounded-xl bg-gray-50 px-4 py-2.5 text-sm">
                  <span className="text-muted">Radical </span>
                  <span className="font-cjk font-bold text-ink">{sheet.radical}</span>
                  <span className="text-muted"> ({sheet.radical_pinyin}) — {sheet.radical_meaning}</span>
                </div>
              )}

              {/* Mnemonic */}
              <div className="mt-3 rounded-xl bg-gray-50 px-4 py-2.5 text-sm">
                {sheet.mnemonic_type && (
                  <span className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded mr-1.5 mb-1 ${
                    sheet.mnemonic_type === 'C' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {sheet.mnemonic_type === 'C' ? 'Component' : 'Hook'}
                  </span>
                )}
                <span className="text-ink">{sheet.mnemonic}</span>
              </div>

              {/* Example */}
              {sheet.example && (
                <div className="mt-3 rounded-xl bg-gray-50 px-4 py-2.5 text-sm space-y-0.5">
                  <div className="font-cjk font-bold text-ink">
                    {sheet.example.split(sheet.text).map((part, i, arr) => (
                      <span key={i}>
                        {part}
                        {i < arr.length - 1 && <span className="text-red-600">{sheet.text}</span>}
                      </span>
                    ))}
                  </div>
                  <div className="text-muted">{sheet.example_pinyin}</div>
                  <div className="text-ink">{sheet.example_english}</div>
                </div>
              )}

              {/* Custom card actions */}
              {sheet.type === 'custom' && !confirmDelete && (
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      setEditDraft({ ...sheet.customCard! })
                      setView('edit')
                    }}
                    className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-ink hover:border-gray-300 bg-white font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex-1 py-3 border border-red-200 rounded-xl text-sm text-red-500 hover:border-red-300 hover:text-red-600 bg-white font-medium"
                  >
                    Delete
                  </button>
                </div>
              )}

              {/* Delete confirmation */}
              {confirmDelete && (
                <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-4 space-y-3">
                  <p className="text-sm text-ink font-medium">Delete "{sheet.text}"?</p>
                  <p className="text-xs text-muted">This permanently deletes the card and all its review history.</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-ink bg-white disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium disabled:opacity-40"
                    >
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Tile ──────────────────────────────────────────────────────────────────────

function CardTile({ tile, onClick }: { tile: TileData; onClick: () => void }) {
  const tone = tile.is_phrase ? 0 : detectTone(tile.pinyin)
  const style = TONE_STYLES[tone]

  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border-2 p-3 text-left w-full transition-colors ${style.card}`}
    >
      {/* Status dot */}
      <div className="flex justify-end mb-1">
        <span className={`w-2 h-2 rounded-full ${STATUS_DOT[tile.status]}`} />
      </div>

      {/* Character */}
      <div className={`font-cjk font-bold leading-none ${charFontSize(tile.text)} ${style.hanzi} mb-2`}>
        {tile.text}
      </div>

      {/* Pinyin + meaning */}
      <div className="text-xs text-muted leading-snug">{tile.pinyin}</div>
      <div className="text-xs text-ink leading-snug mt-0.5 line-clamp-2">{tile.meaning}</div>

      {/* Example sentence */}
      {tile.example && (
        <div className="mt-2 pt-2 border-t border-current border-opacity-10 space-y-0.5">
          <div className="text-xs font-cjk font-medium text-ink leading-snug">
            {tile.example.split(tile.text).map((part, i, arr) => (
              <span key={i}>
                {part}
                {i < arr.length - 1 && <span className="text-red-500">{tile.text}</span>}
              </span>
            ))}
          </div>
          <div className="text-xs text-muted leading-snug line-clamp-1">{tile.example_pinyin}</div>
          <div className="text-xs text-ink leading-snug line-clamp-1">{tile.example_english}</div>
        </div>
      )}
    </button>
  )
}
