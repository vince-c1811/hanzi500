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

export function formatStudyTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}
