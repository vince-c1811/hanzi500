import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs'
import type { Card, Grade } from 'ts-fsrs'
import type { UserCard } from './database.types'

export { Rating, State }
export type { Grade }

const params = generatorParameters()
export const scheduler = fsrs(params)

export function dbCardToFsrs(c: UserCard): Card {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as State,
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  }
}

export function gradeCard(card: Card, rating: Grade, now: Date): Card {
  const result = scheduler.repeat(card, now)
  return result[rating].card
}

export function newCard(): Card {
  return createEmptyCard()
}

export function cardToDbFields(card: Card) {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number,
    due: card.due.toISOString(),
    last_review: card.last_review?.toISOString() ?? null,
  }
}
