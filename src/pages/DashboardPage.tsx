import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import type { UserCard, UserProgress } from '../lib/database.types'
import { getStreakDays } from '../lib/streak'
import { calcStudySeconds, formatStudyTime } from '../lib/studyTime'

interface Stats {
  totalIntroduced: number
  totalDeck: number
  dueReviews: number
  newAvailableToday: number
  knownCount: number
  streak: number
  dailyNewCardLimit: number
  studySecondsToday: number
}

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingLimit, setSavingLimit] = useState(false)
  const [limitInput, setLimitInput] = useState('8')

  useEffect(() => {
    if (user) loadStats()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])


  async function loadStats() {
    if (!user) return
    setLoading(true)

    // Ensure user_progress row exists
    const { data: progressRows } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', user.id)

    let progress: UserProgress | undefined = (progressRows as UserProgress[])?.[0]
    if (!progress) {
      const { data: inserted } = await supabase
        .from('user_progress')
        .insert({
          user_id: user.id,
          daily_new_card_limit: 8,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        .select()
        .single()
      progress = inserted as UserProgress
    }
    const dailyNewCardLimit = progress?.daily_new_card_limit ?? 8
    setLimitInput(String(dailyNewCardLimit))

    // All user cards
    const { data: allCardsData } = await supabase
      .from('user_cards')
      .select('*')
      .eq('user_id', user.id)

    const cards = (allCardsData as UserCard[]) ?? []
    const totalIntroduced = cards.length

    const { count: customCardCount } = await supabase
      .from('user_custom_cards')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
    const totalDeck = 500 + (customCardCount ?? 0)

    // Due cards — includes New state so cards just learned show up immediately
    const now = new Date().toISOString()
    const dueReviews = cards.filter((c) => c.due <= now).length

    // New cards introduced today
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const introducedToday = cards.filter((c) => c.created_at >= todayStart.toISOString()).length
    const newAvailableToday = Math.max(0, dailyNewCardLimit - introducedToday)

    // Known: state IN (2=Review, 3=Relearning)
    const knownCount = cards.filter((c) => c.state === 2 || c.state === 3).length

    // Streak + study time today — both derived from review_log
    const { data: logsData } = await supabase
      .from('review_log')
      .select('reviewed_at')
      .eq('user_id', user.id)
      .order('reviewed_at', { ascending: false })

    const timezone = progress?.timezone ?? 'UTC'
    const allTimestamps = ((logsData ?? []) as { reviewed_at: string }[]).map((l) => l.reviewed_at)

    const streak = getStreakDays(allTimestamps, cards.map((c) => c.created_at), timezone)

    // Study time today: session-aware calculation
    const todayTs = allTimestamps
      .filter((ts) => ts >= todayStart.toISOString())
      .map((ts) => new Date(ts).getTime())
    const studySecondsToday = calcStudySeconds(todayTs)

    setStats({ totalIntroduced, totalDeck, dueReviews, newAvailableToday, knownCount, streak, dailyNewCardLimit, studySecondsToday })
    setLoading(false)
  }

  async function saveLimit(value: number) {
    if (!user) return
    setSavingLimit(true)
    await supabase
      .from('user_progress')
      .update({ daily_new_card_limit: value })
      .eq('user_id', user.id)
    setSavingLimit(false)
    setStats((s) => (s ? { ...s, dailyNewCardLimit: value } : s))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-muted text-sm">Loading…</div>
      </div>
    )
  }

  const s = stats!

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-cjk font-bold text-xl text-ink">汉字 500</span>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/stats')} className="text-sm text-muted hover:text-ink transition-colors">
              Stats
            </button>
            <button onClick={() => navigate('/cards')} className="text-sm text-muted hover:text-ink transition-colors">
              My cards
            </button>
            <button onClick={signOut} className="text-sm text-muted hover:text-ink transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Characters introduced" value={`${s.totalIntroduced} / ${s.totalDeck}`} />
          <StatCard label="Known" value={String(s.knownCount)} highlight />
          <StatCard label="Due reviews" value={String(s.dueReviews)} />
          <StatCard label="New cards today" value={String(s.newAvailableToday)} />
        </div>

        {/* Streak + today's study time */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔥</span>
            <div>
              <div className="font-semibold text-ink">{s.streak}-day streak</div>
              <div className="text-xs text-muted">Keep it going!</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-ink">
              {s.studySecondsToday > 0 ? formatStudyTime(s.studySecondsToday) : '—'}
            </div>
            <div className="text-xs text-muted">studied today</div>
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={() => navigate('/study')}
          disabled={s.totalIntroduced === 0 && s.newAvailableToday === 0}
          className="w-full py-4 bg-accent hover:bg-accent-hover disabled:opacity-40 text-white font-semibold rounded-2xl transition-colors text-base"
        >
          {s.dueReviews > 0 || s.newAvailableToday > 0
            ? 'Start studying'
            : s.totalIntroduced > 0
            ? 'Practice (no cards due)'
            : 'Start studying'}
        </button>

        {/* Add custom card */}
        <button
          onClick={() => navigate('/add-card')}
          className="w-full py-2.5 text-sm text-accent hover:text-accent-hover border border-accent/30 hover:border-accent/60 rounded-xl transition-colors bg-white font-medium"
        >
          + Add custom card
        </button>

        {/* Secondary: learn next batch early */}
        {s.newAvailableToday === 0 && s.totalIntroduced < 500 && (
          <button
            onClick={() => navigate('/study?extra=1')}
            className="w-full py-2.5 text-sm text-muted hover:text-ink border border-gray-200 hover:border-gray-300 rounded-xl transition-colors bg-white"
          >
            + Learn next batch early
          </button>
        )}

        {/* Daily new card limit setting */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-sm font-medium text-ink mb-3">Daily new cards</div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={30}
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              onMouseUp={() => saveLimit(Number(limitInput))}
              onTouchEnd={() => saveLimit(Number(limitInput))}
              className="flex-1 accent-accent"
            />
            <span className="text-sm font-medium text-ink w-6 text-center">{limitInput}</span>
            {savingLimit && <span className="text-xs text-muted">Saving…</span>}
          </div>
        </div>
      </main>
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight ? 'bg-accent text-white border-accent' : 'bg-white border-gray-100 text-ink'
      }`}
    >
      <div className={`text-2xl font-bold ${highlight ? 'text-white' : 'text-ink'}`}>{value}</div>
      <div className={`text-xs mt-1 ${highlight ? 'text-white/80' : 'text-muted'}`}>{label}</div>
    </div>
  )
}
