const KEY = 'hanzi500_study_time'

interface StoredTime {
  date: string   // 'YYYY-MM-DD'
  seconds: number
}

function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA').format(new Date())
}

export function addStudySeconds(seconds: number) {
  if (seconds <= 0) return
  const today = todayKey()
  let stored: StoredTime = { date: today, seconds: 0 }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed: StoredTime = JSON.parse(raw)
      if (parsed.date === today) stored = parsed
    }
  } catch { /* ignore */ }
  stored.seconds += Math.round(seconds)
  localStorage.setItem(KEY, JSON.stringify(stored))
}

export function getTodayStudySeconds(): number {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return 0
    const parsed: StoredTime = JSON.parse(raw)
    return parsed.date === todayKey() ? parsed.seconds : 0
  } catch {
    return 0
  }
}

// Reviews more than 5 minutes apart are treated as separate sessions.
// Sum active session spans + 15 s per review as overhead.
export function calcStudySeconds(timestampsMs: number[]): number {
  if (timestampsMs.length === 0) return 0
  const sorted = [...timestampsMs].sort((a, b) => a - b)
  const SESSION_GAP_MS = 5 * 60 * 1000
  let spanMs = 0
  let sessionStart = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - prev > SESSION_GAP_MS) {
      spanMs += prev - sessionStart
      sessionStart = sorted[i]
    }
    prev = sorted[i]
  }
  spanMs += prev - sessionStart
  return Math.round((spanMs + sorted.length * 15_000) / 1000)
}

export function formatStudyTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}
