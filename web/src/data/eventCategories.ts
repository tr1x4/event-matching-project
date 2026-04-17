/** Категории событий (отдельно от интересов профиля). `icon` — slug иконки из InterestHeroIcon */
export type EventCategoryDef = {
  slug: string
  label_ru: string
  icon: string
}

export const EVENT_CATEGORIES: EventCategoryDef[] = [
  { slug: 'music_events', label_ru: 'Музыка и концерты', icon: 'music' },
  { slug: 'sport_outdoor', label_ru: 'Спорт на улице', icon: 'sport' },
  { slug: 'food_tasting', label_ru: 'Еда и дегустации', icon: 'cooking' },
  { slug: 'board_games_night', label_ru: 'Настольные игры', icon: 'boardgames' },
  { slug: 'cinema_club', label_ru: 'Кино и просмотры', icon: 'movies' },
  { slug: 'theater_goers', label_ru: 'Театр', icon: 'theater' },
  { slug: 'photo_walk', label_ru: 'Фото и прогулки', icon: 'photo' },
  { slug: 'running_group', label_ru: 'Бег и кардио', icon: 'fitness' },
  { slug: 'yoga_morning', label_ru: 'Йога и осознанность', icon: 'yoga' },
  { slug: 'tech_meetup', label_ru: 'IT и технологии', icon: 'tech' },
  { slug: 'startup_pitch', label_ru: 'Стартапы и питчи', icon: 'startup' },
  { slug: 'books_club', label_ru: 'Книги и клубы чтения', icon: 'books' },
  { slug: 'languages_exchange', label_ru: 'Языки и практика', icon: 'languages' },
  { slug: 'volunteer_day', label_ru: 'Волонтёрство', icon: 'volunteer' },
  { slug: 'pet_meetup', label_ru: 'Питомцы и прогулки', icon: 'pets' },
  { slug: 'hiking_weekend', label_ru: 'Походы и тропы', icon: 'hiking' },
  { slug: 'museum_tour', label_ru: 'Музеи и экскурсии', icon: 'history' },
  { slug: 'concert_live', label_ru: 'Живые выступления', icon: 'music' },
  { slug: 'dance_social', label_ru: 'Танцы', icon: 'dance' },
  { slug: 'fitness_workout', label_ru: 'Фитнес и зал', icon: 'fitness' },
  { slug: 'board_creativity', label_ru: 'Творчество и мастер-классы', icon: 'art' },
  { slug: 'esports_lan', label_ru: 'Киберспорт и LAN', icon: 'board_esports' },
  { slug: 'astronomy_night', label_ru: 'Астрономия и небо', icon: 'board_astronomy' },
  { slug: 'city_quest', label_ru: 'Квесты по городу', icon: 'travel' },
  { slug: 'karaoke_night', label_ru: 'Караоке', icon: 'music' },
  { slug: 'camping_trip', label_ru: 'Кемпинг и палатки', icon: 'nature' },
  { slug: 'masterclass_cooking', label_ru: 'Кулинарные мастер-классы', icon: 'cooking' },
  { slug: 'art_workshop', label_ru: 'Арт и рисование', icon: 'art' },
  { slug: 'meditation_group', label_ru: 'Медитация', icon: 'yoga' },
  { slug: 'cycling_ride', label_ru: 'Велопрогулки', icon: 'sport' },
  { slug: 'charity_run', label_ru: 'Благотворительные забеги', icon: 'volunteer' },
  { slug: 'quiz_night', label_ru: 'Квизы и викторины', icon: 'games' },
  { slug: 'open_air', label_ru: 'Открытые площадки', icon: 'nature' },
  { slug: 'jazz_session', label_ru: 'Джаз и сессии', icon: 'music' },
  { slug: 'crafts_fair', label_ru: 'Ремёсла и маркеты', icon: 'design' },
  { slug: 'science_cafe', label_ru: 'Наука и лекции', icon: 'science' },
  { slug: 'history_walk', label_ru: 'Исторические маршруты', icon: 'history' },
  { slug: 'comedy_standup', label_ru: 'Стендап и юмор', icon: 'theater' },
  { slug: 'fashion_swap', label_ru: 'Мода и свопы', icon: 'design' },
  { slug: 'wine_tasting', label_ru: 'Вино и дегустации', icon: 'cooking' },
  { slug: 'kids_play', label_ru: 'Семейно и с детьми', icon: 'parenting' },
]

const bySlug = new Map(EVENT_CATEGORIES.map((c) => [c.slug, c]))

/** Старые slug из интересов — для событий, созданных до выделения категорий */
const LEGACY_LABEL_RU: Record<string, string> = {
  music: 'Музыка',
  sport: 'Спорт',
  travel: 'Путешествия',
  movies: 'Кино',
  books: 'Книги',
  games: 'Игры',
  photo: 'Фото',
  cooking: 'Кулинария',
  tech: 'Технологии',
  science: 'Наука',
  art: 'Искусство',
  dance: 'Танцы',
  theater: 'Театр',
  volunteer: 'Волонтёрство',
  pets: 'Питомцы',
  nature: 'Природа',
  fitness: 'Фитнес',
  yoga: 'Йога',
  boardgames: 'Настольные игры',
  startup: 'Стартапы',
  invest: 'Инвестиции',
  design: 'Дизайн',
  languages: 'Языки',
  history: 'История',
  board_ski: 'Зимний спорт',
  hiking: 'Походы',
  board_water: 'Водный спорт',
  board_motor: 'Моторный спорт',
  board_astronomy: 'Астрономия',
  board_esports: 'Киберспорт',
}

export function eventCategoryLabel(slug: string | null | undefined): string {
  if (!slug) return ''
  return bySlug.get(slug)?.label_ru ?? LEGACY_LABEL_RU[slug] ?? slug
}

export function eventCategoryIconSlug(slug: string | null | undefined): string {
  if (!slug) return 'music'
  const hit = bySlug.get(slug)
  if (hit) return hit.icon
  return slug
}
