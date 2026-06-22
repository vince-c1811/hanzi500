import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { Character, UserCard, UserCustomCard } from '../lib/database.types'
import { toReviewItem } from '../lib/database.types'
import type { ReviewItem } from '../lib/database.types'
import CharacterCard from '../components/CharacterCard'
import { dbCardToFsrs, newCard, cardToDbFields, Rating, gradeCard } from '../lib/fsrs'
import type { Grade } from '../lib/fsrs'
import { addStudySeconds } from '../lib/studyTime'

type Phase = 'loading' | 'learn' | 'review' | 'summary' | 'allcaughtup'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

interface SessionSummary {
  reviewsDone: number
  newLearned: number
  knownCount: number
}

export default function StudyPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const extraMode = searchParams.get('extra') === '1'

  const [phase, setPhase] = useState<Phase>('loading')
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([])
  const [newBatch, setNewBatch] = useState<Character[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [learnIndex, setLearnIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [reviewsDone, setReviewsDone] = useState(0)
  const sessionStartRef = useRef<number>(Date.now())

  useEffect(() => {
    sessionStartRef.current = Date.now()
    return () => {
      const elapsed = Math.round((Date.now() - sessionStartRef.current) / 1000)
      if (elapsed > 3) addStudySeconds(elapsed)
    }
  }, [])

  useEffect(() => {
    if (user) buildQueue()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Resolve a list of user_cards into ReviewItems by fetching character/custom data
  async function resolveCards(cards: UserCard[]): Promise<ReviewItem[]> {
    if (cards.length === 0) return []

    const charIds = cards.map((c) => c.character_id).filter((id): id is number => id !== null)
    const customIds = cards.map((c) => c.custom_card_id).filter((id): id is string => id !== null)

    const [charsRes, customRes] = await Promise.all([
      charIds.length > 0
        ? supabase.from('characters').select('*').in('id', charIds)
        : Promise.resolve({ data: [] }),
      customIds.length > 0
        ? supabase.from('user_custom_cards').select('*').in('id', customIds)
        : Promise.resolve({ data: [] }),
    ])

    const charMap = new Map((charsRes.data as Character[] ?? []).map((c) => [c.id, c]))
    const customMap = new Map((customRes.data as UserCustomCard[] ?? []).map((c) => [c.id, c]))

    return cards.flatMap((card) => {
      if (card.character_id !== null) {
        const character = charMap.get(card.character_id)
        return character ? [toReviewItem(card, character, null)] : []
      }
      if (card.custom_card_id !== null) {
        const custom = customMap.get(card.custom_card_id)
        return custom ? [toReviewItem(card, null, custom)] : []
      }
      return []
    })
  }

  async function buildQueue() {
    if (!user) return

    const { data: progressRows } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', user.id)

    let dailyLimit = 8
    if (!progressRows || progressRows.length === 0) {
      await supabase.from('user_progress').insert({
        user_id: user.id,
        daily_new_card_limit: 8,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
    } else {
      dailyLimit = progressRows[0]?.daily_new_card_limit ?? 8
    }

    const now = new Date().toISOString()

    // All due cards (core + custom), shuffled
    const { data: dueCards } = await supabase
      .from('user_cards')
      .select('*')
      .eq('user_id', user.id)
      .lte('due', now)
      .order('due', { ascending: true })

    const dueItems = shuffle(await resolveCards((dueCards as UserCard[]) ?? []))

    // New core cards for today (custom cards bypass the cap — they appear via due queue)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data: todayCards } = await supabase
      .from('user_cards')
      .select('id')
      .eq('user_id', user.id)
      .not('character_id', 'is', null)   // only core cards count toward daily cap
      .gte('created_at', todayStart.toISOString())

    const introducedToday = todayCards?.length ?? 0
    const newCardSlots = extraMode ? dailyLimit : Math.max(0, dailyLimit - introducedToday)

    let newChars: Character[] = []
    if (newCardSlots > 0) {
      const { data: allCards } = await supabase
        .from('user_cards')
        .select('character_id')
        .eq('user_id', user.id)
        .not('character_id', 'is', null)

      const knownIds = new Set<number>(
        (allCards ?? [])
          .map((c: { character_id: number | null }) => c.character_id)
          .filter((id): id is number => id !== null)
      )

      const { data: candidates } = await supabase
        .from('characters')
        .select('*')
        .order('id', { ascending: true })
        .limit(newCardSlots + knownIds.size + 50)

      newChars = ((candidates as Character[]) ?? []).filter((c) => !knownIds.has(c.id)).slice(0, newCardSlots)
    }

    // Practice mode: nothing due, no new cards
    if (dueItems.length === 0 && newChars.length === 0) {
      const { data: allCards } = await supabase
        .from('user_cards')
        .select('*')
        .eq('user_id', user.id)
        .order('due', { ascending: true })

      const practiceQueue = shuffle(await resolveCards((allCards as UserCard[]) ?? []))

      if (practiceQueue.length === 0) {
        setPhase('allcaughtup')
        return
      }

      setReviewQueue(practiceQueue)
      setNewBatch([])
      setPhase('review')
      return
    }

    setReviewQueue(dueItems)
    setNewBatch(newChars)
    setPhase(dueItems.length > 0 ? 'review' : 'learn')
  }

  // ── Review phase ──────────────────────────────────────────────────────────

  async function handleGrade(rating: Grade) {
    if (!user) return
    const item = reviewQueue[reviewIndex]
    if (!item) return

    const now = new Date()
    const fsrsCard = dbCardToFsrs(item.userCard)
    const updatedCard = gradeCard(fsrsCard, rating, now)
    const fields = cardToDbFields(updatedCard)

    await supabase
      .from('user_cards')
      .update(fields)
      .eq('id', item.userCard.id)

    await supabase.from('review_log').insert({
      user_id: user.id,
      character_id: item.userCard.character_id ?? null,
      custom_card_id: item.userCard.custom_card_id ?? null,
      rating,
      state_before: item.userCard as unknown as Record<string, unknown>,
      state_after: fields as unknown as Record<string, unknown>,
    })

    const nextReviewsDone = reviewsDone + 1
    setReviewsDone(nextReviewsDone)
    setShowAnswer(false)

    const nextIndex = reviewIndex + 1
    if (nextIndex < reviewQueue.length) {
      setReviewIndex(nextIndex)
    } else if (newBatch.length > 0) {
      setPhase('learn')
    } else {
      await showSummary(nextReviewsDone, 0)
    }
  }

  // ── Learn phase ───────────────────────────────────────────────────────────

  async function handleGotIt() {
    if (!user) return

    const nextIndex = learnIndex + 1
    if (nextIndex < newBatch.length) {
      setLearnIndex(nextIndex)
      return
    }

    const emptyCard = newCard()
    const rows = newBatch.map((c) => ({
      user_id: user.id,
      character_id: c.id,
      custom_card_id: null,
      stability: emptyCard.stability,
      difficulty: emptyCard.difficulty,
      elapsed_days: emptyCard.elapsed_days,
      scheduled_days: emptyCard.scheduled_days,
      reps: emptyCard.reps,
      lapses: emptyCard.lapses,
      state: emptyCard.state as number,
      due: new Date().toISOString(),
      last_review: null,
    }))

    await supabase.from('user_cards').upsert(rows, { onConflict: 'user_id,character_id' })
    await showSummary(reviewsDone, newBatch.length)
  }

  async function showSummary(reviews: number, newLearned: number) {
    if (!user) return

    const { data: allCards } = await supabase
      .from('user_cards')
      .select('state')
      .eq('user_id', user.id)

    const knownCount = ((allCards ?? []) as { state: number }[]).filter(
      (c) => c.state === 2 || c.state === 3,
    ).length
    setSummary({ reviewsDone: reviews, newLearned, knownCount })
    setPhase('summary')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <PageShell onBack={() => navigate('/')}>
        <div className="flex items-center justify-center h-64 text-muted text-sm">Building queue…</div>
      </PageShell>
    )
  }

  if (phase === 'allcaughtup') {
    return (
      <PageShell onBack={() => navigate('/')}>
        <div className="text-center py-20">
          <div className="text-5xl mb-4">✓</div>
          <div className="text-xl font-semibold text-ink mb-2">All caught up!</div>
          <div className="text-muted text-sm mb-8">No reviews due and no new cards for today.</div>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2.5 bg-accent text-white rounded-xl font-medium hover:bg-accent-hover transition-colors"
          >
            Back to dashboard
          </button>
        </div>
      </PageShell>
    )
  }

  if (phase === 'summary' && summary) {
    return (
      <PageShell onBack={() => navigate('/')}>
        <div className="text-center py-12">
          <div className="text-5xl mb-6">🎉</div>
          <div className="text-2xl font-bold text-ink mb-8">Session complete</div>
          <div className="grid grid-cols-3 gap-3 mb-8">
            <SummaryCard value={summary.reviewsDone} label="Reviews" />
            <SummaryCard value={summary.newLearned} label="New learned" />
            <SummaryCard value={summary.knownCount} label="Known total" />
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-8 py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-hover transition-colors"
          >
            Done
          </button>
        </div>
      </PageShell>
    )
  }

  if (phase === 'learn') {
    const character = newBatch[learnIndex]
    return (
      <PageShell
        onBack={() => navigate('/')}
        progress={`${learnIndex + 1} / ${newBatch.length} new`}
        label="Learning"
      >
        <div className="flex-1 py-4 overflow-y-auto">
          <CharacterCard character={character} showFull />
        </div>
        <div className="pt-4 pb-2">
          <button
            onClick={handleGotIt}
            className="w-full py-4 bg-accent hover:bg-accent-hover text-white font-semibold rounded-2xl transition-colors"
          >
            {learnIndex < newBatch.length - 1 ? 'Got it →' : 'Finish learning'}
          </button>
        </div>
      </PageShell>
    )
  }

  if (phase === 'review') {
    const item = reviewQueue[reviewIndex]
    const gradeButtons: { rating: Grade; label: string; color: string }[] = [
      { rating: Rating.Again, label: 'Again', color: 'bg-red-100 text-red-700 hover:bg-red-200' },
      { rating: Rating.Hard, label: 'Hard', color: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
      { rating: Rating.Good, label: 'Good', color: 'bg-green-100 text-green-700 hover:bg-green-200' },
      { rating: Rating.Easy, label: 'Easy', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
    ]

    return (
      <PageShell
        onBack={() => navigate('/')}
        progress={`${reviewIndex + 1} / ${reviewQueue.length} reviews`}
        label="Review"
      >
        <div className="flex-1 py-4 overflow-y-auto">
          {item.character ? (
            <CharacterCard character={item.character} showFull={showAnswer} />
          ) : (
            <CharacterCard customCard={item.customCard!} showFull={showAnswer} />
          )}
        </div>

        <div className="pt-4 pb-2">
          {!showAnswer ? (
            <button
              onClick={() => setShowAnswer(true)}
              className="w-full py-4 bg-surface hover:bg-gray-200 text-ink font-semibold rounded-2xl transition-colors border border-gray-200"
            >
              Show answer
            </button>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {gradeButtons.map(({ rating, label, color }) => (
                <button
                  key={label}
                  onClick={() => handleGrade(rating)}
                  className={`py-3 rounded-xl font-medium text-sm transition-colors ${color}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </PageShell>
    )
  }

  return null
}

function PageShell({
  children,
  onBack,
  progress,
  label,
}: {
  children: React.ReactNode
  onBack: () => void
  progress?: string
  label?: string
}) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-muted hover:text-ink transition-colors flex items-center gap-1 text-sm"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dashboard
          </button>
          {label && (
            <span className="text-xs font-medium text-muted uppercase tracking-wider">{label}</span>
          )}
          {progress && <span className="text-xs text-muted">{progress}</span>}
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-6 flex flex-col flex-1 w-full">{children}</main>
    </div>
  )
}

function SummaryCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
      <div className="text-3xl font-bold text-ink">{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  )
}
