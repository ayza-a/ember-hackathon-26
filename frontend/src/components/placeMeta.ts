// OWNER: workstream 4 (Discovery). Category display + walking-time helpers shared by the Discovery components.

export const CATEGORIES: Record<string, { emoji: string; label: string }> = {
  cafe: { emoji: '☕', label: 'Café' },
  food: { emoji: '🍽️', label: 'Food' },
  pub: { emoji: '🍺', label: 'Pub' },
  castle: { emoji: '🏰', label: 'Castle' },
  viewpoint: { emoji: '🌄', label: 'Viewpoint' },
  walk: { emoji: '🥾', label: 'Walk' },
  park: { emoji: '🌳', label: 'Park' },
  museum: { emoji: '🏛️', label: 'Museum' },
  attraction: { emoji: '✨', label: 'Sight' },
  shop: { emoji: '🛍️', label: 'Shop' },
}

export const categoryOrder = Object.keys(CATEGORIES)

export const categoryMeta = (c: string) => CATEGORIES[c] ?? { emoji: '📍', label: c }

const WALK_M_PER_MIN = 80 // ~4.8 km/h

export const walkMin = (m: number) => Math.max(1, Math.round(m / WALK_M_PER_MIN))

export const duration = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}
