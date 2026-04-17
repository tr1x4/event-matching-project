import { InterestHeroIcon } from './InterestHeroIcon'
import { eventCategoryIconSlug } from '../data/eventCategories'

/** Иконка категории события (slug категории → иконка как у интересов). */
export function EventCategoryIcon({ slug, className }: { slug: string; className?: string }) {
  return <InterestHeroIcon slug={eventCategoryIconSlug(slug)} className={className} />
}
