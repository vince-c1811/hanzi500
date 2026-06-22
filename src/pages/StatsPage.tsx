import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { calcStudySeconds } from '../lib/studyTime'

interface DayPoint {
  date: string          // 'Jun 22'
  isoDate: string       // '2026-06-22'
  newCards: number
  reviews: number
  studyMinutes: number
  cumulativeIntroduced: number
  cumulativeKnown: number
}

interface Projections {
  totalIntroduced: number
  totalKnown: number
  avgNewPerDay: number   // 7-day rolling
  daysTo500: number | null
  projectedDate: string | null
}

function toLocalDate(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso))
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function last30Days(): string[] {
  const days: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(new Intl.DateTimeFormat('en-CA').format(d))
  }
  return days
}

export default function StatsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [days, setDays] = useState<DayPoint[]>([])
  const [proj, setProj] = useState<Projections | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) loadStats()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadStats() {
    if (!user) return
    setLoading(true)

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

    // Fetch all user_cards and review_log
    const [{ data: cardsData }, { data: logsData }] = await Promise.all([
      supabase.from('user_cards').select('created_at, state, character_id').eq('user_id', user.id),
      supabase.from('review_log').select('reviewed_at, state_after, character_id').eq('user_id', user.id).order('reviewed_at', { ascending: true }),
    ])

    const cards = (cardsData ?? []) as { created_at: string; state: number; character_id: number }[]
    const logs = (logsData ?? []) as { reviewed_at: string; state_after: Record<string, unknown> | null; character_id: number }[]

    // ── Per-day buckets ───────────────────────────────────────────────────────

    // New cards per day
    const newPerDay = new Map<string, number>()
    for (const c of cards) {
      const d = toLocalDate(c.created_at, tz)
      newPerDay.set(d, (newPerDay.get(d) ?? 0) + 1)
    }

    // Reviews per day + all timestamps per day for session-aware study time
    const reviewsPerDay = new Map<string, number>()
    const timestampsPerDay = new Map<string, number[]>()
    for (const l of logs) {
      const d = toLocalDate(l.reviewed_at, tz)
      const ts = new Date(l.reviewed_at).getTime()
      reviewsPerDay.set(d, (reviewsPerDay.get(d) ?? 0) + 1)
      if (!timestampsPerDay.has(d)) timestampsPerDay.set(d, [])
      timestampsPerDay.get(d)!.push(ts)
    }

    // First time each character reached "known" (state >= 2)
    const knownOnDay = new Map<string, Set<number>>()
    for (const l of logs) {
      const stateAfter = l.state_after as { state?: number } | null
      if (stateAfter && (stateAfter.state === 2 || stateAfter.state === 3)) {
        const d = toLocalDate(l.reviewed_at, tz)
        if (!knownOnDay.has(d)) knownOnDay.set(d, new Set())
        knownOnDay.get(d)!.add(l.character_id)
      }
    }
    // Deduplicate: only count first time a card became known
    const everKnown = new Set<number>()
    const newlyKnownPerDay = new Map<string, number>()
    // Process in date order
    const allDatesWithKnown = [...knownOnDay.keys()].sort()
    for (const d of allDatesWithKnown) {
      let count = 0
      for (const charId of knownOnDay.get(d)!) {
        if (!everKnown.has(charId)) { everKnown.add(charId); count++ }
      }
      newlyKnownPerDay.set(d, count)
    }

    // ── Build last-30-days series ─────────────────────────────────────────────
    const dates = last30Days()
    let cumIntroduced = 0
    let cumKnown = 0

    // Pre-sum everything before the window
    const windowStart = dates[0]
    for (const [d, n] of newPerDay) if (d < windowStart) cumIntroduced += n
    for (const [d, n] of newlyKnownPerDay) if (d < windowStart) cumKnown += n

    const series: DayPoint[] = dates.map((iso) => {
      cumIntroduced += newPerDay.get(iso) ?? 0
      cumKnown += newlyKnownPerDay.get(iso) ?? 0

      const reviews = reviewsPerDay.get(iso) ?? 0
      const studyMinutes = Math.round(calcStudySeconds(timestampsPerDay.get(iso) ?? []) / 60)

      return {
        date: formatDate(iso),
        isoDate: iso,
        newCards: newPerDay.get(iso) ?? 0,
        reviews,
        studyMinutes,
        cumulativeIntroduced: cumIntroduced,
        cumulativeKnown: cumKnown,
      }
    })

    // ── Projections ───────────────────────────────────────────────────────────
    const totalIntroduced = cards.length
    const totalKnown = cards.filter((c) => c.state === 2 || c.state === 3).length

    // 7-day rolling average of new cards
    const last7 = dates.slice(-7)
    const newLast7 = last7.reduce((s, d) => s + (newPerDay.get(d) ?? 0), 0)
    const avgNewPerDay = newLast7 / 7

    let daysTo500: number | null = null
    let projectedDate: string | null = null
    if (avgNewPerDay > 0) {
      daysTo500 = Math.ceil((500 - totalIntroduced) / avgNewPerDay)
      const pd = new Date()
      pd.setDate(pd.getDate() + daysTo500)
      projectedDate = pd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    }

    setDays(series)
    setProj({ totalIntroduced, totalKnown, avgNewPerDay, daysTo500, projectedDate })
    setLoading(false)
  }

  if (loading) {
    return (
      <PageShell onBack={() => navigate('/')}>
        <div className="flex items-center justify-center h-64 text-muted text-sm">Loading stats…</div>
      </PageShell>
    )
  }

  const p = proj!
  const hasData = days.some((d) => d.newCards > 0 || d.reviews > 0)

  return (
    <PageShell onBack={() => navigate('/')}>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <MiniStat label="Introduced" value={`${p.totalIntroduced} / 500`} />
        <MiniStat label="Known" value={String(p.totalKnown)} accent />
        <MiniStat
          label="Avg new / day"
          value={p.avgNewPerDay > 0 ? p.avgNewPerDay.toFixed(1) : '—'}
          sub="last 7 days"
        />
        <MiniStat
          label="Days to 500"
          value={p.daysTo500 != null ? String(p.daysTo500) : '—'}
          sub={p.projectedDate ?? 'start learning to project'}
        />
      </div>

      {!hasData ? (
        <div className="text-center py-16 text-muted text-sm">
          Complete a study session to see charts here.
        </div>
      ) : (
        <div className="space-y-10">
          {/* Chart 1: Cumulative progress */}
          <Section title="Progress over time" sub="Cumulative characters introduced vs. committed to memory">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={days} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradIntro" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F6EF7" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#4F6EF7" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradKnown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ee" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={false} domain={[0, 500]} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #f0f0ee' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="cumulativeIntroduced" name="Introduced" stroke="#4F6EF7" fill="url(#gradIntro)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="cumulativeKnown" name="Known" stroke="#10b981" fill="url(#gradKnown)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Section>

          {/* Chart 2: Daily new cards */}
          <Section title="New cards per day" sub="Characters introduced each day (last 30 days)">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={days} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ee" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #f0f0ee' }} />
                <Bar dataKey="newCards" name="New cards" fill="#4F6EF7" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* Chart 3: Reviews + study time */}
          <Section title="Daily study activity" sub="Reviews completed and estimated study time">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={days} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ee" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis yAxisId="reviews" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis yAxisId="time" orientation="right" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={false} unit="m" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #f0f0ee' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="reviews" dataKey="reviews" name="Reviews" fill="#6B7280" radius={[3, 3, 0, 0]} opacity={0.6} />
                <Bar yAxisId="time" dataKey="studyMinutes" name="Minutes" fill="#4F6EF7" radius={[3, 3, 0, 0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* Projection detail */}
          {p.avgNewPerDay > 0 && (
            <Section title="Projection" sub="Based on your 7-day average rate">
              <div className="space-y-2 text-sm">
                <ProjectionRow label="Current rate" value={`${p.avgNewPerDay.toFixed(1)} new cards / day`} />
                <ProjectionRow label="Characters remaining" value={`${500 - p.totalIntroduced} of 500`} />
                <ProjectionRow label="Days until all 500 introduced" value={p.daysTo500 != null ? `${p.daysTo500} days` : '—'} />
                <ProjectionRow label="Projected completion" value={p.projectedDate ?? '—'} highlight />
                <p className="text-xs text-muted pt-2">
                  "Known" lags behind introduction by the time it takes FSRS to mature each card through its review intervals — typically a few weeks to months per card.
                </p>
              </div>
            </Section>
          )}
        </div>
      )}
    </PageShell>
  )
}

function PageShell({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={onBack} className="text-muted hover:text-ink transition-colors flex items-center gap-1 text-sm">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dashboard
          </button>
          <span className="text-sm font-semibold text-ink">Stats</span>
          <div className="w-16" />
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}

function MiniStat({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? 'bg-accent border-accent' : 'bg-white border-gray-100'}`}>
      <div className={`text-2xl font-bold ${accent ? 'text-white' : 'text-ink'}`}>{value}</div>
      <div className={`text-xs mt-0.5 ${accent ? 'text-white/80' : 'text-muted'}`}>{label}</div>
      {sub && <div className={`text-xs mt-1 ${accent ? 'text-white/60' : 'text-muted/70'}`}>{sub}</div>}
    </div>
  )
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="mb-4">
        <div className="font-semibold text-ink text-sm">{title}</div>
        <div className="text-xs text-muted mt-0.5">{sub}</div>
      </div>
      {children}
    </div>
  )
}

function ProjectionRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-muted">{label}</span>
      <span className={`font-medium ${highlight ? 'text-accent' : 'text-ink'}`}>{value}</span>
    </div>
  )
}
