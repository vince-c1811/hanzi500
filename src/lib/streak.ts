/** Returns the number of consecutive days (up to and including today) with study activity. */
export function getStreakDays(
  reviewTimestamps: string[],
  cardCreatedTimestamps: string[],
  timezone: string,
): number {
  const toLocalDate = (iso: string) => {
    const d = new Date(iso)
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d)
  }

  const activeDays = new Set<string>()
  for (const ts of reviewTimestamps) activeDays.add(toLocalDate(ts))
  for (const ts of cardCreatedTimestamps) activeDays.add(toLocalDate(ts))

  if (activeDays.size === 0) return 0

  let streak = 0
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
  const check = new Date(today)

  while (true) {
    const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(check)
    if (!activeDays.has(dateStr)) break
    streak++
    check.setDate(check.getDate() - 1)
  }

  return streak
}
